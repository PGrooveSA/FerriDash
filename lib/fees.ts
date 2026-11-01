// School fees for fee-paying schools: who has them switched on, what each learner owes, recording payments
// (by the office or online with PayFast or Ozow) and reminding parents about overdue fees.
//
// The platform admin switches each part on per school (schools.fee_billing, online_payments, fee_reminders), and
// only for fee-paying schools. No-fee schools never see fees; every school keeps School Expenses.
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { School } from "./auth";
import { all, audit, get, run, tx } from "./db";
import { notify, parentsOf } from "./push";
import { zar, fmtDate } from "./format";
import { addDays, today } from "./today";
import { decryptSecret } from "./secrets";
import { paymentTransactions, OzowError, type OzowConfig } from "./ozow";
import { verifyItn, type PayfastConfig } from "./payfast";

type Flags = Pick<School, "fee_paying" | "fee_billing" | "online_payments" | "fee_reminders">;
/** Fees, invoices and statements. */
export const feesOn = (s: Flags) => !!s.fee_paying && !!s.fee_billing;
/** Parents may pay online (the school still has to connect PayFast or Ozow). */
export const paymentsOn = (s: Flags) => feesOn(s) && !!s.online_payments;
/** Overdue-fee reminders are sent automatically. */
export const remindersOn = (s: Flags) => feesOn(s) && !!s.fee_reminders;

export type PaymentSettings = {
  school_id: number; test_mode: number;
  payfast_enabled: number; payfast_merchant_id: string | null; payfast_merchant_key_enc: string | null; payfast_passphrase_enc: string | null;
  ozow_enabled: number; ozow_site_code: string | null; ozow_client_id: string | null; ozow_client_secret_enc: string | null;
  reminder_after_days: number; reminder_every_days: number; reminder_max: number; banking_details: string | null; updated_at: string | null;
};
export const DEFAULT_SETTINGS = { test_mode: 1, payfast_enabled: 0, ozow_enabled: 0, reminder_after_days: 3, reminder_every_days: 7, reminder_max: 4, banking_details: null };

export const paymentSettings = (schoolId: number) => get<PaymentSettings>("SELECT * FROM payment_settings WHERE school_id = ?", schoolId);

const schoolFlags = (schoolId: number) =>
  get<Flags & { active: number }>("SELECT fee_paying, fee_billing, online_payments, fee_reminders, active FROM schools WHERE id = ?", schoolId);

/** PayFast details as saved, whether or not payments are switched on (an ITN for an earlier payment must still be checked). */
function payfastOf(s: PaymentSettings | undefined): PayfastConfig | null {
  if (!s?.payfast_merchant_id || !s.payfast_merchant_key_enc) return null;
  const key = decryptSecret(s.payfast_merchant_key_enc);
  if (!key) return null;
  return { merchantId: s.payfast_merchant_id, merchantKey: key, passphrase: decryptSecret(s.payfast_passphrase_enc), testMode: !!s.test_mode };
}
function ozowOf(s: PaymentSettings | undefined): OzowConfig | null {
  if (!s?.ozow_site_code || !s.ozow_client_id) return null;
  const secret = decryptSecret(s.ozow_client_secret_enc);
  return secret ? { siteCode: s.ozow_site_code, clientId: s.ozow_client_id, clientSecret: secret, testMode: !!s.test_mode } : null;
}

/** The payment methods parents can use right now at this school. */
export async function onlineMethods(schoolId: number): Promise<{ payfast: PayfastConfig | null; ozow: OzowConfig | null; testMode: boolean }> {
  const f = await schoolFlags(schoolId);
  const s = await paymentSettings(schoolId);
  if (!f || !paymentsOn(f) || !s) return { payfast: null, ozow: null, testMode: false };
  return { payfast: s.payfast_enabled ? payfastOf(s) : null, ozow: s.ozow_enabled ? ozowOf(s) : null, testMode: !!s.test_mode };
}

