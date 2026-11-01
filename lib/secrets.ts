// Merchant secrets (PayFast merchant key and passphrase, Ozow client secret) are stored encrypted:
// AES-256-GCM with a key derived from the app secret. They are never shown again after saving.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appSecret } from "./session";

const secretKey = () => createHash("sha256").update("ferridash-payments:" + appSecret()).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

/** Null when the secret can't be read (e.g. SESSION_SECRET changed): the admin must enter it again. */
export function decryptSecret(stored: string | null | undefined): string | null {
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
