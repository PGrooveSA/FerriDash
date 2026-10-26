// Ozow One API client (https://hub.ozow.com): OAuth client credentials, create a payment, read its transactions.
// FerriDash runs on a school network, so payments are confirmed by asking Ozow (outbound calls only);
// no inbound webhook or public address is required.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appSecret } from "@/lib/session";

export type OzowConfig = { siteCode: string; clientId: string; clientSecret: string; testMode: boolean };
export type OzowTransaction = {
  id: string; status: "Incomplete" | "Successful" | "Error" | "Pending" | "Refunded" | string;
  reason?: string | null; amount: { currency: string; value: number }; merchantReference: string;
  createdDate: string; completedDate?: string | null;
};

/** Production or staging; OZOW_BASE_URL overrides both (used for local testing against a mock). */
export const ozowBase = (testMode: boolean) => process.env.OZOW_BASE_URL || (testMode ? "https://stagingone.ozow.com" : "https://one.ozow.com");

export class OzowError extends Error {}

// ---------- secret storage (AES-256-GCM, key derived from the app secret) ----------
const secretKey = () => createHash("sha256").update("ferridash-payments:" + appSecret()).digest();
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
/** Null when the secret can't be read (e.g. SESSION_SECRET changed): the admin must enter it again. */
export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  try {
    const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", secretKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- HTTP ----------
async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store" });
  } catch {
    throw new OzowError("Could not reach Ozow. Check that this computer is connected to the internet.");
  }
}
async function problem(res: Response, what: string): Promise<never> {
  let detail = "";
  try { const j = await res.json(); detail = j.detail || j.title || j.code || ""; } catch { /* not JSON */ }
  if (res.status === 401) throw new OzowError(`Ozow did not accept the client ID or secret (${what}).`);
  throw new OzowError(`Ozow could not ${what}${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`);
}

// Access tokens last a few hours; cache one per client and refresh a minute before expiry.
const tokens = new Map<string, { token: string; expires: number }>();
async function token(cfg: OzowConfig): Promise<string> {
  const key = `${ozowBase(cfg.testMode)}|${cfg.clientId}`;
  const hit = tokens.get(key);
  if (hit && hit.expires > Date.now()) return hit.token;
  const res = await call(`${ozowBase(cfg.testMode)}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: "payments", grant_type: "client_credentials" }),
  });
  if (!res.ok) await problem(res, "sign in");
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokens.set(key, { token: j.access_token, expires: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 60) * 1000 });
  return j.access_token;
}
export const forgetToken = (cfg: Pick<OzowConfig, "testMode" | "clientId">) => tokens.delete(`${ozowBase(cfg.testMode)}|${cfg.clientId}`);

/** Checks the credentials by signing in. */
export async function testConnection(cfg: OzowConfig) {
  forgetToken(cfg);
  await token(cfg);
}

export async function createPayment(cfg: OzowConfig, p: {
  amount: number; merchantReference: string; beneficiaryReference: string; expireAt: Date; returnUrl?: string;
  payer?: { id: string; name: string; email?: string | null; cellphone?: string | null };
}): Promise<{ id: string; redirectUrl: string }> {
  const send = async (withBeneficiary: boolean) => {
    const body: Record<string, unknown> = {
      siteCode: cfg.siteCode, region: "ZA",
      amount: { currency: "ZAR", value: Math.round(p.amount * 100) / 100 },
      merchantReference: p.merchantReference, expireAt: p.expireAt.toISOString(),
    };
    if (withBeneficiary && p.beneficiaryReference) body.beneficiaryReference = p.beneficiaryReference;
    if (p.returnUrl) body.returnUrl = p.returnUrl;
    if (p.payer) body.payer = Object.fromEntries(Object.entries(p.payer).filter(([, v]) => v));
    return call(`${ozowBase(cfg.testMode)}/v1/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token(cfg)}`, "Content-Type": "application/json", "Idempotency-Key": `${p.merchantReference}-${withBeneficiary ? "b" : "n"}` },
      body: JSON.stringify(body),
    });
  };
  let res = await send(true);
  // Some Ozow sites don't accept a payer-supplied beneficiary reference: try once without it.
  if (res.status === 400) {
    const text = await res.clone().text();
    if (/beneficiary/i.test(text)) res = await send(false);
  }
  if (!res.ok) await problem(res, "start the payment");
  const j = (await res.json()) as { id: string; status: string; redirectUrl?: string; reason?: string };
  if (!j.redirectUrl) throw new OzowError(`Ozow did not return a payment page${j.reason ? `: ${j.reason}` : ""}.`);
  return { id: j.id, redirectUrl: j.redirectUrl };
}

/** All transaction attempts for a payment request (a parent may retry on the same request). */
export async function paymentTransactions(cfg: OzowConfig, paymentId: string, from: Date): Promise<OzowTransaction[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86400000);
  const q = new URLSearchParams({ fromDate: day(new Date(from.getTime() - 86400000)), toDate: day(to), limit: "50" });
  const res = await call(`${ozowBase(cfg.testMode)}/v1/payments/${encodeURIComponent(paymentId)}/transactions?${q}`, {
    headers: { Authorization: `Bearer ${await token(cfg)}`, Accept: "application/json" },
  });
  if (!res.ok) await problem(res, "report the payment status");
  return ((await res.json()) as { results?: OzowTransaction[] }).results ?? [];
}
