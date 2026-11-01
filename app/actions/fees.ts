"use server";
import { revalidatePath } from "next/cache";
import { ownLearnerIds, requireCtx, type Ctx } from "@/lib/auth";
import { all, audit, get, run, tx } from "@/lib/db";
import { ADMIN, fail, guarded, isDate, limit, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { gradeLabel, zar } from "@/lib/format";
import { MONTHS, today } from "@/lib/today";
import { notify, parentsOf } from "@/lib/push";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { createPayment, forgetToken, OzowError, testConnection } from "@/lib/ozow";
import { paymentForm } from "@/lib/payfast";
import {
  account, allocatePayment, billingSchedule, billLearners, checkOnlinePayment, feesOn, MIN_ONLINE_PAYMENT, newMerchantReference, onlineMethods, PAYMENT_WINDOW_MINUTES,
  paymentSettings, paymentsOn, publicBase, remindersOn, sendReminders,
} from "@/lib/fees";

/** Fees must be switched on for this school (fee-paying, with fee billing). */
const needFees = (ctx: Ctx) => { if (!feesOn(ctx.school)) fail("Fee billing is not switched on for your school."); };
const money = (n: number | null, what: string, allowZero = false) => {
  if (n == null || !(allowZero ? n >= 0 : n > 0) || n > 1e8) fail(`Enter ${what} in Rand${allowZero ? "" : ", more than R0"}.`);
  return Math.round(n * 100) / 100;
};
/** Ozow errors are written for people, so pass them through. */
const friendly = (e: unknown): never => { throw e instanceof OzowError ? new Error("!" + e.message) : e; };
const refresh = () => { revalidatePath("/finance", "layout"); revalidatePath("/dashboard"); };

// ---------------- Fee structure and invoices ----------------
export async function saveFeeStructure(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    const grade = num(f, "grade");
    if (grade == null || grade < 0 || grade > 12) fail("Choose a grade.");
    const tuition = money(num(f, "tuition"), "the tuition", true), activities = money(num(f, "activities") ?? 0, "the activities fee", true), other = money(num(f, "other") ?? 0, "other fees", true);
    if (tuition + activities + other <= 0) fail("Enter the fees for this grade.");
    await run(`INSERT INTO fee_structures (school_id, year, grade, tuition, activities, other) VALUES (?,?,?,?,?,?)
         ON CONFLICT(school_id, year, grade) DO UPDATE SET tuition = excluded.tuition, activities = excluded.activities, other = excluded.other`,
      ctx.schoolId, ctx.school.current_year, grade, tuition, activities, other);
    await audit(ctx.schoolId, ctx.user.id, "update", "fee_structure", grade, `${gradeLabel(grade)}: R${(tuition + activities + other).toFixed(2)} a year`);
    refresh();
  });
}

export async function deleteFeeStructure(grade: number) {
  return guarded(ADMIN, async (ctx) => {
    await run("DELETE FROM fee_structures WHERE school_id = ? AND year = ? AND grade = ?", ctx.schoolId, ctx.school.current_year, grade);
    refresh();
  });
}

/**
 * Bills every active learner in a class for the year, from their grade's fee structure: once for the year, per term
 * (due on each term's first day) or monthly (due on a chosen day). Learners already billed this year are skipped.
 */
