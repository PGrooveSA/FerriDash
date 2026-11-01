import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { all } from "@/lib/db";
import { PROVINCES, logoUrl } from "@/lib/format";
import { CAPS_LEVELS, SBA_WEIGHT } from "@/lib/caps";
import { Card, PageHeader } from "@/components/ui/kit";
import { DEFAULT_SETTINGS, feesOn, paymentSettings, paymentsOn, publicBase, remindersOn } from "@/lib/fees";
import PaymentSettingsForm from "../finance/settings/PaymentSettingsForm";
import SettingsForm from "./SettingsForm";
import LogoUploader from "./LogoUploader";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  // The school's settings. Everyone changes their own language from the top bar (components/shell/LanguageMenu.tsx).
  const ctx = await requireCtx(["school_admin"]);
  const t = tFor(ctx.user);
  const terms = await all<{ number: number; start_date: string; end_date: string }>("SELECT number, start_date, end_date FROM terms WHERE school_id = ? AND year = ? ORDER BY number", ctx.schoolId, ctx.school.current_year);
  const fees = feesOn(ctx.school);
  const pay = fees ? { ...DEFAULT_SETTINGS, ...(await paymentSettings(ctx.schoolId)) } : null;
  const logs = await all<{ action: string; entity: string; created_at: string; name: string | null; detail: string | null }>(`SELECT a.action, a.entity, a.created_at, a.detail, u.first_name || ' ' || u.last_name name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.school_id = ? ORDER BY a.id DESC LIMIT 15`, ctx.schoolId);
  return (
    <>
      <PageHeader title={t("Settings")} subtitle={t("The school's profile, academic calendar and CAPS assessment configuration.")} />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_24rem] gap-6">
        <div className="space-y-6">
          <LogoUploader logo={logoUrl(ctx.schoolId, ctx.school.logo_updated_at)} schoolName={ctx.school.name} />
          <SettingsForm school={ctx.school} terms={terms} provinces={PROVINCES} />
          {/* The school's own PayFast and Ozow accounts and the reminder schedule (also under Finance → Fee Settings). */}
          {pay && <PaymentSettingsForm
            online={paymentsOn(ctx.school)} reminders={remindersOn(ctx.school)} publicBase={await publicBase()}
            testMode={!!pay.test_mode} banking={pay.banking_details ?? ""}
            payfast={{ enabled: !!pay.payfast_enabled, merchantId: "payfast_merchant_id" in pay ? pay.payfast_merchant_id ?? "" : "", hasKey: "payfast_merchant_key_enc" in pay && !!pay.payfast_merchant_key_enc, hasPassphrase: "payfast_passphrase_enc" in pay && !!pay.payfast_passphrase_enc }}
            ozow={{ enabled: !!pay.ozow_enabled, siteCode: "ozow_site_code" in pay ? pay.ozow_site_code ?? "" : "", clientId: "ozow_client_id" in pay ? pay.ozow_client_id ?? "" : "", hasSecret: "ozow_client_secret_enc" in pay && !!pay.ozow_client_secret_enc }}
            schedule={{ after: pay.reminder_after_days, every: pay.reminder_every_days, max: pay.reminder_max }} />}
        </div>
        <div className="space-y-6">
          <Card title="Fees and online payments">
            {!ctx.school.fee_paying ? <p className="text-sm muted">No-fee school: no school fees are billed. Record spending under Finance → School Expenses.</p> : (
              <>
                <ul className="text-sm space-y-2">
                  {([["Fee billing and statements", fees], ["Online payments (PayFast, Ozow)", paymentsOn(ctx.school)], ["Automatic overdue reminders", remindersOn(ctx.school)]] as const).map(([label, on]) => (
                    <li key={label} className="flex justify-between gap-3"><span>{label}</span><span className={`chip ${on ? "chip-green" : "chip-slate"}`}>{on ? "On" : "Off"}</span></li>
                  ))}
                </ul>
                <p className="text-xs muted mt-3">{fees
                  ? <>Bill learners and record payments under <Link href="/finance/fees" className="underline">Finance → Fees Collection</Link>. Connect PayFast or Ozow in the payment settings on this page.</>
                  : "FerriDash switches these on for fee-paying schools. Contact FerriDash support to switch them on."}</p>
              </>
            )}
          </Card>
          <Card title="CAPS achievement levels">
            <table className="table text-sm"><thead><tr><th>Level</th><th>Mark</th><th>Descriptor</th></tr></thead>
              <tbody>{CAPS_LEVELS.map((l) => <tr key={l.level}><td className="font-bold">{l.level}</td><td>{l.min}–{l.max}%</td><td>{l.descriptor}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Assessment weighting by phase">
            <ul className="text-sm space-y-2">{Object.entries(SBA_WEIGHT).map(([p, w]) => <li key={p} className="flex justify-between"><span>{p} Phase</span><span className="muted">SBA {w * 100}% · Exams {Math.round((1 - w) * 100)}%</span></li>)}</ul>
            <p className="text-xs muted mt-3">Promotion rules follow the National Policy on Programme and Promotion Requirements. Verify against the latest DBE circulars.</p>
          </Card>
          <Card title="Audit trail">
            <ul className="text-xs space-y-2">{logs.map((l, i) => <li key={i}><b>{l.name ?? "System"}</b> {l.action.replace("_", " ")} {l.entity} <span className="muted">· {l.created_at}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
