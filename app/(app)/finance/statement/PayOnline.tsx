"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, ShieldCheck, RefreshCw } from "lucide-react";
import { startOnlinePayment, checkPayment, type StartPaymentResult } from "@/app/actions/payments";

const zar = (n: number) => "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parent: pay all or part of a child's balance with Ozow. */
export function PayNow({ learnerId, balance, min, testMode }: { learnerId: number; balance: number; min: number; testMode: boolean }) {
  const [state, action, pending] = useActionState<StartPaymentResult, FormData>(startOnlinePayment, {});
  const [amount, setAmount] = useState(balance.toFixed(2));
  useEffect(() => { if (state.redirect) window.location.href = state.redirect; }, [state.redirect]);
  const going = pending || !!state.redirect;
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}
      className="glass-solid p-5 sm:p-6 no-print">
      <input type="hidden" name="learner_id" value={learnerId} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="w-11 h-11 rounded-xl bg-brand-500/15 text-brand-600 grid place-items-center shrink-0"><Landmark className="w-5 h-5" /></span>
          <div>
            <h2 className="font-semibold text-lg">Pay school fees online</h2>
            <p className="text-sm muted max-w-xl">Pay instantly from your bank with <b>Ozow</b>. Choose your bank, approve the payment in your banking app, and it appears on this statement once your bank confirms it. No card details needed.</p>
            {testMode && <p className="text-xs mt-1 text-butter-600 font-medium">Test mode: no real money is taken.</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="pay-amount">Amount (R)</label>
            <input id="pay-amount" name="amount" type="number" step="0.01" min={min} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} className="input !w-40" inputMode="decimal" required />
          </div>
          <button className="btn btn-primary" disabled={going}>{going ? "Opening Ozow..." : `Pay ${zar(Number(amount) || 0)} with Ozow`}</button>
        </div>
      </div>
      {state.error && <p role="alert" className="text-sm text-rose-600 mt-3">{state.error}</p>}
      <p className="text-xs muted mt-3 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />You&apos;ll be taken to Ozow&apos;s secure payment page. FerriDash never sees your banking details.</p>
    </form>
  );
}

type Row = { id: number; amount: number; status: string; reason: string | null; created_at: string; merchant_reference: string; who?: string };
const TONE: Record<string, string> = { Successful: "chip-green", Failed: "chip-red", Pending: "chip-butter", Created: "chip-butter" };
const LABEL: Record<string, string> = { Successful: "Paid", Failed: "Not completed", Pending: "Awaiting bank", Created: "Awaiting payment" };

/** Recent online payments; ones still open are checked with Ozow when the page opens. */
export function OnlinePaymentsList({ rows, autoCheck, title = "Online payments", hint }: { rows: Row[]; autoCheck: number[]; title?: string; hint?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const ran = useRef(false);
  const check = async (id: number) => {
    setBusy(id);
    const r = await checkPayment(id);
    setBusy(null);
    setMsg((m) => ({ ...m, [id]: r.error ?? r.message ?? "" }));
    router.refresh();
  };
  useEffect(() => {
    if (ran.current || !autoCheck.length) return;
    ran.current = true;
    (async () => { for (const id of autoCheck) await check(id); })();
  }, [autoCheck]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  return (
    <div className="glass p-5 no-print">
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="text-xs muted">{hint}</p>}
      <div className="mb-1" />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {r.who && <span className="font-medium w-48 truncate">{r.who}</span>}
            <span className="font-semibold w-28">{zar(r.amount)}</span>
            <span className="muted">{new Date(r.created_at.replace(" ", "T") + "Z").toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
            {/* An attempt that was cancelled before the link expired can still be retried, so it stays open. */}
            {r.status === "Created" && r.reason
              ? <span className="chip chip-red">Not completed</span>
              : <span className={`chip ${TONE[r.status] ?? "chip-slate"}`}>{LABEL[r.status] ?? r.status}</span>}
            {(r.status === "Failed" || r.status === "Created") && r.reason && <span className="text-xs muted">{r.reason}</span>}
            {(r.status === "Created" || r.status === "Pending") && (
              <button type="button" className="btn btn-ghost btn-sm ml-auto" disabled={busy === r.id} onClick={() => check(r.id)}>
                <RefreshCw className={`w-3.5 h-3.5 ${busy === r.id ? "animate-spin" : ""}`} />{busy === r.id ? "Checking..." : "Check status"}
              </button>
            )}
            {msg[r.id] && <span className="basis-full text-xs muted">{msg[r.id]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