export async function generateInvoices(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    const year = ctx.school.current_year, plan = str(f, "plan");
    let periods: { period: string; due: string; label: string }[];
    if (plan === "year") {
      const due = str(f, "due_date");
      if (!isDate(due)) fail("Choose the date the year's fees are due.");
      periods = [{ period: "Year", due, label: "full year" }];
    } else if (plan === "term") {
      const terms = await all<{ number: number; start_date: string }>("SELECT number, start_date FROM terms WHERE school_id = ? AND year = ? ORDER BY number", ctx.schoolId, year);
      if (terms.length < 4) fail("Set all four term dates under Settings first: termly fees are due on each term's first day.");
      periods = terms.map((t) => ({ period: `Term ${t.number}`, due: t.start_date, label: `Term ${t.number}` }));
    } else if (plan === "month") {
      const months = num(f, "months") === 12 ? 12 : num(f, "months") === 11 ? 11 : 10, day = num(f, "due_day") ?? 1;
      if (day < 1 || day > 28) fail("Choose a due day between 1 and 28.");
      periods = Array.from({ length: months }, (_, i) => ({ period: MONTHS[i], due: `${year}-${String(i + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, label: MONTHS[i] }));
    } else fail("Choose how the fees are paid.");

    const billed = await billLearners(ctx.schoolId, year, periods);
    if (!billed) fail("Every learner with fees set for their grade has already been billed this year (or no grade fees are set yet).");
    const n = periods.length;
    await audit(ctx.schoolId, ctx.user.id, "generate_invoices", "invoice", null, `${billed} learner(s), ${n} instalment(s) each`);
    refresh();
    return { ok: true, message: `Billed ${billed} learner${billed === 1 ? "" : "s"} (${n} instalment${n === 1 ? "" : "s"} each).` };
  });
}

/**
 * Bills learners who missed the year's billing (joined later, or had no class or grade fees then) on the schedule the
 * school already uses, from the current instalment on. One learner, or everyone not billed yet.
 */
export async function billNow(learnerId: number | null): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    const year = ctx.school.current_year;
    const schedule = (await billingSchedule(ctx.schoolId, year)) ?? fail("Nobody has been billed this year yet. Use Generate invoices first to choose how parents pay.");
    const billed = await billLearners(ctx.schoolId, year, schedule, { learnerIds: learnerId ? [learnerId] : undefined, fromNow: true });
    if (!billed) fail(learnerId ? "This learner can't be billed yet: put them in a class and set the fees for their grade first." : "Nobody can be billed yet: the learners left need a class, or fees for their grade.");
    await audit(ctx.schoolId, ctx.user.id, "generate_invoices", "invoice", learnerId, `${billed} learner(s), from the current instalment`);
    refresh();
    return { ok: true, message: `Billed ${billed} learner${billed === 1 ? "" : "s"}.` };
  });
}

/** An extra charge (a school trip, uniform, exam fee...) for one learner or a whole class. */
export async function addCharge(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    const description = str(f, "description"), due = str(f, "due_date");
    const amount = money(num(f, "amount"), "the amount");
    if (!description) fail("Describe the charge.");
    if (!isDate(due)) fail("Choose the date it is due.");
    const learnerId = num(f, "learner_id"), classId = num(f, "class_id");
    const ids = learnerId
      ? (await all<{ id: number }>("SELECT id FROM learners WHERE id = ? AND school_id = ?", learnerId, ctx.schoolId))
      : classId ? (await all<{ id: number }>("SELECT id FROM learners WHERE class_id = ? AND school_id = ? AND status = 'Active'", classId, ctx.schoolId)) : [];
    if (!ids.length) fail(learnerId ? "Learner not found." : "Choose a class with active learners.");
    await tx(async () => {
      for (const l of ids) await run("INSERT INTO invoices (school_id, learner_id, year, period, description, amount, due_date) VALUES (?,?,?,NULL,?,?,?)", ctx.schoolId, l.id, ctx.school.current_year, description, amount, due);
    });
    await audit(ctx.schoolId, ctx.user.id, "charge", "invoice", learnerId ?? null, `${description}: R${amount.toFixed(2)} × ${ids.length}`);
    refresh();
    return { ok: true, message: `Charged ${ids.length} learner${ids.length === 1 ? "" : "s"}.` };
  });
}

/** Removes an invoice that has nothing paid on it. */
export async function deleteInvoice(id: number) {
  return guarded(ADMIN, async (ctx) => {
    if (await get("SELECT id FROM payments WHERE invoice_id = ? LIMIT 1", id)) fail("Payments are recorded on this invoice. Remove them first.");
    if ((await run("DELETE FROM invoices WHERE id = ? AND school_id = ?", id, ctx.schoolId)).changes) await audit(ctx.schoolId, ctx.user.id, "delete", "invoice", id);
    refresh();
  });
}

// ---------------- Payments recorded by the office ----------------
export async function recordPayment(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    const learnerId = num(f, "learner_id") ?? 0, amount = money(num(f, "amount"), "the amount"), paidOn = str(f, "paid_on");
    const method = str(f, "method") || "EFT";
    if (!["EFT", "Cash", "Card", "Debit order", "Exemption"].includes(method)) fail("Choose how it was paid.");
    if (!isDate(paidOn) || paidOn > today()) fail("Choose the date it was paid (not in the future).");
    const l = (await get<{ first_name: string }>("SELECT first_name FROM learners WHERE id = ? AND school_id = ?", learnerId, ctx.schoolId)) ?? fail("Learner not found.");
    const { total } = await account(learnerId);
    if (method === "Exemption" && amount > total + 0.001) fail(`An exemption can't be more than the balance (${zar(total)}).`);
    const receipt = await allocatePayment({ schoolId: ctx.schoolId, learnerId, amount, paidOn, method, reference: opt(f, "reference"), recordedBy: ctx.user.id });
    await audit(ctx.schoolId, ctx.user.id, "payment", "learner", learnerId, `R${amount.toFixed(2)} ${method} ${receipt}`);
    if (method !== "Exemption") notify(await parentsOf(learnerId), { title: "Payment received", body: `${zar(amount)} for ${l.first_name}. Thank you.`, url: `/finance/statement?learner=${learnerId}` });
    refresh();
    return { ok: true, message: `Receipt ${receipt} recorded.` };
  });
}

/** Removes a recorded payment (every part of it, if it was spread over several invoices). */
export async function deletePayment(receipt: string) {
  return guarded(ADMIN, async (ctx) => {
    const r = await run("DELETE FROM payments WHERE receipt = ? AND school_id = ?", receipt, ctx.schoolId);
    if (r.changes) await audit(ctx.schoolId, ctx.user.id, "delete", "payment", null, receipt);
    refresh();
  });
}

// ---------------- Settings: the school's merchant accounts and reminder schedule ----------------
export async function savePaymentSettings(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    const prev = await paymentSettings(ctx.schoolId);
    const online = paymentsOn(ctx.school), reminders = remindersOn(ctx.school);
    const testMode = str(f, "test_mode") !== "0";
    const pfOn = online && str(f, "payfast_enabled") === "1", ozOn = online && str(f, "ozow_enabled") === "1";
    const pfId = online ? opt(f, "payfast_merchant_id") : prev?.payfast_merchant_id ?? null, pfKey = online ? str(f, "payfast_merchant_key") : "", pfPass = online ? str(f, "payfast_passphrase") : "";
    const ozSite = online ? opt(f, "ozow_site_code") : prev?.ozow_site_code ?? null, ozClient = online ? opt(f, "ozow_client_id") : prev?.ozow_client_id ?? null, ozSecret = online ? str(f, "ozow_client_secret") : "";
    if (pfId && !/^\d{5,12}$/.test(pfId)) fail("The PayFast merchant ID is a number (see your PayFast dashboard → Settings).");
    if (pfOn && (!pfId || (!pfKey && !prev?.payfast_merchant_key_enc))) fail("Enter the PayFast merchant ID and merchant key to switch PayFast on.");
    if (ozOn && (!ozSite || !ozClient || (!ozSecret && !prev?.ozow_client_secret_enc))) fail("Enter the Ozow site code, client ID and client secret to switch Ozow on.");
    if ([pfKey, pfPass, ozSecret, ozSite ?? "", ozClient ?? ""].some((v) => v.length > 200)) fail("One of the merchant details is too long.");
    const after = reminders ? Math.round(num(f, "reminder_after_days") ?? 3) : prev?.reminder_after_days ?? 3;
    const every = reminders ? Math.round(num(f, "reminder_every_days") ?? 7) : prev?.reminder_every_days ?? 7;
    const max = reminders ? Math.round(num(f, "reminder_max") ?? 4) : prev?.reminder_max ?? 4;
    if (after < 0 || after > 90 || every < 1 || every > 60 || max < 1 || max > 12) fail("Check the reminder schedule: start 0 to 90 days after the due date, every 1 to 60 days, at most 1 to 12 reminders.");
    const banking = opt(f, "banking_details");
    if (banking && banking.length > 500) fail("Keep the banking details under 500 characters.");
    // Empty secret fields keep what is saved; "clear" removes the PayFast passphrase.
    await run(`INSERT INTO payment_settings (school_id, test_mode, payfast_enabled, payfast_merchant_id, payfast_merchant_key_enc, payfast_passphrase_enc,
           ozow_enabled, ozow_site_code, ozow_client_id, ozow_client_secret_enc, reminder_after_days, reminder_every_days, reminder_max, banking_details, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(school_id) DO UPDATE SET test_mode = excluded.test_mode, payfast_enabled = excluded.payfast_enabled, payfast_merchant_id = excluded.payfast_merchant_id,
           payfast_merchant_key_enc = COALESCE(excluded.payfast_merchant_key_enc, payment_settings.payfast_merchant_key_enc),
           payfast_passphrase_enc = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(excluded.payfast_passphrase_enc, payment_settings.payfast_passphrase_enc) END,
           ozow_enabled = excluded.ozow_enabled, ozow_site_code = excluded.ozow_site_code, ozow_client_id = excluded.ozow_client_id,
           ozow_client_secret_enc = COALESCE(excluded.ozow_client_secret_enc, payment_settings.ozow_client_secret_enc),
           reminder_after_days = excluded.reminder_after_days, reminder_every_days = excluded.reminder_every_days, reminder_max = excluded.reminder_max,
           banking_details = excluded.banking_details, updated_at = excluded.updated_at`,
      ctx.schoolId, testMode, pfOn, pfId, pfKey ? encryptSecret(pfKey) : null, pfPass ? encryptSecret(pfPass) : null,
      ozOn, ozSite, ozClient, ozSecret ? encryptSecret(ozSecret) : null, after, every, max, banking, str(f, "clear_passphrase") === "1" ? 1 : 0);
    if (prev?.ozow_client_id) forgetToken({ clientId: prev.ozow_client_id, testMode: !!prev.test_mode });
    await audit(ctx.schoolId, ctx.user.id, "update", "payment_settings", null, `PayFast ${pfOn ? "on" : "off"}, Ozow ${ozOn ? "on" : "off"}, ${testMode ? "test" : "live"}`);
    revalidatePath("/finance", "layout");
    return { ok: true, message: online && (pfOn || ozOn) ? `Saved. Parents can pay online with ${[pfOn && "PayFast", ozOn && "Ozow"].filter(Boolean).join(" and ")}${testMode ? " (test mode: no real money)" : ""}.` : "Settings saved." };
  });
}