/** This site's address, for the links PayFast and Ozow send parents (and PayFast's notifications) back to. */
export async function publicBase(): Promise<string> {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3100";
  const proto = h.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

// ---------------- Accounts ----------------
export type InvoiceLine = { id: number; period: string | null; description: string; amount: number; due_date: string; paid: number; balance: number };
export type Account = {
  invoices: InvoiceLine[];
  /** Everything still owed (negative: the account is in credit). */
  total: number;
  /** Owed on invoices due today or earlier. */
  dueNow: number;
  /** Owed on invoices whose due date has passed, and the oldest such due date. */
  overdue: number; overdueSince: string | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

export async function account(learnerId: number, asOf = today()): Promise<Account> {
  const invoices = await all<InvoiceLine>(`
    SELECT i.id, i.period, i.description, i.amount, i.due_date, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) paid, 0 balance
    FROM invoices i WHERE i.learner_id = ? ORDER BY i.due_date, i.id`, learnerId);
  for (const i of invoices) i.balance = cents(i.amount - i.paid);
  const owing = invoices.filter((i) => i.balance > 0.005);
  const late = owing.filter((i) => i.due_date < asOf);
  return {
    invoices,
    total: cents(invoices.reduce((t, i) => t + i.balance, 0)),
    dueNow: cents(owing.filter((i) => i.due_date <= asOf).reduce((t, i) => t + i.balance, 0)),
    overdue: cents(late.reduce((t, i) => t + i.balance, 0)),
    overdueSince: late[0]?.due_date ?? null,
  };
}

const newReceipt = () => ("RC" + Date.now().toString(36) + randomBytes(2).toString("hex")).toUpperCase();

/**
 * Records one payment against a learner's invoices, oldest due first. Anything left over goes on the latest
 * invoice as a credit. Returns the receipt number shared by the parts.
 */
export async function allocatePayment(p: {
  schoolId: number; learnerId: number; amount: number; paidOn: string; method: string; reference: string | null; recordedBy: number | null; onlinePaymentId?: number;
}): Promise<string> {
  return tx(async () => {
    const { invoices } = await account(p.learnerId);
    if (!invoices.length) throw new Error("!This learner has no fees billed yet.");
    const receipt = newReceipt();
    let left = cents(p.amount);
    const put = (invoiceId: number, amount: number) => run(
      "INSERT INTO payments (school_id, invoice_id, amount, paid_on, method, reference, receipt, recorded_by, online_payment_id) VALUES (?,?,?,?,?,?,?,?,?)",
      p.schoolId, invoiceId, amount, p.paidOn, p.method, p.reference, receipt, p.recordedBy, p.onlinePaymentId ?? null);
    for (const inv of invoices) {
      if (left <= 0) break;
      const part = cents(Math.min(left, inv.balance));
      if (part <= 0) continue;
      await put(inv.id, part);
      left = cents(left - part);
    }
    if (left > 0) await put(invoices[invoices.length - 1].id, left);
    return receipt;
  });
}

// ---------------- Online payments ----------------
export type OnlinePayment = {
  id: number; school_id: number; learner_id: number; user_id: number | null; provider: "PayFast" | "Ozow"; amount: number; merchant_reference: string;
  provider_payment_id: string | null; provider_transaction_id: string | null; test_mode: number;
  status: "Created" | "Pending" | "Successful" | "Failed"; reason: string | null; expires_at: string; created_at: string;
  checked_at: string | null; completed_at: string | null;
};

export const PAYMENT_WINDOW_MINUTES = 30;
export const MIN_ONLINE_PAYMENT = 10;

export const newMerchantReference = (schoolId: number, learnerId: number) =>
  `FD${schoolId}-${learnerId}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.toUpperCase();

/** Records a confirmed online payment on the learner's account. Safe to call more than once: only the first call records. */
async function recordSuccess(op: OnlinePayment, transactionId: string, amount: number, completedAt: string | null) {
  const recorded = await tx(async () => {
    const claimed = await run("UPDATE online_payments SET status = 'Successful', provider_transaction_id = ?, reason = NULL, completed_at = ?, checked_at = datetime('now') WHERE id = ? AND status <> 'Successful'",
      transactionId, completedAt ?? new Date().toISOString(), op.id);
    if (!claimed.changes) return false;
    await allocatePayment({
      schoolId: op.school_id, learnerId: op.learner_id, amount, paidOn: (completedAt ?? new Date().toISOString()).slice(0, 10),
      method: op.provider, reference: `${transactionId.slice(0, 12)}${op.test_mode ? " · test" : ""}`, recordedBy: op.user_id, onlinePaymentId: op.id,
    });
    await audit(op.school_id, op.user_id, "online_payment", "learner", op.learner_id, `R${amount.toFixed(2)} via ${op.provider} (${op.merchant_reference})`);
    return true;
  });
  if (recorded) {
    const l = await get<{ first_name: string }>("SELECT first_name FROM learners WHERE id = ?", op.learner_id);
    notify(await parentsOf(op.learner_id), { title: "Payment received", body: `${zar(amount)} for ${l?.first_name ?? "your child"} (${op.provider}). Thank you.`, url: "/finance/statement" });
  }
}

/**
 * Brings an online payment up to date. Ozow is asked how it went; PayFast reports by ITN, so a PayFast payment that
 * never got one is marked not completed a while after its link expired (a late ITN still records it).
 */
export async function checkOnlinePayment(id: number): Promise<OnlinePayment> {
  const op = await get<OnlinePayment>("SELECT * FROM online_payments WHERE id = ?", id);
  if (!op) throw new OzowError("Payment not found.");
  if (op.status === "Successful" || op.status === "Failed") return op;
  const expired = Date.now() > Date.parse(op.expires_at) + 5 * 60000;
  if (op.provider === "PayFast") {
    if (Date.now() > Date.parse(op.expires_at) + 2 * 3600000) await run("UPDATE online_payments SET status = 'Failed', reason = COALESCE(reason, 'The payment was not completed.'), checked_at = datetime('now') WHERE id = ? AND status IN ('Created','Pending')", op.id);
  } else if (op.provider_payment_id) {
    const cfg = ozowOf(await paymentSettings(op.school_id));
    if (!cfg) throw new OzowError("Ozow is not set up for this school any more.");
    if (!!op.test_mode !== cfg.testMode) throw new OzowError("This payment was made in a different Ozow mode (test or live). Ask the school to check it.");
    const txs = await paymentTransactions(cfg, op.provider_payment_id, new Date(op.created_at.replace(" ", "T") + "Z"));
    const ours = txs.filter((t) => !t.merchantReference || t.merchantReference === op.merchant_reference);
    const ok = ours.find((t) => t.status === "Successful");
    if (ok) {
      await recordSuccess(op, ok.id, Number(ok.amount?.value ?? op.amount), ok.completedDate ?? null);
    } else {
      const latest = [...ours].sort((a, b) => (b.createdDate ?? "").localeCompare(a.createdDate ?? ""))[0];
      const pending = ours.some((t) => t.status === "Pending");
      const status = pending ? "Pending" : expired ? "Failed" : op.status;
      const reason = latest?.reason ?? (latest ? latest.status : expired ? "The payment was not completed." : null);
      await run("UPDATE online_payments SET status = ?, reason = ?, checked_at = datetime('now') WHERE id = ? AND status <> 'Successful'", status, reason, op.id);
    }
  } else if (expired) {
    await run("UPDATE online_payments SET status = 'Failed', reason = COALESCE(reason, 'The payment was not started.') WHERE id = ? AND status <> 'Successful'", op.id);
  }
  return (await get<OnlinePayment>("SELECT * FROM online_payments WHERE id = ?", id))!;
}

/** A PayFast ITN (app/api/payfast/notify). Returns a short note for the server log. */
export async function handlePayfastItn(pairs: [string, string][]): Promise<string> {
  const data = Object.fromEntries(pairs);
  const op = await get<OnlinePayment>("SELECT * FROM online_payments WHERE merchant_reference = ? AND provider = 'PayFast'", data.m_payment_id ?? "");
  if (!op) return "unknown payment";
  const cfg = payfastOf(await paymentSettings(op.school_id));
  if (!cfg) return "PayFast is not set up for this school";
  const problem = await verifyItn(pairs, cfg);
  if (problem) return `rejected: ${problem}`;
  const amount = Number(data.amount_gross);
  const status = (data.payment_status ?? "").toUpperCase();
  if (status === "COMPLETE") {
    if (!(Math.abs(amount - op.amount) < 0.01)) return `rejected: amount ${data.amount_gross} does not match ${op.amount.toFixed(2)}`;
    await recordSuccess(op, data.pf_payment_id || op.merchant_reference, op.amount, new Date().toISOString());
    return "recorded";
  }
  const reason = status === "CANCELLED" ? "The payment was cancelled." : status === "FAILED" ? "The payment failed." : `PayFast status: ${status || "unknown"}`;
  await run("UPDATE online_payments SET status = ?, reason = ?, provider_transaction_id = COALESCE(?, provider_transaction_id), checked_at = datetime('now') WHERE id = ? AND status <> 'Successful'",
    status === "PENDING" ? "Pending" : "Failed", reason, data.pf_payment_id || null, op.id);
  return status.toLowerCase() || "noted";
}

/** Recent online payments for these learners, newest first. */
export const onlinePaymentsOf = (learnerIds: number[], limit = 8) => learnerIds.length
  ? all<OnlinePayment>(`SELECT * FROM online_payments WHERE learner_id IN (${learnerIds.map(() => "?").join(",")}) AND (provider_payment_id IS NOT NULL OR provider = 'PayFast') ORDER BY id DESC LIMIT ${Number(limit)}`, ...learnerIds)
  : Promise.resolve([] as OnlinePayment[]);

// ---------------- Overdue reminders ----------------
export type Overdue = { learner_id: number; first_name: string; last_name: string; admission_number: string; overdue: number; since: string; reminders: number; last_reminder: string | null };

/** Learners with fees overdue for at least `afterDays` days, with the reminders already sent about them. */
export async function overdueAccounts(schoolId: number, afterDays = 0): Promise<Overdue[]> {
  const cutoff = addDays(today(), -Math.max(0, afterDays));
  const rows = await all<Omit<Overdue, "reminders" | "last_reminder">>(`
    SELECT l.id learner_id, l.first_name, l.last_name, l.admission_number, ROUND(SUM(x.balance), 2) overdue, MIN(x.due_date) since
    FROM (SELECT i.learner_id, i.due_date, i.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) balance
          FROM invoices i WHERE i.school_id = ?1 AND i.due_date < ?2) x
    JOIN learners l ON l.id = x.learner_id AND l.status = 'Active'
    WHERE x.balance > 0.005 GROUP BY l.id, l.first_name, l.last_name, l.admission_number HAVING SUM(x.balance) >= 1 ORDER BY l.last_name, l.first_name`, schoolId, cutoff);
  if (!rows.length) return [];
  const sent = await all<{ learner_id: number; n: number; last: string }>(`SELECT learner_id, COUNT(*) n, MAX(sent_at) last FROM fee_reminders
    WHERE school_id = ? AND learner_id IN (${rows.map(() => "?").join(",")}) GROUP BY learner_id`, schoolId, ...rows.map((r) => r.learner_id));
  // Reminders count from the start of the current overdue spell (a fully paid account starts again from zero).
  const since = await all<{ learner_id: number; n: number }>(`SELECT r.learner_id, COUNT(*) n FROM fee_reminders r WHERE r.school_id = ? AND r.learner_id IN (${rows.map(() => "?").join(",")})
    AND r.overdue_since = (SELECT MIN(i.due_date) FROM invoices i WHERE i.learner_id = r.learner_id AND i.due_date < ? AND i.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) > 0.005)
    GROUP BY r.learner_id`, schoolId, ...rows.map((r) => r.learner_id), today());
  return rows.map((r) => ({ ...r, reminders: since.find((s) => s.learner_id === r.learner_id)?.n ?? 0, last_reminder: sent.find((s) => s.learner_id === r.learner_id)?.last ?? null }));
}

/** The school admin account reminders are sent from (Messages needs a sender). */
const senderFor = async (schoolId: number) =>
  (await get<{ id: number }>("SELECT id FROM users WHERE school_id = ? AND role = 'school_admin' AND active = 1 ORDER BY id LIMIT 1", schoolId))?.id ?? null;

/** Puts a message from the school in a parent's Messages (reusing their chat with the sender) and pushes it to their phone. */
async function messageParent(schoolId: number, senderId: number, parentId: number, body: string) {
  const existing = await get<{ id: number }>(`SELECT c.id FROM conversations c WHERE c.is_group = 0 AND c.school_id = ?
    AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
    AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)`, schoolId, senderId, parentId);
  const conv = existing?.id ?? (await tx(async () => {
    const c = (await run("INSERT INTO conversations (school_id, is_group) VALUES (?, 0)", schoolId)).id;
    await run("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?), (?,?)", c, senderId, c, parentId);
    return c;
  }));
  await run("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)", conv, senderId, body);
}

function reminderText(school: { name: string }, r: Overdue, banking: string | null, online: boolean) {
  const how = online ? "You can pay online in FerriDash under Fees." : banking ? `Banking details: ${banking}` : "Please contact the school office for banking details.";
  return `Dear parent / guardian,\n\nThis is a friendly reminder that ${r.first_name} ${r.last_name}'s school fees account has an overdue balance of ${zar(r.overdue)} (overdue since ${fmtDate(r.since)}).\n\n${how}\n\nIf you have already paid, thank you, and please ignore this message. If you are struggling to pay, please speak to the school about a payment plan or a fee exemption.\n\n${school.name}`;
}

