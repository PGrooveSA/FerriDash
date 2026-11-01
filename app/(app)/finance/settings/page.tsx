import { requireCtx } from "@/lib/auth";
import { DEFAULT_SETTINGS, feesOn, paymentSettings, paymentsOn, publicBase, remindersOn } from "@/lib/fees";
import { PageHeader } from "@/components/ui/kit";
import FeesOff from "../FeesOff";
import PaymentSettingsForm from "./PaymentSettingsForm";

export const metadata = { title: "Fee settings" };

export default async function FeeSettingsPage() {
  const ctx = await requireCtx(["school_admin"]);
  if (!feesOn(ctx.school)) return <FeesOff title="Fee settings" />;
  const s = { ...DEFAULT_SETTINGS, ...(await paymentSettings(ctx.schoolId)) };
  return (
    <>
      <PageHeader title="Fee settings" subtitle="How parents pay, and when they are reminded about overdue fees." />
      <div className="max-w-3xl">
        <PaymentSettingsForm
          online={paymentsOn(ctx.school)} reminders={remindersOn(ctx.school)} publicBase={await publicBase()}
          testMode={!!s.test_mode} banking={s.banking_details ?? ""}
          payfast={{ enabled: !!s.payfast_enabled, merchantId: "payfast_merchant_id" in s ? s.payfast_merchant_id ?? "" : "", hasKey: "payfast_merchant_key_enc" in s && !!s.payfast_merchant_key_enc, hasPassphrase: "payfast_passphrase_enc" in s && !!s.payfast_passphrase_enc }}
          ozow={{ enabled: !!s.ozow_enabled, siteCode: "ozow_site_code" in s ? s.ozow_site_code ?? "" : "", clientId: "ozow_client_id" in s ? s.ozow_client_id ?? "" : "", hasSecret: "ozow_client_secret_enc" in s && !!s.ozow_client_secret_enc }}
          schedule={{ after: s.reminder_after_days, every: s.reminder_every_days, max: s.reminder_max }} />
      </div>
    </>
  );
}
