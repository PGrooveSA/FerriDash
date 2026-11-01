"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit, get, run } from "@/lib/db";
import { EVERYONE, requireCtx } from "@/lib/auth";
import { REMEMBER_DAYS, SCHOOL_COOKIE, SESSION_COOKIE, SESSION_HOURS, signSession, verifySession } from "@/lib/session";
import { clearFailures, clientIp, isBlocked, recordFailure, type Limit } from "@/lib/rate-limit";
import { DEVICE_COOKIE, linkDevice, parseDevice, unlinkDevice } from "@/lib/devices";

// A hash of a password nobody has: checked when the email is unknown, so a wrong email takes as long as a
// wrong password (the response time doesn't reveal which emails have accounts).
const NO_USER_HASH = "$2b$10$qgVe6dh4HKhccNd.8HPOwO7aXhPYOmv5NnnSSkQyD1oknb5ZKo5V.";

// Brute-force limits. Per email from one address: 5 tries, then 5 minutes. Per address: 30 tries in 15 minutes
// (someone trying many accounts). Per email from anywhere: 50 tries in an hour (an attack spread over many
// addresses); this one is high so nobody can easily lock someone else out of their account.
const loginLimits = (email: string, ip: string): Limit[] => [
  { key: `ip-email:${ip}:${email}`, max: 5, windowSec: 15 * 60, blockSec: 5 * 60 },
  { key: `ip:${ip}`, max: 30, windowSec: 15 * 60, blockSec: 15 * 60 },
  { key: `email:${email}`, max: 50, windowSec: 60 * 60, blockSec: 30 * 60 },
];
const TOO_MANY = "Too many attempts. Try again in a few minutes.";

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") || "").slice(0, 200);
  const limits = loginLimits(email, await clientIp());
  if (await isBlocked(limits.map((l) => l.key))) return { error: TOO_MANY };

  const user = await get<{ id: number; role: string; password_hash: string; school_id: number | null; session_version: number }>(
      "SELECT u.id, u.role, u.password_hash, u.school_id, u.session_version FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE lower(u.email) = ? AND u.active = 1 AND (s.id IS NULL OR s.active = 1)", email);
  const ok = await bcrypt.compare(password, user?.password_hash ?? NO_USER_HASH);
  if (!user || !ok) {
    await recordFailure(limits);
    return { error: "Incorrect email or password." };
  }
  await clearFailures([limits[0].key]);
  await run("UPDATE users SET last_login = datetime('now') WHERE id = ?", user.id);
  await audit(user.school_id, user.id, "login", "user", user.id);

  // "Remember me": stay signed in for 30 days. Otherwise the cookie ends when the browser closes
  // (and the session expires after 12 hours either way).
  const remember = form.get("remember") === "1";
  const hours = remember ? REMEMBER_DAYS * 24 : SESSION_HOURS;
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession({ uid: user.id, role: user.role, sv: user.session_version }, hours), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/",
    ...(remember ? { maxAge: hours * 3600 } : {}),
  });
  // Signing in inside the app: this phone now gets this user's push notifications.
  const device = parseDevice(store.get(DEVICE_COOKIE)?.value);
  if (device) await linkDevice(user.id, device);
  redirect("/dashboard");
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
  store.set(SESSION_COOKIE, await signSession({ uid: ctx.user.id, role: ctx.user.role, sv: session_version }, hours), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/",
    ...(hours > SESSION_HOURS ? { maxAge: hours * 3600 } : {}),
  });
  await audit(ctx.schoolId, ctx.user.id, "change_password", "user", ctx.user.id);
  return { ok: "Password updated. Other devices have been signed out." };
}
