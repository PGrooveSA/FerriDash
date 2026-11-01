// Failed sign-in counters, kept in the database so every server instance sees the same numbers
// (Vercel runs many short-lived copies of the app; a counter in memory would reset all the time).
import { headers } from "next/headers";
import { all, run } from "./db";

export type Limit = { key: string; max: number; windowSec: number; blockSec: number };

/** The visitor's IP address as reported by the host (Vercel sets x-real-ip / x-forwarded-for itself). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

/** The counters among these that are currently blocked. */
export async function blockedKeys(keys: string[]): Promise<string[]> {
  if (!keys.length) return [];
  return (await all<{ key: string }>(`SELECT key FROM login_attempts WHERE key IN (${keys.map(() => "?").join(",")}) AND blocked_until > now()`, ...keys)).map((r) => r.key);
}

/** True when any of these counters is currently blocked. */
export async function isBlocked(keys: string[]): Promise<boolean> {
  return (await blockedKeys(keys)).length > 0;
}

/** Counts one failure against each limit; a counter that reaches its maximum within its window is blocked for a while. Returns the keys blocked just now. */
export async function recordFailure(limits: Limit[]): Promise<string[]> {
  const blocked: string[] = [];
  for (const l of limits) {
    await run(`INSERT INTO login_attempts (key, n, window_start) VALUES (?, 1, now())
      ON CONFLICT (key) DO UPDATE SET
        n = CASE WHEN login_attempts.window_start < now() - make_interval(secs => ?) THEN 1 ELSE login_attempts.n + 1 END,
        window_start = CASE WHEN login_attempts.window_start < now() - make_interval(secs => ?) THEN now() ELSE login_attempts.window_start END`,
      l.key, l.windowSec, l.windowSec);
    if ((await run("UPDATE login_attempts SET blocked_until = now() + make_interval(secs => ?), n = 0, window_start = now() WHERE key = ? AND n >= ?", l.blockSec, l.key, l.max)).changes) blocked.push(l.key);
  }
  // Now and then, forget counters nobody has touched for a day.
  if (Math.random() < 0.02) await run("DELETE FROM login_attempts WHERE window_start < now() - interval '1 day' AND (blocked_until IS NULL OR blocked_until < now())");
  return blocked;
}

/** Unlocks an account's sign-in (a school admin set a new password for it). */
export async function unlockEmail(email: string) {
  await clearFailures([`email:${email.trim().toLowerCase()}`]);
}

/** Clears counters after a successful sign-in. */
export async function clearFailures(keys: string[]) {
  if (keys.length) await run(`DELETE FROM login_attempts WHERE key IN (${keys.map(() => "?").join(",")})`, ...keys);
}

/**
 * General rate limit for actions (sending messages, uploads, password resets...). Counts this use; true when
 * the limit is already used up, so the caller refuses. Each use is one counter row update in the database.
 */
export async function overLimit(l: Limit): Promise<boolean> {
  if (await isBlocked([l.key])) return true;
  await recordFailure([l]);
  return false;
}
