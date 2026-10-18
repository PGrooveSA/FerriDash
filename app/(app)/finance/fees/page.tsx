import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, gradeLabel } from "@/lib/format";
import { MONTHS, today } from "@/lib/today";
import { Card, PageHeader, Pager, Empty, StatusChip, StatCard, hrefWith } from "@/components/ui/kit";
import { FormDialog, Filters } from "@/components/ui/forms";
import { AreaTrend } from "@/components/charts";
import Avatar from "@/components/ui/Avatar";
import { recordPayment, saveFeeStructure, generateInvoices } from "@/app/actions/finance";
import { Wallet, Receipt, AlertTriangle, BadgePercent } from "lucide-react";
import GenerateInvoicesButton from "./GenerateInvoicesButton";

export const metadata = { title: "Fees collection" };
const PER_PAGE = 10;

type Row = { invoice_id: number; learner_id: number; first_name: string; last_name: string; admission_number: string; className: string; tuition: number; activities: number; other: number; total: number; paid: number; exempt: number; due_date: string };

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const year = ctx.school.current_year;
  if (!ctx.school.fee_paying) return (
    <><PageHeader title="Fees collection" /><Card><Empty title="No-fee school" hint="This school is registered as a no-fee school, so no school fees are billed. Expenses can still be recorded under School Expenses." /></Card></>
  );
  const q = sp.q?.trim() ?? "", classId = Number(sp.class) || 0, status = sp.status ?? "", page = Math.max(1, Number(sp.page) || 1);
  const t = today();
  const statusSql = { paid: "AND total - paid <= 0.5", pending: "AND total - paid > 0.5 AND paid > 0 AND due_date >= ?5", overdue: "AND total - paid > 0.5 AND due_date < ?5", unpaid: "AND paid = 0" }[status] ?? "AND ?5 = ?5";
  const base = `
    SELECT i.id invoice_id, l.id learner_id, l.first_name, l.last_name, l.admission_number, c.name className, i.tuition, i.activities, i.other,
      i.tuition + i.activities + i.other total, (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.invoice_id = i.id) paid,
      EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id AND p.method = 'Exemption') exempt, i.due_date
    FROM invoices i JOIN learners l ON l.id = i.learner_id LEFT JOIN classes c ON c.id = l.class_id
    WHERE i.school_id = ?1 AND i.year = ?2 AND (?3 = 0 OR l.class_id = ?3) AND (?4 = '' OR l.first_name || ' ' || l.last_name LIKE '%' || ?4 || '%' OR l.admission_number LIKE '%' || ?4 || '%')`;
  const args = [ctx.schoolId, year, classId, q, t] as const;
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM (${base}) WHERE 1 ${statusSql}`, ...args)!.n;
  const rows = all<Row>(`SELECT * FROM (${base}) WHERE 1 ${statusSql} ORDER BY last_name LIMIT ?6 OFFSET ?7`, ...args, PER_PAGE, (page - 1) * PER_PAGE);
  const sums = get<{ billed: number; paid: number; exempt: number }>(`SELECT COALESCE(SUM(i.tuition + i.activities + i.other), 0) billed,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN invoices i2 ON i2.id = p.invoice_id WHERE i2.school_id = ?1 AND i2.year = ?2 AND p.method <> 'Exemption') paid,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN invoices i2 ON i2.id = p.invoice_id WHERE i2.school_id = ?1 AND i2.year = ?2 AND p.method = 'Exemption') exempt
    FROM invoices i WHERE i.school_id = ?1 AND i.year = ?2`, ctx.schoolId, year)!;
  const monthly = all<{ m: string; v: number }>("SELECT substr(paid_on, 6, 2) m, SUM(amount) v FROM payments WHERE school_id = ? AND paid_on LIKE ? AND method <> 'Exemption' GROUP BY m", ctx.schoolId, `${year}-%`);
  const chart = MONTHS.map((name, i) => ({ name, collected: monthly.find((r) => r.m === String(i + 1).padStart(2, "0"))?.v ?? 0 }));
  const classes = all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, year);
  const structures = all<{ grade: number; tuition: number; activities: number; other: number }>("SELECT grade, tuition, activities, other FROM fee_structures WHERE school_id = ? AND year = ? ORDER BY grade", ctx.schoolId, year);
  const outstanding = sums.billed - sums.paid - sums.exempt;
  const statusOf = (r: Row) => r.total - r.paid <= 0.5 ? (r.exempt ? "Exempt" : "Paid") : r.due_date < t ? "Overdue" : r.paid > 0 ? "Partial" : "Pending";

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_26rem] gap-6 mb-6">
        <Card title={`Fees collection · ${year}`}><AreaTrend money data={chart} xKey="name" series={[{ key: "collected", name: "Collected", color: "#eab308" }]} /></Card>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Total billed" value={zar(sums.billed, true)} icon={Receipt} tone="sky" />
          <StatCard label="Collected" value={zar(sums.paid, true)} icon={Wallet} tone="green" hint={sums.billed ? `${Math.round((sums.paid / sums.billed) * 100)}%` : undefined} />
          <StatCard label="Outstanding" value={zar(outstanding, true)} icon={AlertTriangle} tone="butter" />
          <StatCard label="Exemptions" value={zar(sums.exempt, true)} icon={BadgePercent} tone="lilac" hint="Fee exemption regulations" />
        </div>
      </div>

      <Card>
        <PageHeader title="Learner accounts" subtitle="Record EFT, cash, card and debit-order payments. All amounts in ZAR.">
          <Filters search={{ name: "q", placeholder: "Search name or admission no.", value: q }} filters={[
            { name: "class", label: "Class", value: classId || "", allLabel: "All classes", options: classes.map((c) => ({ value: c.id, label: c.name })) },
            { name: "status", label: "Status", value: status, allLabel: "All statuses", options: [{ value: "paid", label: "Paid" }, { value: "pending", label: "Partially paid" }, { value: "unpaid", label: "Nothing paid" }, { value: "overdue", label: "Overdue" }] },
          ]} />
        </PageHeader>
        {rows.length === 0 ? <Empty title="No accounts match" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Learner</th><th>Class</th><th>Tuition</th><th>Activities</th><th>Other</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th className="text-right">Action</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.invoice_id}>
                  <td><div className="flex items-center gap-3"><Avatar first={r.first_name} last={r.last_name} size={36} /><div><p className="font-semibold">{r.first_name} {r.last_name}</p><p className="text-xs muted font-mono">{r.admission_number}</p></div></div></td>
                  <td>{r.className}</td><td>{zar(r.tuition, true)}</td><td>{zar(r.activities, true)}</td><td>{zar(r.other, true)}</td>
                  <td className="font-medium">{zar(r.total, true)}</td><td>{zar(r.paid, true)}</td>
                  <td className={`font-semibold ${r.total - r.paid > 0.5 ? "text-rose-600" : ""}`}>{zar(Math.max(0, r.total - r.paid), true)}</td>
                  <td><StatusChip status={statusOf(r)} /></td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      {r.total - r.paid > 0.5 && <FormDialog trigger="button" triggerLabel="Pay" title={`Record payment · ${r.first_name} ${r.last_name}`} hidden={{ invoice_id: r.invoice_id }} action={recordPayment} submitLabel="Record payment"
                        fields={[
                          { name: "amount", label: "Amount (R)", type: "number", step: "0.01", required: true, defaultValue: Math.round((r.total - r.paid) * 100) / 100, half: true },
                          { name: "paid_on", label: "Date", type: "date", required: true, defaultValue: t, half: true },
                          { name: "method", label: "Method", type: "select", required: true, options: ["EFT", "Cash", "Card", "Debit order", "Exemption"].map((v) => ({ value: v, label: v })), half: true },
                          { name: "reference", label: "Reference", half: true, placeholder: "Bank reference / receipt no." },
                        ]} />}
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

      <Card title={`Fee structure · ${year}`} className="mt-6" action={<div className="flex gap-2"><GenerateInvoicesButton action={generateInvoices} /><FormDialog title="Set grade fees" triggerLabel="Set fees" action={saveFeeStructure} fields={[
        { name: "grade", label: "Grade", type: "select", required: true, options: Array.from({ length: 13 }, (_, g) => ({ value: g, label: gradeLabel(g) })) },
        { name: "tuition", label: "Tuition (R per year)", type: "number", step: "0.01", required: true, half: true },
        { name: "activities", label: "Activities (R)", type: "number", step: "0.01", half: true },
        { name: "other", label: "Other / miscellaneous (R)", type: "number", step: "0.01", half: true },
      ]} /></div>}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {structures.map((s) => (
            <div key={s.grade} className="glass-strong rounded-2xl p-4">
              <p className="text-sm muted">{gradeLabel(s.grade)}</p>
              <p className="text-xl font-bold">{zar(s.tuition + s.activities + s.other, true)}</p>
              <p className="text-xs muted">Tuition {zar(s.tuition, true)} · Activities {zar(s.activities, true)} · Other {zar(s.other, true)}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