export async function testOzowConnection(): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const s = await paymentSettings(ctx.schoolId);
    if (!s?.ozow_site_code || !s.ozow_client_id || !s.ozow_client_secret_enc) fail("Save the Ozow site code, client ID and client secret first.");
    const clientSecret = decryptSecret(s.ozow_client_secret_enc) ?? fail("The saved client secret can't be read. Enter it again and save.");
    const cfg = { siteCode: s.ozow_site_code, clientId: s.ozow_client_id, clientSecret, testMode: !!s.test_mode };
    await testConnection(cfg).catch(friendly);
    return { ok: true, message: `Connected to Ozow (${cfg.testMode ? "test mode" : "live"}).` };
  });
}

/** School admin: remind the parents of these learners (or of everyone overdue) now. */
export async function remindNow(learnerIds: number[] | null): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    needFees(ctx);
    await limit(ctx, "fee_reminders", 10, 3600);
    const n = await sendReminders(ctx.schoolId, { automatic: false, learnerIds: learnerIds ?? undefined, byUserId: ctx.user.id });
    refresh();
    return { ok: true, message: n ? `Reminded the parents of ${n} learner${n === 1 ? "" : "s"}.` : "Nobody to remind: no overdue accounts, or they were already reminded today." };
  });
}

// ---------------- Online payments (parents) ----------------
export type StartPaymentResult = ActionResult & { redirect?: string; form?: { action: string; fields: [string, string][] } };

