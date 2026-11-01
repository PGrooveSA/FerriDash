// Suspicious-activity log. Every event goes to the server log as one JSON line starting with [security]
// (Vercel → Logs: search "[security]", or send them to a log drain with alerts). Events that a school should
// see (an account locked) are also written to its audit log by the caller.
import { headers } from "next/headers";

export type SecurityEvent =
  | "login_failed" | "login_locked" | "login_blocked" | "login_state_refused"
  | "rate_limited" | "forbidden_route" | "stale_session" | "upload_rejected" | "bad_origin"
  | "payment_rejected" | "application_spam";

/** The visitor's address and browser, when there is a request (empty otherwise). */
export async function requestInfo(): Promise<{ ip: string | null; ua: string | null; path: string | null }> {
  try {
    const h = await headers();
    return {
      ip: h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || null,
      ua: h.get("user-agent")?.slice(0, 200) ?? null,
      path: h.get("x-invoke-path") || h.get("next-url") || null,
    };
  } catch {
    return { ip: null, ua: null, path: null };
  }
}

/** Records a suspicious event. Never throws; never includes passwords or tokens. */
export async function securityEvent(event: SecurityEvent, detail: Record<string, string | number | null | undefined> = {}) {
  try {
    const info = await requestInfo();
    console.warn("[security] " + JSON.stringify({ at: new Date().toISOString(), event, ...info, ...detail }));
  } catch { /* logging must never break the request */ }
}
