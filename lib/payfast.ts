// PayFast (https://developers.payfast.co.za): the parent is sent to PayFast's payment page with a signed form
// (card, Instant EFT, SnapScan, Mobicred...). PayFast reports the outcome with an ITN (Instant Transaction
// Notification) posted to /api/payfast/notify, which is checked three ways before anything is recorded:
// the signature, the merchant and amount, and a confirmation request back to PayFast.
import { createHash } from "node:crypto";

export type PayfastConfig = { merchantId: string; merchantKey: string; passphrase: string | null; testMode: boolean };

export const payfastHost = (testMode: boolean) => process.env.PAYFAST_BASE_URL || (testMode ? "https://sandbox.payfast.co.za" : "https://www.payfast.co.za");

/** PHP's urlencode, which PayFast's signatures are built with: spaces become "+", and !'()*~ are encoded too. */
export const pfEncode = (v: string) =>
  encodeURIComponent(v).replace(/%20/g, "+").replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** key=value pairs joined with &, in the order given. The payment form leaves out empty values; an ITN keeps them. */
const paramString = (pairs: [string, string][], skipEmpty: boolean) =>
  pairs.filter(([, v]) => !skipEmpty || v !== "").map(([k, v]) => `${k}=${pfEncode(v.trim())}`).join("&");

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const withPassphrase = (s: string, passphrase: string | null) => (passphrase ? `${s}&passphrase=${pfEncode(passphrase.trim())}` : s);

/** The form that sends the parent to PayFast. Fields are in the order PayFast lists them: the signature depends on it. */
export function paymentForm(cfg: PayfastConfig, p: {
  returnUrl: string; cancelUrl: string; notifyUrl: string; firstName: string; lastName: string; email?: string | null; cell?: string | null;
  reference: string; amount: number; itemName: string; itemDescription?: string;
}): { action: string; fields: [string, string][] } {
  const cell = p.cell?.replace(/[\s-]/g, "").replace(/^\+27/, "0") ?? "";
  const pairs: [string, string][] = [
    ["merchant_id", cfg.merchantId], ["merchant_key", cfg.merchantKey],
    ["return_url", p.returnUrl], ["cancel_url", p.cancelUrl], ["notify_url", p.notifyUrl],
    ["name_first", p.firstName.slice(0, 100)], ["name_last", p.lastName.slice(0, 100)],
    ["email_address", p.email?.slice(0, 100) ?? ""], ["cell_number", /^0\d{9}$/.test(cell) ? cell : ""],
    ["m_payment_id", p.reference], ["amount", p.amount.toFixed(2)],
    ["item_name", p.itemName.slice(0, 100)], ["item_description", (p.itemDescription ?? "").slice(0, 255)],
  ];
  const fields = pairs.filter(([, v]) => v !== "");
  return { action: `${payfastHost(cfg.testMode)}/eng/process`, fields: [...fields, ["signature", md5(withPassphrase(paramString(fields, true), cfg.passphrase))]] };
}

export type Itn = Record<string, string>;

/** The fields of an ITN, in the order PayFast sent them. */
export const itnPairs = (rawBody: string): [string, string][] => [...new URLSearchParams(rawBody).entries()];

/** Checks an ITN's signature, then asks PayFast to confirm it. Null when it's genuine, otherwise why not. */
export async function verifyItn(pairs: [string, string][], cfg: PayfastConfig): Promise<string | null> {
  const data = Object.fromEntries(pairs);
  const rest = pairs.filter(([k]) => k !== "signature");
  const s = paramString(rest, false);
  if (!data.signature || md5(withPassphrase(s, cfg.passphrase)) !== data.signature.toLowerCase()) return "signature does not match";
  if (data.merchant_id !== cfg.merchantId) return "merchant does not match";
  try {
    const res = await fetch(`${payfastHost(cfg.testMode)}/eng/query/validate`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: s,
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    const text = (await res.text()).trim();
    return text === "VALID" ? null : `PayFast did not confirm it (${text.slice(0, 40) || res.status})`;
  } catch {
    return "could not reach PayFast to confirm it";
  }
}
