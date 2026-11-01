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

/** True when any of these counters is currently blocked. */
export async function isBlocked(keys: string[]): Promise<boolean> {
  if (!keys.length) return false;
  const rows = await all(`SELECT 1 FROM login_attempts WHERE key IN (${keys.map(() => "?").join(",")}) AND blocked_until > now() LIMIT 1`, ...keys);
  return rows.length > 0;
}

/** Counts one failure against each limit; a counter that reaches its maximum within its window is blocked for a while. */
export async function recordFailure(limits: Limit[]) {
  for (const l of limits) {
    await run(`INSERT INTO login_attempts (key, n, window_start) VALUES (?, 1, now())
      ON CONFLICT (key) DO UPDATE SET
        n = CASE WHEN login_attempts.window_start < now() - make_interval(secs => ?) THEN 1 ELSE login_attempts.n + 1 END,
        window_start = CASE WHEN login_attempts.window_start < now() - make_interval(secs => ?) THEN now() ELSE login_attempts.window_start END`,
      l.key, l.windowSec, l.windowSec);
    await run("UPDATE login_attempts SET blocked_until = now() + make_interval(secs => ?), n = 0, window_start = now() WHERE key = ? AND n >= ?", l.blockSec, l.key, l.max);
  }
  // Now and then, forget counters nobody has touched for a day.
  if (Math.random() < 0.02) await run("DELETE FROM login_attempts WHERE window_start < now() - interval '1 day' AND (blocked_until IS NULL OR blocked_until < now())");
}

/** Clears counters after a successful sign-in. */
export async function clearFailures(keys: string[]) {
  if (keys.length) await run(`DELETE FROM login_attempts WHERE key IN (${keys.map(() => "?").join(",")})`, ...keys);
}
