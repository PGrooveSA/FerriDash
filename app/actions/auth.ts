"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit, get, run } from "@/lib/db";
import { EVERYONE, requireCtx } from "@/lib/auth";
import { LOGIN_NONCE_COOKIE, REMEMBER_DAYS, SCHOOL_COOKIE, SESSION_COOKIE, SESSION_HOURS, checkLoginState, signSession, verifySession } from "@/lib/session";
import { afterLoginPath } from "@/lib/redirects";
import { securityEvent } from "@/lib/security-log";
import { blockedKeys, clearFailures, clientIp, isBlocked, recordFailure, type Limit } from "@/lib/rate-limit";
import { DEVICE_COOKIE, linkDevice, parseDevice, unlinkDevice } from "@/lib/devices";

// A hash of a password nobody has: checked when the email is unknown, so a wrong email takes as long as a
// wrong password (the response time doesn't reveal which emails have accounts).
const NO_USER_HASH = "$2b$10$qgVe6dh4HKhccNd.8HPOwO7aXhPYOmv5NnnSSkQyD1oknb5ZKo5V.";

// Brute-force limits. An account is locked for 15 minutes after 5 wrong passwords within an hour, wherever they
// come from (the counter is per email, so an unknown email locks the same way and reveals nothing). An address
// trying many accounts is blocked after 30 failures in 15 minutes. A school admin unlocks an account early by
// setting a new password for it.
const emailLimit = (email: string): Limit => ({ key: `email:${email}`, max: 5, windowSec: 60 * 60, blockSec: 15 * 60 });
const ipLimit = (ip: string): Limit => ({ key: `ip:${ip}`, max: 30, windowSec: 15 * 60, blockSec: 15 * 60 });
const LOCKED = "Too many wrong passwords: this account is locked for 15 minutes. Your school office can unlock it by setting a new password.";
const TOO_MANY = "Too many attempts. Try again in a few minutes.";

export async function login(_: unknown, form: FormData): Promise<{ error?: string; expired?: boolean }> {
  const store = await cookies();
  // The form must carry the signed state issued with this browser's sign-in page (lib/session.ts).
  if (!(await checkLoginState(String(form.get("state") || ""), store.get(LOGIN_NONCE_COOKIE)?.value)))
  {
    await securityEvent("login_state_refused");
    return { error: "This sign-in page has expired or was changed.", expired: true };
  }

  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") || "").slice(0, 200);
  const limits = [emailLimit(email), ipLimit(await clientIp())];
  const blocked = await blockedKeys(limits.map((l) => l.key));
  if (blocked.length) {
    await securityEvent("login_blocked", { email, by: blocked.includes(limits[0].key) ? "account" : "address" });
    return { error: blocked.includes(limits[0].key) ? LOCKED : TOO_MANY };
  }

  const user = await get<{ id: number; role: string; password_hash: string; school_id: number | null; session_version: number; org_type: string | null; active: number }>(
      "SELECT u.id, u.role, u.password_hash, u.school_id, u.session_version, s.org_type, u.active FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE lower(u.email) = ? AND (s.id IS NULL OR s.active = 1)", email);
  const ok = await bcrypt.compare(password, user?.password_hash ?? NO_USER_HASH);
  if (!user || !ok) {
    const nowBlocked = await recordFailure(limits);
    await securityEvent(nowBlocked.includes(limits[0].key) ? "login_locked" : "login_failed", { email, known: user ? 1 : 0 });
    if (nowBlocked.includes(limits[0].key)) {
      // The school can see in its audit log that someone was locked out.
      if (user) await audit(user.school_id, user.id, "locked", "user", user.id, "5 wrong passwords");
      return { error: LOCKED };
    }
    return { error: "Incorrect email or password." };
  }
  // The right password for a switched-off login (a learner who left, a parent with no current children, staff who left):
  // say so, rather than "incorrect password". Only someone who knows the password learns this.
  if (!user.active) {
    await securityEvent("login_failed", { email, known: 1, inactive: 1 });
    return { error: "This account has been switched off because there is no current learner, child or post at the school linked to it. Contact the school if you still need access." };
  }
  await clearFailures([limits[0].key]);
  await run("UPDATE users SET last_login = datetime('now') WHERE id = ?", user.id);
  await audit(user.school_id, user.id, "login", "user", user.id);

  // "Remember me": stay signed in for 30 days. Otherwise the cookie ends when the browser closes
  // (and the session expires after 12 hours either way).
  const remember = form.get("remember") === "1";
  const hours = remember ? REMEMBER_DAYS * 24 : SESSION_HOURS;
  store.set(SESSION_COOKIE, await signSession({ uid: user.id, role: user.role, sv: user.session_version, ...(user.org_type === "childcare" ? { org: "childcare" } : {}) }, hours), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/",
    ...(remember ? { maxAge: hours * 3600 } : {}),
  });
  // Signing in inside the app: this phone now gets this user's push notifications.
  const device = parseDevice(store.get(DEVICE_COOKIE)?.value);
  if (device) await linkDevice(user.id, device);
  // The sign-in state is used once.
  store.delete(LOGIN_NONCE_COOKIE);
  // Only a pre-approved page for the user's role; never an address from the request.
  redirect(afterLoginPath(user.role));
}

export async function logout() {
  const store = await cookies();
  await unlinkDevice(parseDevice(store.get(DEVICE_COOKIE)?.value));
  store.delete(SESSION_COOKIE);
  store.delete(SCHOOL_COOKIE);
  redirect("/login");
}

export async function changePassword(_: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCtx(EVERYONE);
  const current = String(form.get("current") || ""), next = String(form.get("next") || ""), confirm = String(form.get("confirm") || "");
  // Someone holding a stolen session can't guess the current password at full speed.
  const limit: Limit = { key: `password:${ctx.user.id}`, max: 5, windowSec: 15 * 60, blockSec: 15 * 60 };
  if (await isBlocked([limit.key])) return { error: TOO_MANY };
  const row = (await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", ctx.user.id))!;
  if (!(await bcrypt.compare(current, row.password_hash))) { await recordFailure([limit]); return { error: "Current password is incorrect." }; }
  if (next.length < 8 || !/[A-Z]/.test(next) || !/\d/.test(next)) return { error: "Use at least 8 characters with a capital letter and a number." };
  if (next !== confirm) return { error: "The new passwords do not match." };
  // A new session version signs out every other device; this one gets a fresh cookie and stays signed in.
  const { session_version } = (await get<{ session_version: number }>("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ? RETURNING session_version",
    await bcrypt.hash(next, 10), ctx.user.id))!;
  await clearFailures([limit.key]);
  const store = await cookies();
  const old = await verifySession(store.get(SESSION_COOKIE)?.value);
  const hours = Math.max(1, Math.round(((old?.exp ?? 0) * 1000 - Date.now()) / 3_600_000)) || SESSION_HOURS;
  store.set(SESSION_COOKIE, await signSession({ uid: ctx.user.id, role: ctx.user.role, sv: session_version, ...(ctx.school.org_type === "childcare" && ctx.user.role !== "super_admin" ? { org: "childcare" } : {}) }, hours), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/",
    ...(hours > SESSION_HOURS ? { maxAge: hours * 3600 } : {}),
  });
  await audit(ctx.schoolId, ctx.user.id, "change_password", "user", ctx.user.id);
  return { ok: "Password updated. Other devices have been signed out." };
}
