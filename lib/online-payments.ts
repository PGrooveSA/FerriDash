// Online fee payments (Ozow) for fee-paying schools: start a payment, then confirm it with Ozow and
// record it on the learner's statement exactly once.
import { randomBytes } from "node:crypto";
import { all, audit, get, run, tx } from "./db";
import { decryptSecret, paymentTransactions, OzowError, type OzowConfig } from "./ozow";
import { notify, parentsOf } from "./push";
import { zar } from "./format";

export type PaymentSettings = {
  school_id: number; enabled: number; site_code: string | null; client_id: string | null; client_secret_enc: string | null;
  test_mode: number; public_url: string | null; updated_at: string | null;
};
export type OnlinePayment = {
  id: number; school_id: number; learner_id: number; user_id: number | null; amount: number; merchant_reference: string;
  provider_payment_id: string | null; provider_transaction_id: string | null; test_mode: number;
  status: "Created" | "Pending" | "Successful" | "Failed"; reason: string | null; expires_at: string; created_at: string;
  checked_at: string | null; completed_at: string | null;
};

export const PAYMENT_WINDOW_MINUTES = 30;
export const MIN_ONLINE_PAYMENT = 10;

export const paymentSettings = (schoolId: number) =>
  get<PaymentSettings>("SELECT * FROM payment_settings WHERE school_id = ?", schoolId);

/** Ozow config for a school, or null when online payments are off, incomplete, or the school is no-fee. */
export async function ozowConfig(schoolId: number): Promise<(OzowConfig & { publicUrl: string | null }) | null> {
  const school = await get<{ fee_paying: number }>("SELECT fee_paying FROM schools WHERE id = ?", schoolId);
  const s = await paymentSettings(schoolId);
  if (!school?.fee_paying || !s?.enabled || !s.site_code || !s.client_id) return null;
  const secret = decryptSecret(s.client_secret_enc);
  if (!secret) return null;
  return { siteCode: s.site_code, clientId: s.client_id, clientSecret: secret, testMode: !!s.test_mode, publicUrl: s.public_url };
}

/** What a learner still owes, oldest invoice first. */
export async function outstanding(learnerId: number) {
  const invoices = await all<{ id: number; due: number }>(`
    SELECT i.id, ROUND(i.tuition + i.activities + i.other - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0), 2) due
    FROM invoices i WHERE i.learner_id = ? ORDER BY i.year, i.id`, learnerId);
  return { invoices, total: Math.round(invoices.reduce((t, i) => t + i.due, 0) * 100) / 100 };
}

export const newMerchantReference = (schoolId: number, learnerId: number) =>
  `FD${schoolId}-${learnerId}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.toUpperCase();

/**
 * Records a confirmed payment against the learner's invoices (oldest first; anything left over
 * goes on the latest invoice as a credit). Safe to call repeatedly: only the first call records.
 */
async function recordSuccess(op: OnlinePayment, transactionId: string, amount: number, completedAt: string | null) {
  const recorded = await tx(async () => {
        const fresh = await get<{ status: string }>("SELECT status FROM online_payments WHERE id = ?", op.id);
        if (fresh?.status === "Successful") return false;
        const { invoices } = await outstanding(op.learner_id);
        const paidOn = (completedAt ?? new Date().toISOString()).slice(0, 10);
        const ref = `${transactionId.slice(0, 8)}${op.test_mode ? " · test" : ""}`;
        let left = Math.round(amount * 100) / 100;
        for (const inv of invoices) {
          if (left <= 0) break;
          const part = Math.min(left, inv.due);
          if (part <= 0) continue;
          await run("INSERT INTO payments (school_id, invoice_id, amount, paid_on, method, reference, recorded_by, online_payment_id) VALUES (?,?,?,?,?,?,?,?)",
                    op.school_id, inv.id, part, paidOn, "Ozow", ref, op.user_id, op.id);
          left = Math.round((left - part) * 100) / 100;
        }
        if (left > 0) {
          const last = await get<{ id: number }>("SELECT id FROM invoices WHERE learner_id = ? ORDER BY year DESC, id DESC LIMIT 1", op.learner_id);
          if (last) await run("INSERT INTO payments (school_id, invoice_id, amount, paid_on, method, reference, recorded_by, online_payment_id) VALUES (?,?,?,?,?,?,?,?)",
                  op.school_id, last.id, left, paidOn, "Ozow", ref, op.user_id, op.id);
        }
        await run("UPDATE online_payments SET status = 'Successful', provider_transaction_id = ?, reason = NULL, completed_at = ?, checked_at = datetime('now') WHERE id = ?",
                transactionId, completedAt ?? new Date().toISOString(), op.id);
        await audit(op.school_id, op.user_id, "online_payment", "learner", op.learner_id, `R${amount.toFixed(2)} via Ozow (${op.merchant_reference})`);
        return true;
      });
  if (recorded) {
    const l = await get<{ first_name: string }>("SELECT first_name FROM learners WHERE id = ?", op.learner_id);
    notify(await parentsOf(op.learner_id), { title: "Payment received", body: `${zar(amount)} for ${l?.first_name ?? "your child"} (Ozow). Thank you.`, url: "/finance/statement" });
  }
}

/**
 * Asks Ozow how a payment went and updates it. Successful payments are recorded on the statement;
 * a payment with no successful attempt by the time its link expires is marked Failed.
 */
export async function checkOnlinePayment(id: number): Promise<OnlinePayment> {
  const op = await get<OnlinePayment>("SELECT * FROM online_payments WHERE id = ?", id);
  if (!op) throw new OzowError("Payment not found.");
  if (op.status === "Successful" || op.status === "Failed" || !op.provider_payment_id) return op;
  const cfg = await ozowConfig(op.school_id);
  if (!cfg) throw new OzowError("Online payments are not set up for this school.");
  if (!!op.test_mode !== cfg.testMode) throw new OzowError("This payment was made in a different Ozow mode (test or live). Ask the school to check it.");

  const txs = await paymentTransactions(cfg, op.provider_payment_id, new Date(op.created_at.replace(" ", "T") + "Z"));
  const ours = txs.filter((t) => !t.merchantReference || t.merchantReference === op.merchant_reference);
  const ok = ours.find((t) => t.status === "Successful");
  if (ok) {
    await recordSuccess(op, ok.id, Number(ok.amount?.value ?? op.amount), ok.completedDate ?? null);
  } else {
    const latest = [...ours].sort((a, b) => (b.createdDate ?? "").localeCompare(a.createdDate ?? ""))[0];
    const pending = ours.some((t) => t.status === "Pending");
    // Give the bank a few minutes after the link expires before calling it failed.
    const expired = Date.now() > Date.parse(op.expires_at) + 5 * 60000;
    const status = pending ? "Pending" : expired ? "Failed" : op.status;
    const reason = latest?.reason ?? (latest ? latest.status : expired ? "The payment was not completed." : null);
    await run("UPDATE online_payments SET status = ?, reason = ?, checked_at = datetime('now') WHERE id = ?", status, reason, op.id);
  }
  return (await get<OnlinePayment>("SELECT * FROM online_payments WHERE id = ?", id))!;
}

/** Pending online payments for these learners (checked when a parent or admin opens the page). */
export const openOnlinePayments = async (schoolId: number, learnerIds: number[]) => learnerIds.length
  ? (await all<OnlinePayment>(`SELECT * FROM online_payments WHERE school_id = ? AND learner_id IN (${learnerIds.map(() => "?").join(",")}) AND status IN ('Created','Pending') AND provider_payment_id IS NOT NULL ORDER BY id DESC`, schoolId, ...learnerIds))
  : [];
