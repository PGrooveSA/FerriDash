import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, fmtDate, gradeLabel, logoUrl } from "@/lib/format";
import { today } from "@/lib/today";
import { account, billingSchedule, feesOn, MIN_ONLINE_PAYMENT, onlineMethods, onlinePaymentsOf, paymentSettings } from "@/lib/fees";
import { Card, PageHeader, Empty, StatusChip } from "@/components/ui/kit";
import { Filters, PrintButton, DeleteButton } from "@/components/ui/forms";
import { deletePayment, deleteInvoice } from "@/app/actions/fees";
import { BrandMark } from "@/components/BrandLogo";
import { PayNow, OnlinePaymentsList, RemindButton, BillNowButton } from "./PayOnline";
import FeesOff from "../FeesOff";

export const metadata = { title: "Fee statement" };

export default async function StatementPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "parent"]);
  if (!feesOn(ctx.school)) return <FeesOff title="Fee statement" />;
  const sp = await searchParams;
  const ids = ctx.isAdmin ? (sp.learner ? [Number(sp.learner)] : []) : ((await ownLearnerIds(ctx)) ?? []);
  const learnerId = ids.includes(Number(sp.learner)) ? Number(sp.learner) : ids[0];
  if (!learnerId) return <Card><Empty title="Choose a learner" hint={ctx.isAdmin ? "Open a statement from Fees Collection." : "No learner is linked to your account."} /></Card>;
  const l = await get<{ first_name: string; last_name: string; admission_number: string; className: string | null; grade: number | null; grade_fees: number }>(`SELECT l.first_name, l.last_name, l.admission_number, c.name className, c.grade,
      EXISTS (SELECT 1 FROM fee_structures fs WHERE fs.school_id = l.school_id AND fs.year = ? AND fs.grade = c.grade)::int grade_fees
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE l.id = ? AND l.school_id = ?`, ctx.school.current_year, learnerId, ctx.schoolId);
  if (!l) return <Card><Empty title="Learner not found" /></Card>;
  const kids = !ctx.isAdmin && ids.length > 1 ? (await all<{ id: number; name: string }>(`SELECT id, first_name || ' ' || last_name name FROM learners WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)) : [];
  const t = today();
  const acc = await account(learnerId, t);
  const unbilled = acc.invoices.length === 0;
  const schedule = unbilled && ctx.isAdmin ? await billingSchedule(ctx.schoolId, ctx.school.current_year) : null;

  // Running ledger: invoices are debits (on their due date), payments are credits (one line per receipt).
  const lines = await all<{ id: number; kind: "invoice" | "payment"; date: string; description: string; receipt: string | null; debit: number; credit: number }>(`
    SELECT id, 'invoice' kind, due_date date, description, NULL receipt, amount debit, 0 credit FROM invoices WHERE learner_id = ?1
    UNION ALL
    SELECT MIN(p.id), 'payment', p.paid_on, MIN(p.method || COALESCE(' · ' || p.reference, '')), p.receipt, 0, SUM(p.amount)
      FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.learner_id = ?1 GROUP BY p.receipt, p.paid_on
    ORDER BY date, kind DESC, id`, learnerId);
  let bal = 0;
  const ledger = lines.map((x) => ({ ...x, balance: (bal += x.debit - x.credit) }));
  const paidInvoices = new Set((await all<{ invoice_id: number }>("SELECT DISTINCT p.invoice_id FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.learner_id = ?", learnerId)).map((r) => r.invoice_id));

  const methods = await onlineMethods(ctx.schoolId);
  const providers = [...(methods.payfast ? ["PayFast" as const] : []), ...(methods.ozow ? ["Ozow" as const] : [])];
  const online = await onlinePaymentsOf([learnerId]);
  const openIds = online.filter((o) => (o.status === "Created" || o.status === "Pending") && o.provider === "Ozow").map((o) => o.id);
  const banking = (await paymentSettings(ctx.schoolId))?.banking_details;

  return (
    <>
      <PageHeader title="Fee statement" subtitle={`${l.first_name} ${l.last_name} · ${l.admission_number}`}>
        {kids.length > 0 && <Filters filters={[{ name: "learner", label: "Child", value: learnerId, options: kids.map((k) => ({ value: k.id, label: k.name })) }]} />}
        {ctx.isAdmin && acc.overdue > 0.5 && <RemindButton learnerId={learnerId} label="Send reminder" />}
        <PrintButton />
      </PageHeader>
      {(providers.length && !ctx.isAdmin && acc.total > 0) || online.length ? (
        <div className="space-y-4 mb-6">
          {providers.length > 0 && !ctx.isAdmin && acc.total > 0 && <PayNow learnerId={learnerId} balance={acc.total} dueNow={acc.dueNow} min={Math.min(MIN_ONLINE_PAYMENT, acc.total)} providers={providers} testMode={methods.testMode} />}
          <OnlinePaymentsList rows={online} autoCheck={openIds} />
        </div>
      ) : null}
      <article className="glass-solid print-area p-6 sm:p-8">
        <header className="flex flex-wrap justify-between gap-4 pb-4 border-b-2 border-brand-300">
          <div className="flex items-start gap-4">{ctx.school.logo_updated_at && <img src={logoUrl(ctx.schoolId, ctx.school.logo_updated_at)!} alt="" className="w-14 h-14 object-contain" />}<div><h2 className="text-xl font-bold">{ctx.school.name}</h2><p className="text-xs muted">{ctx.school.address}</p><p className="text-xs muted">{[ctx.school.phone, ctx.school.email].filter(Boolean).join(" · ")}</p></div></div>
          <div className="text-right"><p className="text-xs uppercase tracking-widest muted">Statement of account</p><p className="font-semibold">{fmtDate(t)}</p></div>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 text-sm">
          <div><p className="text-xs muted">Learner</p><p className="font-semibold">{l.first_name} {l.last_name}</p></div>
          <div><p className="text-xs muted">Grade / class</p><p>{l.grade != null ? `${gradeLabel(l.grade)} · ${l.className}` : "-"}</p></div>
          {unbilled ? (
            // Nothing billed yet is not the same as paid up: say so instead of showing R 0,00.
            <div className="col-span-2"><p className="text-xs muted">School fees</p><p className="text-xl font-bold">Not billed yet</p></div>
          ) : <>
            <div><p className="text-xs muted">Due now</p><p className={`text-2xl font-bold ${acc.overdue > 0.5 ? "text-rose-600" : ""}`}>{zar(Math.max(0, acc.dueNow))}</p>{acc.overdue > 0.5 && <p className="text-xs text-rose-600">{zar(acc.overdue)} overdue since {fmtDate(acc.overdueSince)}</p>}</div>
            <div><p className="text-xs muted">{acc.total < -0.005 ? "In credit" : "Balance (whole year)"}</p><p className={`text-2xl font-bold ${acc.total <= 0.5 ? "text-emerald-600" : ""}`}>{zar(Math.abs(acc.total))}</p></div>
          </>}
        </div>
        {unbilled && (
          <div className="no-print rounded-2xl border border-butter-300 bg-butter-100/50 dark:bg-butter-500/10 p-4 mb-4 text-sm flex flex-wrap items-center gap-3">
            <p className="flex-1 min-w-[14rem]">{!ctx.isAdmin
              ? `The school hasn't billed ${l.first_name}'s fees for ${ctx.school.current_year} yet. They will show here as soon as it does.`
              : l.grade == null ? `${l.first_name} is not in a class yet. Put them in a class under Learners, and their fees are billed on the school's schedule.`
              : !l.grade_fees ? `No fees are set for ${gradeLabel(l.grade)} in ${ctx.school.current_year}. Set them under Finance → Fees Collection (Set fees).`
              : !schedule ? `Nobody has been billed for ${ctx.school.current_year} yet. Use Generate invoices on Fees Collection to choose how parents pay.`
              : `${l.first_name} has not been billed for ${ctx.school.current_year}. Bill them on the school's schedule, from the current instalment.`}</p>
            {ctx.isAdmin && l.grade != null && !!l.grade_fees && schedule && <BillNowButton learnerId={learnerId} label={`Bill ${l.first_name} now`} />}
          </div>
        )}
        {ledger.length === 0 ? null : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th>{ctx.isAdmin && <th className="no-print" />}</tr></thead>
              <tbody>{ledger.map((x) => (
                <tr key={`${x.kind}${x.id}`} className={x.kind === "invoice" && x.date > t ? "opacity-70" : ""}>
                  <td className="whitespace-nowrap">{fmtDate(x.date)}</td>
                  <td>{x.kind === "payment" ? <>Payment received <span className="muted">({x.description}{x.receipt ? ` · ${x.receipt}` : ""})</span></> : <>{x.description}{x.date > t && <span className="ml-2"><StatusChip status="Not yet due" /></span>}</>}</td>
                  <td className="text-right">{x.debit ? zar(x.debit) : ""}</td>
                  <td className="text-right text-emerald-600">{x.credit ? zar(x.credit) : ""}</td>
                  <td className="text-right font-medium">{zar(x.balance)}</td>
                  {ctx.isAdmin && <td className="no-print text-right">
                    {x.kind === "payment" && x.receipt && <DeleteButton action={deletePayment.bind(null, x.receipt)} label="this payment" />}
                    {x.kind === "invoice" && !paidInvoices.has(x.id) && <DeleteButton action={deleteInvoice.bind(null, x.id)} label="this charge" />}
                  </td>}
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        {banking && <p className="text-sm mt-6"><b>Banking details:</b> {banking}. Use <b>{l.admission_number}</b> as the reference.</p>}
        <p className="text-xs muted mt-4">{providers.length ? `Pay online with ${providers.join(" or ")} from FerriDash, or by EFT using the banking details.` : banking ? "" : "Banking details are available from the school office."} Parents who cannot afford school fees may apply for exemption in terms of the Exemption of Parents from Payment of School Fees Regulations, or ask the school about a payment plan.</p>
        <p className="text-[0.68rem] muted mt-4 pt-3 border-t border-line flex items-center justify-end gap-1"><BrandMark />Generated by FerriDash · Copyright © Infinite Q Graphics</p>
      </article>
    </>
  );
}
