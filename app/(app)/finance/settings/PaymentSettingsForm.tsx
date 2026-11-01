"use client";
import { startTransition, useActionState, useState } from "react";
import { CreditCard, Landmark, BellRing, PlugZap } from "lucide-react";
import { savePaymentSettings, testOzowConnection } from "@/app/actions/fees";
import type { ActionResult } from "@/lib/action-utils";

type Props = {
  online: boolean; reminders: boolean; publicBase: string;
  testMode: boolean; banking: string;
  payfast: { enabled: boolean; merchantId: string; hasKey: boolean; hasPassphrase: boolean };
  ozow: { enabled: boolean; siteCode: string; clientId: string; hasSecret: boolean };
  schedule: { after: number; every: number; max: number };
};

/** School admin: the school's own PayFast and Ozow merchant accounts, banking details, and the reminder schedule. */
export default function PaymentSettingsForm(p: Props) {
  const [state, action, pending] = useActionState(savePaymentSettings, {});
  const [test, setTest] = useState<ActionResult & { busy?: boolean }>({});
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-6">
      <section className="glass p-6 space-y-4">
        <h2 className="font-semibold text-lg">Banking details</h2>
        <div>
          <label className="label" htmlFor="banking">Shown on statements and in reminders, for parents who pay by EFT</label>
          <textarea id="banking" name="banking_details" defaultValue={p.banking} rows={2} className="input" placeholder="e.g. Sunrise Primary SGB, FNB cheque account 62000000000, branch 250655" />
        </div>
      </section>

      {p.online ? (
        <>
          <section className="glass p-6 space-y-4">
            <div>
              <label className="label" htmlFor="pay-mode">Mode</label>
              <select id="pay-mode" name="test_mode" defaultValue={p.testMode ? "1" : "0"} className="input sm:!w-96"><option value="1">Test (sandbox / staging, no real money)</option><option value="0">Live: real payments</option></select>
              <p className="text-xs muted mt-1">Use test mode with your test (sandbox) merchant details first. Switch to live with your live details when you are ready.</p>
            </div>
          </section>

          <section className="glass p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-600 grid place-items-center shrink-0"><CreditCard className="w-5 h-5" /></span>
              <div>
                <h2 className="font-semibold text-lg">PayFast</h2>
                <p className="text-sm muted">Card, Instant EFT, SnapScan, Zapper and more. Use the school&apos;s own PayFast merchant account (PayFast dashboard → Settings → Developer settings).</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="pf-on">PayFast</label>
                <select id="pf-on" name="payfast_enabled" defaultValue={p.payfast.enabled ? "1" : "0"} className="input"><option value="0">Off</option><option value="1">On: parents can pay with PayFast</option></select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="pf-id">Merchant ID</label>
                <input id="pf-id" name="payfast_merchant_id" defaultValue={p.payfast.merchantId} className="input" autoComplete="off" inputMode="numeric" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="pf-key">Merchant key</label>
                <input id="pf-key" name="payfast_merchant_key" type="password" className="input" autoComplete="new-password" placeholder={p.payfast.hasKey ? "Saved. Leave empty to keep it" : "Paste the merchant key"} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="pf-pass">Passphrase</label>
                <input id="pf-pass" name="payfast_passphrase" type="password" className="input" autoComplete="new-password" placeholder={p.payfast.hasPassphrase ? "Saved. Leave empty to keep it" : "Only if set in PayFast"} />
                {p.payfast.hasPassphrase && <label className="text-xs muted flex items-center gap-1.5 mt-1"><input type="checkbox" name="clear_passphrase" value="1" />Remove the saved passphrase</label>}
              </div>
              <p className="col-span-2 text-xs muted">PayFast confirms each payment to <span className="font-mono">{p.publicBase}/api/payfast/notify</span>. The key and passphrase are stored encrypted and never shown again.</p>
            </div>
          </section>

          <section className="glass p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-600 grid place-items-center shrink-0"><Landmark className="w-5 h-5" /></span>
              <div>
                <h2 className="font-semibold text-lg">Ozow</h2>
                <p className="text-sm muted">Parents pay straight from their bank&apos;s app. Use the school&apos;s own Ozow merchant account (dash.ozow.com → One API → Clients).</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="oz-on">Ozow</label>
                <select id="oz-on" name="ozow_enabled" defaultValue={p.ozow.enabled ? "1" : "0"} className="input"><option value="0">Off</option><option value="1">On: parents can pay with Ozow</option></select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="oz-site">Site code</label>
                <input id="oz-site" name="ozow_site_code" defaultValue={p.ozow.siteCode} className="input" autoComplete="off" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="oz-client">Client ID</label>
                <input id="oz-client" name="ozow_client_id" defaultValue={p.ozow.clientId} className="input" autoComplete="off" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor="oz-secret">Client secret</label>
                <input id="oz-secret" name="ozow_client_secret" type="password" className="input" autoComplete="new-password" placeholder={p.ozow.hasSecret ? "Saved. Leave empty to keep it" : "Paste the client secret"} />
              </div>
            </div>
            <button type="button" className="btn btn-ghost" disabled={test.busy || !p.ozow.hasSecret}
              onClick={async () => { setTest({ busy: true }); setTest(await testOzowConnection()); }}>
              <PlugZap className="w-4 h-4" />{test.busy ? "Testing..." : "Test Ozow connection"}
            </button>
            {test.error && <p role="alert" className="text-sm text-rose-600">{test.error}</p>}
            {test.ok && <p className="text-sm text-emerald-600">{test.message}</p>}
          </section>
        </>
      ) : (
        <section className="glass p-6"><h2 className="font-semibold text-lg">Online payments</h2><p className="text-sm muted mt-1">Online payments with PayFast and Ozow are not switched on for your school. Contact FerriDash to switch them on.</p></section>
      )}

      <section className="glass p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-butter-500/15 text-butter-600 grid place-items-center shrink-0"><BellRing className="w-5 h-5" /></span>
          <div>
            <h2 className="font-semibold text-lg">Automatic overdue reminders</h2>
            <p className="text-sm muted">{p.reminders
              ? "Every morning FerriDash reminds the parents of learners with overdue fees: a message in FerriDash Messages and a notification on their phone."
              : "Automatic reminders are not switched on for your school. You can still send reminders yourself from Fees Collection. Contact FerriDash to switch automatic reminders on."}</p>
          </div>
        </div>
        {p.reminders && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className="label" htmlFor="r-after">Start (days after the due date)</label>
              <input id="r-after" name="reminder_after_days" type="number" min={0} max={90} defaultValue={p.schedule.after} className="input" />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label className="label" htmlFor="r-every">Then every (days)</label>
              <input id="r-every" name="reminder_every_days" type="number" min={1} max={60} defaultValue={p.schedule.every} className="input" />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <label className="label" htmlFor="r-max">At most (reminders)</label>
              <input id="r-max" name="reminder_max" type="number" min={1} max={12} defaultValue={p.schedule.max} className="input" />
            </div>
          </div>
        )}
      </section>

      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-emerald-600">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Save fee settings"}</button>
    </form>
  );
}
