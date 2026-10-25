import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ownLearnerIds, requireCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { zar } from "@/lib/format";
import { checkOnlinePayment, type OnlinePayment } from "@/lib/online-payments";
import { Card, PageHeader, Empty } from "@/components/ui/kit";

export const metadata = { title: "Payment" };

// Ozow sends the parent back here (when the school has a public address). The return itself proves
// nothing, so the payment is confirmed with Ozow before anything is shown as paid.
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["parent"]);
  const ref = (await searchParams).ref ?? "";
  let op = get<OnlinePayment>("SELECT * FROM online_payments WHERE merchant_reference = ? AND school_id = ?", ref, ctx.schoolId);
  if (!op || !(ownLearnerIds(ctx) ?? []).includes(op.learner_id)) return <Card><Empty title="Payment not found" /></Card>;
  let problem: string | null = null;
  try { op = await checkOnlinePayment(op.id); } catch (e) { problem = e instanceof Error ? e.message : "Could not check the payment."; }
  const child = get<{ name: string }>("SELECT first_name || ' ' || last_name name FROM learners WHERE id = ?", op.learner_id)!.name;
  const [Icon, tone, head, text] = op.status === "Successful"
    ? [CheckCircle2, "text-emerald-600", "Payment received", `Thank you. ${zar(op.amount)} has been paid towards ${child}'s school fees.`]
    : op.status === "Failed"
      ? [XCircle, "text-rose-600", "Payment not completed", op.reason ?? "No money was taken. You can try again from the fee statement."]
      : [Clock, "text-butter-500", "Waiting for your bank", "Your bank hasn't confirmed the payment yet. It will show on the statement as soon as it does."];
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
