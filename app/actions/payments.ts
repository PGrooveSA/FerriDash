"use server";
import { revalidatePath } from "next/cache";
import { ownLearnerIds, requireCtx } from "@/lib/auth";
import { audit, get, run } from "@/lib/db";
import { ADMIN, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { createPayment, decryptSecret, encryptSecret, forgetToken, OzowError, testConnection } from "@/lib/ozow";
import {
  checkOnlinePayment, MIN_ONLINE_PAYMENT, newMerchantReference, outstanding, ozowConfig, PAYMENT_WINDOW_MINUTES, paymentSettings,
} from "@/lib/online-payments";

/** Ozow errors are written for people, so pass them through. */
const friendly = (e: unknown): never => { throw e instanceof OzowError ? new Error("!" + e.message) : e; };

export async function savePaymentSettings(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    if (!ctx.school.fee_paying) fail("Online payments are only for fee-paying schools.");
    const prev = await paymentSettings(ctx.schoolId);
    const enabled = str(f, "enabled") === "1", testMode = str(f, "test_mode") !== "0";
    const siteCode = opt(f, "site_code"), clientId = opt(f, "client_id"), secret = str(f, "client_secret");
    let publicUrl = opt(f, "public_url");
    if (publicUrl) {
      publicUrl = publicUrl.replace(/\/+$/, "");
      if (!/^https:\/\/[^/\s]+\.[^/\s]+/i.test(publicUrl)) fail("The public address must start with https:// and be reachable from the internet, or leave it empty.");
    }
    if (enabled && (!siteCode || !clientId || (!secret && !prev?.client_secret_enc))) fail("Enter the site code, client ID and client secret to switch online payments on.");
    if (siteCode && siteCode.length > 50) fail("The site code is too long.");
    await run(`INSERT INTO payment_settings (school_id, enabled, site_code, client_id, client_secret_enc, test_mode, public_url, updated_at)
         VALUES (?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(school_id) DO UPDATE SET enabled = excluded.enabled, site_code = excluded.site_code, client_id = excluded.client_id,
           client_secret_enc = COALESCE(excluded.client_secret_enc, payment_settings.client_secret_enc),
           test_mode = excluded.test_mode, public_url = excluded.public_url, updated_at = excluded.updated_at`,
            ctx.schoolId, enabled, siteCode, clientId, secret ? encryptSecret(secret) : null, testMode, publicUrl);
    if (prev?.client_id) forgetToken({ clientId: prev.client_id, testMode: !!prev.test_mode });
    await audit(ctx.schoolId, ctx.user.id, "update", "payment_settings", null, `${enabled ? "on" : "off"}, ${testMode ? "test" : "live"}`);
    revalidatePath("/settings");
    return { ok: true, message: enabled ? `Online payments are on (${testMode ? "test mode: no real money" : "live"}).` : "Settings saved. Online payments are off." };
  });
}

export async function testOzowConnection(): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const s = await paymentSettings(ctx.schoolId);
    if (!s?.site_code || !s.client_id || !s.client_secret_enc) fail("Save the site code, client ID and client secret first.");
    const clientSecret = decryptSecret(s.client_secret_enc) ?? fail("The saved client secret can't be read. Enter it again and save.");
    const cfg = { siteCode: s.site_code, clientId: s.client_id, clientSecret, testMode: !!s.test_mode };
    await testConnection(cfg).catch(friendly);
    return { ok: true, message: `Connected to Ozow (${cfg.testMode ? "test mode" : "live"}).` };
  });
}

export type StartPaymentResult = ActionResult & { redirect?: string };

/** A parent starts paying a child's fees: creates the Ozow payment and returns the page to send them to. */
export async function startOnlinePayment(_: StartPaymentResult, f: FormData): Promise<StartPaymentResult> {
  const ctx = await requireCtx(["parent"]);
  const learnerId = num(f, "learner_id") ?? 0;
  let paymentId = 0;
  const r = await guarded(["parent"], async () => {
    if (!ctx.school.fee_paying) fail("Your school does not charge fees.");
    if (!((await ownLearnerIds(ctx)) ?? []).includes(learnerId)) fail("Choose one of your children.");
    const cfg = (await ozowConfig(ctx.schoolId)) ?? fail("Online payments are not available at your school yet.");
    const amount = Math.round((num(f, "amount") ?? 0) * 100) / 100;
    const { total } = await outstanding(learnerId);
    if (total <= 0) fail("There is nothing to pay on this account.");
    if (!(amount >= Math.min(MIN_ONLINE_PAYMENT, total))) fail(`Pay at least R${Math.min(MIN_ONLINE_PAYMENT, total).toFixed(2)}.`);
    if (amount > total + 0.001) fail(`The balance due is R${total.toFixed(2)}. You can't pay more than that online.`);
    const l = (await get<{ admission_number: string; first_name: string; last_name: string }>("SELECT admission_number, first_name, last_name FROM learners WHERE id = ?", learnerId))!;
    const ref = newMerchantReference(ctx.schoolId, learnerId);
    const expires = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60000);
    paymentId = (await run("INSERT INTO online_payments (school_id, learner_id, user_id, amount, merchant_reference, test_mode, expires_at) VALUES (?,?,?,?,?,?,?)",
          ctx.schoolId, learnerId, ctx.user.id, amount, ref, cfg.testMode, expires.toISOString())).id;
    const payment = await createPayment(cfg, {
      amount, merchantReference: ref, expireAt: expires,
      beneficiaryReference: l.admission_number.replace(/[^A-Za-z0-9]/g, "").slice(0, 20),
      returnUrl: cfg.publicUrl ? `${cfg.publicUrl}/finance/pay/return?ref=${encodeURIComponent(ref)}` : undefined,
      payer: { id: String(ctx.user.id), name: `${ctx.user.first_name} ${ctx.user.last_name}`.slice(0, 200), email: ctx.user.email, cellphone: ctx.user.phone?.replace(/\s/g, "").slice(0, 15) },
    }).catch(friendly);
    await run("UPDATE online_payments SET provider_payment_id = ? WHERE id = ?", payment.id, paymentId);
    await audit(ctx.schoolId, ctx.user.id, "start_online_payment", "learner", learnerId, `R${amount.toFixed(2)} ${ref}`);
    return { ok: true, redirect: payment.redirectUrl } as StartPaymentResult;
  });
  // A payment Ozow never accepted can't be completed: mark it so it doesn't show as pending.
  if (r.error && paymentId) await run("UPDATE online_payments SET status = 'Failed', reason = ? WHERE id = ? AND provider_payment_id IS NULL", r.error, paymentId);
  return r;
}

/** Asks Ozow for the latest status of a payment (parents for their own children, admins for the school). */
export async function checkPayment(id: number): Promise<ActionResult & { status?: string }> {
  return guarded(["school_admin", "parent"], async (ctx) => {
    const op = await get<{ school_id: number; learner_id: number }>("SELECT school_id, learner_id FROM online_payments WHERE id = ?", id);
    if (!op || op.school_id !== ctx.schoolId || (!ctx.isAdmin && !((await ownLearnerIds(ctx)) ?? []).includes(op.learner_id))) fail("Payment not found.");
    const r = await checkOnlinePayment(id).catch(friendly);
    revalidatePath("/finance", "layout");
    revalidatePath("/dashboard");
    return { ok: true, status: r.status, message: r.status === "Successful" ? "Payment received. Thank you!" : r.status === "Failed" ? (r.reason ?? "The payment was not completed.") : "Still waiting for the bank to confirm." };
  });
}
