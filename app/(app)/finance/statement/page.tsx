import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, fmtDate, gradeLabel, logoUrl } from "@/lib/format";
import { today } from "@/lib/today";
import { Card, PageHeader, Empty } from "@/components/ui/kit";
import { Filters, PrintButton, DeleteButton } from "@/components/ui/forms";
import { deletePayment } from "@/app/actions/finance";
import { BrandMark } from "@/components/BrandLogo";
import { MIN_ONLINE_PAYMENT, ozowConfig } from "@/lib/online-payments";
import { PayNow, OnlinePaymentsList } from "./PayOnline";

export const metadata = { title: "Fee statement" };

export default async function StatementPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "parent"]);
  const sp = await searchParams;
  let ids: number[];
  if (ctx.isAdmin) ids = sp.learner ? [Number(sp.learner)] : [];
  else ids = ownLearnerIds(ctx) ?? [];
  const learnerId = ids.includes(Number(sp.learner)) ? Number(sp.learner) : ids[0];
  if (!learnerId) return <Card><Empty title="Choose a learner" hint={ctx.isAdmin ? "Open a statement from Fees Collection." : "No learner is linked to your account."} /></Card>;
  const l = get<{ first_name: string; last_name: string; admission_number: string; className: string; grade: number }>("SELECT l.first_name, l.last_name, l.admission_number, c.name className, c.grade FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE l.id = ? AND l.school_id = ?", learnerId, ctx.schoolId);
  if (!l) return <Card><Empty title="Learner not found" /></Card>;
  const kids = !ctx.isAdmin && ids.length > 1 ? all<{ id: number; name: string }>(`SELECT id, first_name || ' ' || last_name name FROM learners WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];

  // Running ledger: invoices are debits, payments are credits.
  const lines = all<{ id: number; kind: "invoice" | "payment"; date: string; description: string; debit: number; credit: number }>(`
    SELECT id, 'invoice' kind, created_at date, description, tuition + activities + other debit, 0 credit FROM invoices WHERE learner_id = ?1
    UNION ALL
    SELECT p.id, 'payment', p.paid_on, p.method || COALESCE(' · ' || p.reference, ''), 0, p.amount FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.learner_id = ?1
    ORDER BY date, kind DESC`, learnerId);
  let bal = 0;
  const ledger = lines.map((x) => ({ ...x, balance: (bal += x.debit - x.credit) }));
  bal = Math.round(bal * 100) / 100;

  // Online payments (fee-paying schools with Ozow switched on). Open ones are checked with Ozow on load.
  const ozow = ctx.school.fee_paying ? ozowConfig(ctx.schoolId) : null;
  const online = all<{ id: number; amount: number; status: string; reason: string | null; created_at: string; merchant_reference: string }>(
    "SELECT id, amount, status, reason, created_at, merchant_reference FROM online_payments WHERE learner_id = ? AND provider_payment_id IS NOT NULL ORDER BY id DESC LIMIT 8", learnerId);
  const openIds = online.filter((o) => o.status === "Created" || o.status === "Pending").map((o) => o.id);

  return (
    <>
      <PageHeader title="Fee statement" subtitle={`${l.first_name} ${l.last_name} · ${l.admission_number}`}>
        {kids.length > 0 && <Filters filters={[{ name: "learner", label: "Child", value: learnerId, options: kids.map((k) => ({ value: k.id, label: k.name })) }]} />}
        <PrintButton />
      </PageHeader>
      {(ozow && !ctx.isAdmin && bal > 0) || online.length ? (
        <div className="space-y-4 mb-6">
          {ozow && !ctx.isAdmin && bal > 0 && <PayNow learnerId={learnerId} balance={bal} min={Math.min(MIN_ONLINE_PAYMENT, bal)} testMode={ozow.testMode} />}
          <OnlinePaymentsList rows={online} autoCheck={ozow ? openIds : []} />
        </div>
      ) : null}
      <article className="glass-solid print-area p-6 sm:p-8">
        <header className="flex flex-wrap justify-between gap-4 pb-4 border-b-2 border-brand-300">
          <div className="flex items-start gap-4">{ctx.school.logo_updated_at && <img src={logoUrl(ctx.schoolId, ctx.school.logo_updated_at)!} alt="" className="w-14 h-14 object-contain" />}<div><h2 className="text-xl font-bold">{ctx.school.name}</h2><p className="text-xs muted">{ctx.school.address}</p><p className="text-xs muted">{ctx.school.phone} · {ctx.school.email}</p></div></div>
          <div className="text-right"><p className="text-xs uppercase tracking-widest muted">Statement of account</p><p className="font-semibold">{fmtDate(today())}</p></div>
        </header>
        <div className="grid sm:grid-cols-3 gap-4 py-4 text-sm">
          <div><p className="text-xs muted">Learner</p><p className="font-semibold">{l.first_name} {l.last_name}</p></div>
          <div><p className="text-xs muted">Grade / class</p><p>{gradeLabel(l.grade)} · {l.className}</p></div>
          <div><p className="text-xs muted">Balance due</p><p className={`text-2xl font-bold ${bal > 0.5 ? "text-rose-600" : "text-emerald-600"}`}>{zar(Math.max(0, bal))}</p></div>
        </div>
        {ledger.length === 0 ? <Empty title="No transactions" hint={ctx.school.fee_paying ? undefined : "This is a no-fee school."} /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th>{ctx.isAdmin && <th className="no-print" />}</tr></thead>
              <tbody>{ledger.map((x) => (
                <tr key={`${x.kind}${x.id}`}>
                  <td className="whitespace-nowrap">{fmtDate(x.date)}</td>
                  <td>{x.kind === "payment" ? <>Payment received <span className="muted">({x.description})</span></> : x.description}</td>
                  <td className="text-right">{x.debit ? zar(x.debit) : ""}</td>
                  <td className="text-right text-emerald-600">{x.credit ? zar(x.credit) : ""}</td>
                  <td className="text-right font-medium">{zar(x.balance)}</td>
                  {ctx.isAdmin && <td className="no-print text-right">{x.kind === "payment" && <DeleteButton action={deletePayment.bind(null, x.id)} label="this payment" />}</td>}
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs muted mt-6">{ozow ? "Pay online with Ozow above, or ask the school office for banking details." : "Banking details are available from the school office."} Parents who cannot afford school fees may apply for exemption in terms of the Exemption of Parents from Payment of School Fees Regulations.</p>
        <p className="text-[0.68rem] muted mt-4 pt-3 border-t border-line flex items-center justify-end gap-1"><BrandMark />Generated by FerriDash · Copyright © Infinite Q Graphics</p>
      </article>
    </>
  );
}
