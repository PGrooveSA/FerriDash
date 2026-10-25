"use client";
import { startTransition, useActionState, useState } from "react";
import { CreditCard, PlugZap } from "lucide-react";
import { savePaymentSettings, testOzowConnection } from "@/app/actions/payments";
import type { ActionResult } from "@/lib/action-utils";

type Props = { enabled: boolean; siteCode: string; clientId: string; hasSecret: boolean; testMode: boolean; publicUrl: string };

/** School admin: connect the school's own Ozow account so parents can pay fees online. */
export default function OnlinePaymentsForm(p: Props) {
  const [state, action, pending] = useActionState(savePaymentSettings, {});
  const [test, setTest] = useState<ActionResult & { busy?: boolean }>({});
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="glass p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-600 grid place-items-center shrink-0"><CreditCard className="w-5 h-5" /></span>
        <div>
          <h2 className="font-semibold text-lg">Online payments (Ozow)</h2>
          <p className="text-sm muted">Let parents pay school fees from their banking app with Ozow. Payments are confirmed with Ozow and appear on the fee statement automatically. Use your school&apos;s own Ozow merchant account (dash.ozow.com → One API → Clients).</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="pay-enabled">Online payments</label>
          <select id="pay-enabled" name="enabled" defaultValue={p.enabled ? "1" : "0"} className="input"><option value="0">Off</option><option value="1">On: parents can pay online</option></select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="pay-mode">Mode</label>
          <select id="pay-mode" name="test_mode" defaultValue={p.testMode ? "1" : "0"} className="input"><option value="1">Test (Ozow staging, no real money)</option><option value="0">Live</option></select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="pay-site">Site code</label>
          <input id="pay-site" name="site_code" defaultValue={p.siteCode} className="input" autoComplete="off" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="pay-client">Client ID</label>
          <input id="pay-client" name="client_id" defaultValue={p.clientId} className="input" autoComplete="off" />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="pay-secret">Client secret</label>
          <input id="pay-secret" name="client_secret" type="password" className="input" autoComplete="new-password" placeholder={p.hasSecret ? "Saved. Leave empty to keep it" : "Paste the client secret"} />
          <p className="text-xs muted mt-1">Stored encrypted on this computer and never shown again.</p>
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="pay-url">Public address of this server (optional)</label>
          <input id="pay-url" name="public_url" defaultValue={p.publicUrl} className="input" placeholder="https://fees.yourschool.co.za" />
          <p className="text-xs muted mt-1">Only if FerriDash can be reached from the internet: Ozow then brings parents straight back after paying. Without it, payments still work and are confirmed when the parent returns to their statement.</p>
        </div>
      </div>
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-emerald-600">{state.message}</p>}
      {test.error && <p role="alert" className="text-sm text-rose-600">{test.error}</p>}
      {test.ok && <p className="text-sm text-emerald-600">{test.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Save payment settings"}</button>
        <button type="button" className="btn btn-ghost" disabled={test.busy || !p.hasSecret}
          onClick={async () => { setTest({ busy: true }); setTest(await testOzowConnection()); }}>
          <PlugZap className="w-4 h-4" />{test.busy ? "Testing..." : "Test connection"}
        </button>
      </div>
    </form>
  );
}