/**
 * Sends overdue-fee reminders for one school. Automatic runs follow the school's schedule (start a few days after
 * the due date, then every few days, up to a maximum); a school admin can also remind chosen learners now.
 * Returns how many learners' parents were reminded.
 */
export async function sendReminders(schoolId: number, opts: { automatic: boolean; learnerIds?: number[]; byUserId?: number | null }): Promise<number> {
  const school = await get<{ name: string } & Flags>("SELECT name, fee_paying, fee_billing, online_payments, fee_reminders FROM schools WHERE id = ?", schoolId);
  if (!school || !feesOn(school)) return 0;
  const s = { ...DEFAULT_SETTINGS, ...(await paymentSettings(schoolId)) };
  const methods = await onlineMethods(schoolId);
  const online = !!methods.payfast || !!methods.ozow;
  const sender = await senderFor(schoolId);
  const due = (await overdueAccounts(schoolId, opts.automatic ? s.reminder_after_days : 0))
    .filter((r) => !opts.learnerIds || opts.learnerIds.includes(r.learner_id))
    .filter((r) => !opts.automatic || (r.reminders < s.reminder_max && (!r.last_reminder || r.last_reminder.slice(0, 10) <= addDays(today(), -s.reminder_every_days))))
    // Never twice on the same day, whoever sends it.
    .filter((r) => !r.last_reminder || r.last_reminder.slice(0, 10) < new Date().toISOString().slice(0, 10));
  let n = 0;
  for (const r of due) {
    const parents = await parentsOf(r.learner_id);
    const body = reminderText(school, r, s.banking_details, online);
    if (sender) for (const p of parents) await messageParent(schoolId, sender, p, body);
    notify(parents, { title: "School fees overdue", body: `${r.first_name}'s account is ${zar(r.overdue)} overdue. Tap to view the statement.`, url: `/finance/statement?learner=${r.learner_id}` });
    await run("INSERT INTO fee_reminders (school_id, learner_id, amount, overdue_since, sent_to, automatic) VALUES (?,?,?,?,?,?)", schoolId, r.learner_id, r.overdue, r.since, parents.length, opts.automatic ? 1 : 0);
    n++;
  }
  if (n) await audit(schoolId, opts.byUserId ?? null, opts.automatic ? "auto_fee_reminders" : "fee_reminders", "learner", null, `${n} account(s)`);
  return n;
}

/** The daily job (app/api/cron/daily): automatic reminders for every school that has them, and open online payments brought up to date. */
export async function dailyFeesJob(): Promise<{ reminded: number; checked: number }> {
  let reminded = 0, checked = 0;
  const schools = await all<{ id: number }>("SELECT id FROM schools WHERE active = 1 AND fee_paying = 1 AND fee_billing = 1 AND fee_reminders = 1");
  for (const s of schools) {
    try { reminded += await sendReminders(s.id, { automatic: true }); } catch (e) { console.error("[fees] reminders", s.id, (e as Error).message); }
  }
  const open = await all<{ id: number }>("SELECT id FROM online_payments WHERE status IN ('Created','Pending') AND created_at > ? ORDER BY id LIMIT 200", addDays(today(), -7));
  for (const o of open) {
    try { await checkOnlinePayment(o.id); checked++; } catch { /* the next run tries again */ }
  }
  return { reminded, checked };
}
