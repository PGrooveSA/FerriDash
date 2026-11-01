"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, ShieldCheck, RefreshCw, CreditCard } from "lucide-react";
import { startOnlinePayment, checkPayment, remindNow, billNow, type StartPaymentResult } from "@/app/actions/fees";

const zar = (n: number) => "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parent: pay all or part of a child's balance with PayFast (card, Instant EFT...) or Ozow (pay from your bank). */
export function PayNow({ learnerId, balance, dueNow, min, providers, testMode }: { learnerId: number; balance: number; dueNow: number; min: number; providers: ("PayFast" | "Ozow")[]; testMode: boolean }) {
  const [state, action, pending] = useActionState<StartPaymentResult, FormData>(startOnlinePayment, {});
  const [amount, setAmount] = useState((dueNow > 0 ? dueNow : balance).toFixed(2));
  const [provider, setProvider] = useState(providers[0]);
  const form = useRef<HTMLFormElement>(null);
  // Ozow gives a payment page address; PayFast takes a signed form posted to its site.
  useEffect(() => {
    if (state.redirect) window.location.href = state.redirect;
    else if (state.form) form.current?.submit();
  }, [state]);
  const going = pending || !!state.redirect || !!state.form;
  return (
    <div className="glass-solid p-5 sm:p-6 no-print">
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
        <input type="hidden" name="learner_id" value={learnerId} />
        <input type="hidden" name="provider" value={provider} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="w-11 h-11 rounded-xl bg-brand-500/15 text-brand-600 grid place-items-center shrink-0"><Landmark className="w-5 h-5" /></span>
            <div>
              <h2 className="font-semibold text-lg">Pay school fees online</h2>
              <p className="text-sm muted max-w-xl">The payment shows on this statement as soon as it is confirmed.</p>
              {testMode && <p className="text-xs mt-1 text-butter-600 font-medium">Test mode: no real money is taken.</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="pay-amount">Amount (R)</label>
              <input id="pay-amount" name="amount" type="number" step="0.01" min={min} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} className="input !w-40" inputMode="decimal" required />
            </div>
            <button className="btn btn-primary" disabled={going}>{going ? `Opening ${provider}...` : `Pay ${zar(Number(amount) || 0)}`}</button>
          </div>
        </div>
        {providers.length > 1 && (
          <fieldset className="mt-4 grid sm:grid-cols-2 gap-2">
            <legend className="label">Pay with</legend>
            {providers.map((p) => (
              <label key={p} className={`flex gap-3 items-start rounded-2xl border p-3 cursor-pointer ${provider === p ? "border-brand-400 bg-brand-500/5" : "border-line"}`}>
                <input type="radio" name="provider_pick" checked={provider === p} onChange={() => setProvider(p)} className="mt-1" />
                <span>{p === "PayFast" ? <CreditCard className="w-4 h-4 inline mr-1" /> : <Landmark className="w-4 h-4 inline mr-1" />}<b>{p}</b>
                  <span className="block text-xs muted">{p === "PayFast" ? "Card, Instant EFT, SnapScan, Zapper and more." : "Pay straight from your bank's app. No card needed."}</span></span>
              </label>
            ))}
          </fieldset>
        )}
        {dueNow > 0 && dueNow < balance && <p className="text-xs muted mt-2">{zar(dueNow)} is due now; {zar(balance)} covers the rest of the year too.</p>}
        {state.error && <p role="alert" className="text-sm text-rose-600 mt-3">{state.error}</p>}
        <p className="text-xs muted mt-3 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />You&apos;ll pay on {provider}&apos;s secure page. FerriDash never sees your card or banking details.</p>
      </form>
      {/* PayFast: the signed fields, posted to PayFast once the server has prepared them. */}
      {state.form && (
        <form ref={form} method="POST" action={state.form.action} className="hidden">
          {state.form.fields.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        </form>
      )}
    </div>
  );
}

type Row = { id: number; provider: string; amount: number; status: string; reason: string | null; created_at: string; who?: string };
const TONE: Record<string, string> = { Successful: "chip-green", Failed: "chip-red", Pending: "chip-butter", Created: "chip-butter" };
const LABEL: Record<string, string> = { Successful: "Paid", Failed: "Not completed", Pending: "Awaiting confirmation", Created: "Awaiting payment" };

/** Recent online payments; ones still open are checked when the page opens. */
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
      <ul className="divide-y divide-line mt-1">
        {rows.map((r) => (
          <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {r.who && <span className="font-medium w-48 truncate">{r.who}</span>}
            <span className="font-semibold w-28">{zar(r.amount)}</span>
            <span className="chip chip-slate">{r.provider}</span>
            <span className="muted">{new Date(r.created_at.replace(" ", "T") + "Z").toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</span>
            <span className={`chip ${TONE[r.status] ?? "chip-slate"}`}>{LABEL[r.status] ?? r.status}</span>
            {r.status === "Failed" && r.reason && <span className="text-xs muted">{r.reason}</span>}
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

/** School admin: send overdue-fee reminders now (to one learner's parents, or to every overdue account). */
export function RemindButton({ learnerId, label = "Remind" }: { learnerId?: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={learnerId ? "btn btn-ghost btn-sm" : "btn btn-primary"} disabled={busy}
      onClick={async () => {
        if (!confirm(learnerId ? "Send this learner's parents a reminder about the overdue fees now?" : "Send a reminder now to the parents of every learner with overdue fees? (Anyone already reminded today is skipped.)")) return;
        setBusy(true);
        const r = await remindNow(learnerId ? [learnerId] : null);
        setBusy(false);
        alert(r.error ?? r.message);
        router.refresh();
      }}>
      {busy ? "Sending..." : label}
    </button>
  );
}

/** School admin: bill a learner who missed the year's billing (or everyone not billed yet) on the school's schedule. */
export function BillNowButton({ learnerId, label = "Bill now" }: { learnerId?: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={learnerId ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"} disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await billNow(learnerId ?? null);
        setBusy(false);
        if (r.error) alert(r.error); else router.refresh();
      }}>
      {busy ? "Billing..." : label}
    </button>
  );
}
