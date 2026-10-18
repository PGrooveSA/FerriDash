"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit, get, run } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { SCHOOL_COOKIE, SESSION_COOKIE, SESSION_HOURS, signSession } from "@/lib/session";

// Simple in-memory brute-force guard (per email, per server process).
const attempts = new Map<string, { n: number; until: number }>();

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const a = attempts.get(email);
  if (a && a.until > Date.now()) return { error: "Too many attempts. Try again in a few minutes." };

  const user = get<{ id: number; role: string; password_hash: string; school_id: number | null }>(
    "SELECT u.id, u.role, u.password_hash, u.school_id FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE lower(u.email) = ? AND u.active = 1 AND (s.id IS NULL OR s.active = 1)", email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(email, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: "Incorrect email or password." };
  }
  attempts.delete(email);
  run("UPDATE users SET last_login = datetime('now') WHERE id = ?", user.id);
  audit(user.school_id, user.id, "login", "user", user.id);

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession({ uid: user.id, role: user.role }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/", maxAge: SESSION_HOURS * 3600,
  });
  redirect("/dashboard");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(SCHOOL_COOKIE);
  redirect("/login");
}

export async function switchSchool(form: FormData) {
  const ctx = await requireCtx(["super_admin"]);
  const id = Number(form.get("school_id"));
  if (get("SELECT id FROM schools WHERE id = ?", id)) {
    (await cookies()).set(SCHOOL_COOKIE, String(id), { httpOnly: true, sameSite: "lax", path: "/" });
    audit(id, ctx.user.id, "switch_school", "school", id);
  }
  redirect("/dashboard");
}

export async function changePassword(_: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireCtx();
  const current = String(form.get("current") || ""), next = String(form.get("next") || ""), confirm = String(form.get("confirm") || "");
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", ctx.user.id)!;
  if (!bcrypt.compareSync(current, row.password_hash)) return { error: "Current password is incorrect." };
  if (next.length < 8 || !/[A-Z]/.test(next) || !/\d/.test(next)) return { error: "Use at least 8 characters with a capital letter and a number." };
  if (next !== confirm) return { error: "The new passwords do not match." };
  run("UPDATE users SET password_hash = ? WHERE id = ?", bcrypt.hashSync(next, 10), ctx.user.id);
  audit(ctx.schoolId, ctx.user.id, "change_password", "user", ctx.user.id);
  return { ok: "Password updated." };
}
