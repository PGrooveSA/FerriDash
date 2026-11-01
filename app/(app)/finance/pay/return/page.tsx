import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ownLearnerIds, requireCtx } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { zar } from "@/lib/format";
import { checkOnlinePayment, type OnlinePayment } from "@/lib/fees";
import { Card, PageHeader, Empty } from "@/components/ui/kit";

export const metadata = { title: "Payment" };

// PayFast and Ozow send the parent back here. Coming back proves nothing, so a payment only shows as paid once
// Ozow confirms it (asked here) or PayFast's notification has arrived (app/api/payfast/notify).
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["parent"]);
  const sp = await searchParams;
  let op = await get<OnlinePayment>("SELECT * FROM online_payments WHERE merchant_reference = ? AND school_id = ?", sp.ref ?? "", ctx.schoolId);
  if (!op || !((await ownLearnerIds(ctx)) ?? []).includes(op.learner_id)) return <Card><Empty title="Payment not found" /></Card>;
  let problem: string | null = null;
  if (sp.cancelled && op.status !== "Successful") {
    await run("UPDATE online_payments SET status = 'Failed', reason = 'You cancelled the payment.' WHERE id = ? AND status IN ('Created','Pending')", op.id);
    op = (await get<OnlinePayment>("SELECT * FROM online_payments WHERE id = ?", op.id))!;
  } else {
    try { op = await checkOnlinePayment(op.id); } catch (e) { problem = e instanceof Error ? e.message : "Could not check the payment."; }
  }
  const child = (await get<{ name: string }>("SELECT first_name || ' ' || last_name name FROM learners WHERE id = ?", op.learner_id))!.name;
  const [Icon, tone, head, text] = op.status === "Successful"
    ? [CheckCircle2, "text-emerald-600", "Payment received", `Thank you. ${zar(op.amount)} has been paid towards ${child}'s school fees.`]
    : op.status === "Failed"
      ? [XCircle, "text-rose-600", "Payment not completed", op.reason ?? "No money was taken. You can try again from the fee statement."]
      : [Clock, "text-butter-500", "Waiting for confirmation", `${op.provider} hasn't confirmed the payment yet. It shows on the statement as soon as it does, usually within a few minutes.`];
  return (
    <>
      <PageHeader title="Online payment" />
      <div className="glass p-8 text-center max-w-xl mx-auto">
        <Icon className={`w-14 h-14 mx-auto ${tone}`} />
        <h2 className="text-2xl font-semibold mt-3">{head}</h2>
        <p className="muted mt-2">{text}</p>
        {problem && <p className="text-sm text-rose-600 mt-3">{problem}</p>}
        <Link href={`/finance/statement?learner=${op.learner_id}`} className="btn btn-primary mt-6">View fee statement</Link>
      </div>
    </>
  );
}
