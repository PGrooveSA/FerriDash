import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, gradeLabel, avatarUrl, fmtDate } from "@/lib/format";
import { MONTHS, today } from "@/lib/today";
import { feesOn, onlineMethods, overdueAccounts, remindersOn } from "@/lib/fees";
import { Card, PageHeader, Pager, Empty, StatusChip, StatCard, hrefWith } from "@/components/ui/kit";
import { FormDialog, Filters, DeleteButton, CsvButton } from "@/components/ui/forms";
import { AreaTrend } from "@/components/charts";
import Avatar from "@/components/ui/Avatar";
import { recordPayment, saveFeeStructure, deleteFeeStructure, generateInvoices, addCharge } from "@/app/actions/fees";
import { OnlinePaymentsList, RemindButton } from "../statement/PayOnline";
import FeesOff from "../FeesOff";
import { Wallet, Receipt, AlertTriangle, BadgePercent } from "lucide-react";

export const metadata = { title: "Fees collection" };
const PER_PAGE = 12;

type Row = { learner_id: number; user_id: number | null; av: string | null; first_name: string; last_name: string; admission_number: string; className: string | null; billed: number; paid: number; balance: number; overdue: number };

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  if (!feesOn(ctx.school)) return <FeesOff title="Fees collection" />;
  const sp = await searchParams;
  const year = ctx.school.current_year, t = today();
  const q = sp.q?.trim() ?? "", classId = Number(sp.class) || 0, status = sp.status ?? "", page = Math.max(1, Number(sp.page) || 1);

  // One row per learner with fees billed: this year's billing and payments, and what is owed overall.
  const base = `
    SELECT l.id learner_id, l.user_id, (SELECT avatar_updated_at FROM users WHERE id = l.user_id) av, l.first_name, l.last_name, l.admission_number, c.name className,
      ROUND(SUM(CASE WHEN x.year = ?2 THEN x.amount ELSE 0 END), 2) billed, ROUND(SUM(CASE WHEN x.year = ?2 THEN x.paid ELSE 0 END), 2) paid,
      ROUND(SUM(x.amount - x.paid), 2) balance, ROUND(SUM(CASE WHEN x.due_date < ?5 AND x.amount - x.paid > 0 THEN x.amount - x.paid ELSE 0 END), 2) overdue
    FROM (SELECT i.learner_id, i.year, i.amount, i.due_date, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) paid FROM invoices i WHERE i.school_id = ?1) x
    JOIN learners l ON l.id = x.learner_id LEFT JOIN classes c ON c.id = l.class_id
    WHERE (?3 = 0 OR l.class_id = ?3) AND (?4 = '' OR l.first_name || ' ' || l.last_name LIKE '%' || ?4 || '%' OR l.admission_number LIKE '%' || ?4 || '%')
    GROUP BY l.id, l.user_id, l.first_name, l.last_name, l.admission_number, c.name`;
  const statusSql = ({ paid: "balance <= 0.5", partial: "balance > 0.5 AND paid > 0 AND overdue <= 0.5", overdue: "overdue > 0.5", unpaid: "paid = 0 AND billed > 0" } as Record<string, string>)[status] ?? "TRUE";
  const args = [ctx.schoolId, year, classId, q, t] as const;
  const total = (await get<{ n: number }>(`SELECT COUNT(*) n FROM (${base}) a WHERE ${statusSql}`, ...args))!.n;
  const rows = await all<Row>(`SELECT * FROM (${base}) a WHERE ${statusSql} ORDER BY overdue DESC, last_name, first_name LIMIT ?6 OFFSET ?7`, ...args, PER_PAGE, (page - 1) * PER_PAGE);

  const sums = (await get<{ billed: number; collected: number; exempt: number; outstanding: number; overdue: number }>(`
    SELECT (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE school_id = ?1 AND year = ?2) billed,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE school_id = ?1 AND paid_on LIKE ?4 AND method <> 'Exemption') collected,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE school_id = ?1 AND paid_on LIKE ?4 AND method = 'Exemption') exempt,
      (SELECT COALESCE(SUM(b), 0) FROM (SELECT i.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) b FROM invoices i WHERE i.school_id = ?1) z WHERE b > 0) outstanding,
      (SELECT COALESCE(SUM(b), 0) FROM (SELECT i.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) b FROM invoices i WHERE i.school_id = ?1 AND i.due_date < ?3) z WHERE b > 0) overdue`,
    ctx.schoolId, year, t, `${year}-%`))!;
  const monthly = await all<{ m: string; v: number }>("SELECT substr(paid_on, 6, 2) m, SUM(amount) v FROM payments WHERE school_id = ? AND paid_on LIKE ? AND method <> 'Exemption' GROUP BY m", ctx.schoolId, `${year}-%`);
  const chart = MONTHS.map((name, i) => ({ name, collected: monthly.find((r) => r.m === String(i + 1).padStart(2, "0"))?.v ?? 0 }));
  const classes = await all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, year);
  const structures = await all<{ grade: number; tuition: number; activities: number; other: number }>("SELECT grade, tuition, activities, other FROM fee_structures WHERE school_id = ? AND year = ? ORDER BY grade", ctx.schoolId, year);
  const unbilled = (await get<{ n: number }>(`SELECT COUNT(*) n FROM learners l JOIN classes c ON c.id = l.class_id JOIN fee_structures fs ON fs.school_id = l.school_id AND fs.year = ?1 AND fs.grade = c.grade
    WHERE l.school_id = ?2 AND l.status = 'Active' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.learner_id = l.id AND i.year = ?1 AND i.period IS NOT NULL)`, year, ctx.schoolId))!.n;
  const statusOf = (r: Row) => r.balance <= 0.5 ? (r.balance < -0.5 ? "Credit" : "Paid") : r.overdue > 0.5 ? "Overdue" : r.paid > 0 ? "Partial" : "Not yet due";

  const methods = await onlineMethods(ctx.schoolId);
  const online = await all<{ id: number; provider: string; amount: number; status: string; reason: string | null; created_at: string; who: string }>(`
    SELECT o.id, o.provider, o.amount, o.status, o.reason, o.created_at, l.first_name || ' ' || l.last_name || ' · ' || l.admission_number who
    FROM online_payments o JOIN learners l ON l.id = o.learner_id WHERE o.school_id = ? AND (o.provider_payment_id IS NOT NULL OR o.provider = 'PayFast') ORDER BY o.id DESC LIMIT 15`, ctx.schoolId);
  const overdueList = await overdueAccounts(ctx.schoolId);
  const reminders = remindersOn(ctx.school);

  const csv = [["Learner", "Admission no.", "Class", `Billed ${year}`, `Paid ${year}`, "Balance", "Overdue", "Status"],
    ...rows.map((r) => [`${r.first_name} ${r.last_name}`, r.admission_number, r.className, r.billed.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.overdue.toFixed(2), statusOf(r)])];

  return (
    <>
      <PageHeader title="Fees collection" subtitle={`${year} · all amounts in Rand (ZAR)`}>
        <FormDialog title="Bill learners for the year" triggerLabel="Generate invoices" action={generateInvoices} submitLabel="Create invoices" fields={[
          { name: "plan", label: "How parents pay", type: "select", required: true, defaultValue: "month", options: [{ value: "month", label: "Monthly instalments" }, { value: "term", label: "Per term (due on each term's first day)" }, { value: "year", label: "Once for the whole year" }] },
          { name: "months", label: "Monthly: number of months", type: "select", defaultValue: 10, options: [{ value: 10, label: "10 months (Jan to Oct)" }, { value: 11, label: "11 months (Jan to Nov)" }, { value: 12, label: "12 months (Jan to Dec)" }], half: true },
          { name: "due_day", label: "Monthly: due on day", type: "number", defaultValue: 1, half: true, help: "1 to 28." },
          { name: "due_date", label: "Whole year: due date", type: "date", defaultValue: `${year}-02-28`, help: `Bills each active learner from their grade's fees below (${unbilled} learner${unbilled === 1 ? "" : "s"} not billed yet this year). Learners already billed are skipped.` },
        ]} />
        <FormDialog title="Add a charge for a class" triggerLabel="Charge a class" trigger="button" action={addCharge} submitLabel="Add charge" fields={[
          { name: "class_id", label: "Class", type: "select", required: true, options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { name: "description", label: "Charge", required: true, placeholder: "e.g. Grade 7 camp" },
          { name: "amount", label: "Amount per learner (R)", type: "number", step: "0.01", required: true, half: true },
          { name: "due_date", label: "Due date", type: "date", required: true, defaultValue: t, half: true },
        ]} />
      </PageHeader>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_26rem] gap-6 mb-6">
        <Card title={`Collected per month · ${year}`}><AreaTrend money data={chart} xKey="name" series={[{ key: "collected", name: "Collected", color: "#eab308" }]} /></Card>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label={`Billed ${year}`} value={zar(sums.billed, true)} icon={Receipt} tone="sky" />
          <StatCard label="Collected" value={zar(sums.collected, true)} icon={Wallet} tone="green" hint={sums.billed ? `${Math.round((sums.collected / sums.billed) * 100)}% of this year's billing` : undefined} />
          <StatCard label="Overdue" value={zar(sums.overdue, true)} icon={AlertTriangle} tone="orange" hint={`${overdueList.length} account${overdueList.length === 1 ? "" : "s"} · ${zar(sums.outstanding, true)} outstanding in total`} />
          <StatCard label="Exemptions" value={zar(sums.exempt, true)} icon={BadgePercent} tone="gold" hint="Fee exemption regulations" />
        </div>
      </div>

      <Card>
        <PageHeader title="Learner accounts" subtitle="Record EFT, cash, card and debit-order payments; they are applied to the oldest unpaid fees first.">
          <Filters search={{ name: "q", placeholder: "Search name or admission no.", value: q }} filters={[
            { name: "class", label: "Class", value: classId || "", allLabel: "All classes", options: classes.map((c) => ({ value: c.id, label: c.name })) },
            { name: "status", label: "Status", value: status, allLabel: "All statuses", options: [{ value: "overdue", label: "Overdue" }, { value: "partial", label: "Partly paid, up to date" }, { value: "unpaid", label: "Nothing paid" }, { value: "paid", label: "Paid up" }] },
          ]} />
          <CsvButton filename={`fees-${year}.csv`} rows={csv} />
        </PageHeader>
        {rows.length === 0 ? <Empty title={structures.length ? "No accounts match" : "No fees billed yet"} hint={structures.length ? undefined : "Set each grade's fees below, then Generate invoices."} /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Learner</th><th>Class</th><th>Billed {year}</th><th>Paid {year}</th><th>Balance</th><th>Overdue</th><th>Status</th><th className="text-right">Action</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.learner_id}>
                  <td><div className="flex items-center gap-3"><Avatar first={r.first_name} last={r.last_name} size={36} photo={avatarUrl(r.user_id, r.av)} /><div><p className="font-semibold">{r.first_name} {r.last_name}</p><p className="text-xs muted font-mono">{r.admission_number}</p></div></div></td>
                  <td>{r.className ?? "-"}</td><td>{zar(r.billed, true)}</td><td>{zar(r.paid, true)}</td>
                  <td className="font-semibold">{zar(r.balance)}</td>
                  <td className={r.overdue > 0.5 ? "font-semibold text-rose-600" : "muted"}>{r.overdue > 0.5 ? zar(r.overdue) : "-"}</td>
                  <td><StatusChip status={statusOf(r)} /></td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <FormDialog trigger="button" triggerLabel="Pay" title={`Record payment · ${r.first_name} ${r.last_name}`} hidden={{ learner_id: r.learner_id }} action={recordPayment} submitLabel="Record payment"
                        fields={[
                          { name: "amount", label: "Amount (R)", type: "number", step: "0.01", required: true, defaultValue: r.balance > 0 ? r.balance : undefined, half: true },
                          { name: "paid_on", label: "Date", type: "date", required: true, defaultValue: t, half: true },
                          { name: "method", label: "Method", type: "select", required: true, options: ["EFT", "Cash", "Card", "Debit order", "Exemption"].map((v) => ({ value: v, label: v })), half: true },
                          { name: "reference", label: "Reference", half: true, placeholder: "Bank reference / receipt no." },
                        ]} />
                      <FormDialog trigger="button" triggerLabel="Charge" title={`Add a charge · ${r.first_name} ${r.last_name}`} hidden={{ learner_id: r.learner_id }} action={addCharge} submitLabel="Add charge"
                        fields={[
                          { name: "description", label: "Charge", required: true, placeholder: "e.g. School trip, uniform" },
                          { name: "amount", label: "Amount (R)", type: "number", step: "0.01", required: true, half: true },
                          { name: "due_date", label: "Due date", type: "date", required: true, defaultValue: t, half: true },
                        ]} />
                      {r.overdue > 0.5 && <RemindButton learnerId={r.learner_id} />}
                      <Link href={`/finance/statement?learner=${r.learner_id}`} className="btn btn-ghost btn-sm">Statement</Link>
                    </div>
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/finance/fees", sp, { page: p })} />
      </Card>

      <Card title="Overdue accounts" className="mt-6" action={overdueList.length > 0 && <RemindButton label="Remind all overdue" />}>
        <p className="text-sm muted mb-3">{reminders
          ? <>Reminders are sent automatically every morning on the schedule in <Link href="/finance/settings" className="underline">Fee Settings</Link>: a message in FerriDash Messages and a phone notification to each parent.</>
          : "Automatic reminders are not switched on for your school. You can still remind parents here: they get a message in FerriDash Messages and a phone notification."}</p>
        {overdueList.length === 0 ? <Empty title="No overdue fees" /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Learner</th><th>Overdue</th><th>Since</th><th>Reminders</th><th>Last reminded</th><th className="text-right" /></tr></thead>
            <tbody>{overdueList.slice(0, 50).map((o) => (
              <tr key={o.learner_id}>
                <td><p className="font-medium">{o.first_name} {o.last_name}</p><p className="text-xs muted font-mono">{o.admission_number}</p></td>
                <td className="font-semibold text-rose-600">{zar(o.overdue)}</td><td>{fmtDate(o.since)}</td><td>{o.reminders}</td>
                <td className="text-sm muted">{o.last_reminder ? fmtDate(o.last_reminder.slice(0, 10)) : "Never"}</td>
                <td className="text-right"><Link href={`/finance/statement?learner=${o.learner_id}`} className="btn btn-ghost btn-sm">Statement</Link></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      {online.length > 0 && <div className="mt-6"><OnlinePaymentsList title="Online payments" hint={methods.payfast || methods.ozow ? `Parents pay from their fee statement${methods.testMode ? ". Test mode: no real money." : "."} Confirmed payments are added to the learner's account automatically.` : "Online payments are switched off in Fee Settings."}
        rows={online} autoCheck={online.filter((o) => (o.status === "Created" || o.status === "Pending") && o.provider === "Ozow").map((o) => o.id)} /></div>}

      <Card title={`Fees per grade · ${year}`} className="mt-6" action={<FormDialog title="Set grade fees" triggerLabel="Set fees" action={saveFeeStructure} fields={[
        { name: "grade", label: "Grade", type: "select", required: true, options: Array.from({ length: 13 }, (_, g) => ({ value: g, label: gradeLabel(g) })) },
        { name: "tuition", label: "Tuition (R per year)", type: "number", step: "0.01", required: true, half: true },
        { name: "activities", label: "Activities (R per year)", type: "number", step: "0.01", half: true },
        { name: "other", label: "Other (R per year)", type: "number", step: "0.01", half: true, help: "The year's total is split into the instalments you choose when generating invoices." },
      ]} />}>
        {structures.length === 0 ? <Empty title="No grade fees set" hint="Set the yearly fees for each grade, then Generate invoices." /> : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {structures.map((s) => (
              <div key={s.grade} className="glass-strong rounded-2xl p-4 relative">
                <div className="absolute top-2 right-2"><DeleteButton action={deleteFeeStructure.bind(null, s.grade)} label={`${gradeLabel(s.grade)} fees`} /></div>
                <p className="text-sm muted">{gradeLabel(s.grade)}</p>
                <p className="text-xl font-bold">{zar(s.tuition + s.activities + s.other, true)}</p>
                <p className="text-xs muted">Tuition {zar(s.tuition, true)} · Activities {zar(s.activities, true)} · Other {zar(s.other, true)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