/** A parent starts paying a child's fees with PayFast or Ozow. Returns where to send them. */
export async function startOnlinePayment(_: StartPaymentResult, f: FormData): Promise<StartPaymentResult> {
  const ctx = await requireCtx(["parent"]);
  const learnerId = num(f, "learner_id") ?? 0;
  let paymentId = 0;
  const r = await guarded(["parent"], async () => {
    if (!paymentsOn(ctx.school)) fail("Online payments are not available at your school.");
    await limit(ctx, "online_payment", 20, 3600);
    if (!((await ownLearnerIds(ctx)) ?? []).includes(learnerId)) fail("Choose one of your children.");
    const methods = await onlineMethods(ctx.schoolId);
    const provider = str(f, "provider") === "Ozow" ? "Ozow" : "PayFast";
    const cfg = provider === "Ozow" ? methods.ozow : methods.payfast;
    if (!cfg) fail(`${provider} is not available at your school.`);
    const amount = Math.round((num(f, "amount") ?? 0) * 100) / 100;
    const { total } = await account(learnerId);
    if (total <= 0) fail("There is nothing to pay on this account.");
    if (!(amount >= Math.min(MIN_ONLINE_PAYMENT, total))) fail(`Pay at least ${zar(Math.min(MIN_ONLINE_PAYMENT, total))}.`);
    if (amount > total + 0.001) fail(`The balance is ${zar(total)}. You can't pay more than that online.`);
    const l = (await get<{ admission_number: string; first_name: string; last_name: string }>("SELECT admission_number, first_name, last_name FROM learners WHERE id = ?", learnerId))!;
    const ref = newMerchantReference(ctx.schoolId, learnerId);
    const expires = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60000);
    paymentId = (await run("INSERT INTO online_payments (school_id, learner_id, user_id, provider, amount, merchant_reference, test_mode, expires_at) VALUES (?,?,?,?,?,?,?,?)",
      ctx.schoolId, learnerId, ctx.user.id, provider, amount, ref, methods.testMode, expires.toISOString())).id;
    const base = await publicBase();
    const back = `${base}/finance/pay/return?ref=${encodeURIComponent(ref)}`;
    await audit(ctx.schoolId, ctx.user.id, "start_online_payment", "learner", learnerId, `R${amount.toFixed(2)} ${provider} ${ref}`);
    if (provider === "PayFast") {
      const form = paymentForm(methods.payfast!, {
        returnUrl: back, cancelUrl: `${back}&cancelled=1`, notifyUrl: `${base}/api/payfast/notify`,
        firstName: ctx.user.first_name, lastName: ctx.user.last_name, email: ctx.user.email, cell: ctx.user.phone,
        reference: ref, amount, itemName: `School fees: ${l.first_name} ${l.last_name}`, itemDescription: `${ctx.school.name} - ${l.admission_number}`,
      });
      return { ok: true, form } as StartPaymentResult;
    }
    const payment = await createPayment(methods.ozow!, {
      amount, merchantReference: ref, expireAt: expires, returnUrl: back,
      beneficiaryReference: l.admission_number.replace(/[^A-Za-z0-9]/g, "").slice(0, 20),
      payer: { id: String(ctx.user.id), name: `${ctx.user.first_name} ${ctx.user.last_name}`.slice(0, 200), email: ctx.user.email, cellphone: ctx.user.phone?.replace(/\s/g, "").slice(0, 15) },
    }).catch(friendly);
    await run("UPDATE online_payments SET provider_payment_id = ? WHERE id = ?", payment.id, paymentId);
    return { ok: true, redirect: payment.redirectUrl } as StartPaymentResult;
  });
  // An Ozow payment Ozow never accepted can't be completed: mark it so it doesn't show as waiting.
  if (r.error && paymentId) await run("UPDATE online_payments SET status = 'Failed', reason = ? WHERE id = ? AND provider = 'Ozow' AND provider_payment_id IS NULL", r.error, paymentId);
  return r;
}

/** The latest status of an online payment (parents for their own children, admins for the school). */
export async function checkPayment(id: number): Promise<ActionResult & { status?: string }> {
  return guarded(["school_admin", "parent"], async (ctx) => {
    const op = await get<{ school_id: number; learner_id: number }>("SELECT school_id, learner_id FROM online_payments WHERE id = ?", id);
    if (!op || op.school_id !== ctx.schoolId || (!ctx.isAdmin && !((await ownLearnerIds(ctx)) ?? []).includes(op.learner_id))) fail("Payment not found.");
    const r = await checkOnlinePayment(id).catch(friendly);
    refresh();
    return { ok: true, status: r.status, message: r.status === "Successful" ? "Payment received. Thank you!" : r.status === "Failed" ? (r.reason ?? "The payment was not completed.") : "Still waiting for confirmation." };
  });
}
