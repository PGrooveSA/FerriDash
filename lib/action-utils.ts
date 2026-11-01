import { EVERYONE, SCHOOL_ROLES, requireCtx, type Role } from "./auth";
import { overLimit } from "./rate-limit";
import { securityEvent } from "./security-log";

export type ActionResult = { error?: string; ok?: boolean; message?: string };

/** Longest text any single form field may hold (long notices and instructions included); rich chat text is checked separately. */
export const MAX_FIELD = 5000;
const LABEL = (k: string) => k.replace(/_/g, " ");

/** A text field, trimmed. Over-long values are refused, not cut short. */
export const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  if (v.length > MAX_FIELD) fail(`The ${LABEL(k)} is too long (${MAX_FIELD} characters at most).`);
  return v;
};
export const opt = (f: FormData, k: string) => str(f, k) || null;
/** A number field: empty is null, anything that isn't a finite number is refused. */
export const num = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`The ${LABEL(k)} must be a number.`);
  return n;
};
const EMAIL = /^[^\s@<>()"',;:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
/** A valid email address (lower case), or a refusal. */
export const emailField = (f: FormData, k: string, required = true) => {
  const v = str(f, k).toLowerCase();
  if (!v && !required) return "";
  if (v.length > 254 || !EMAIL.test(v)) fail("Enter a valid email address.");
  return v;
};
/** A YYYY-MM-DD date that exists, or a refusal. */
export const isDate = (v: string | null | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
/** Refuses the action when this user has used it too often (lib/rate-limit.ts). */
export async function limit(ctx: { user: { id: number } }, action: string, max: number, windowSec: number) {
  if (await overLimit({ key: `act:${action}:${ctx.user.id}`, max, windowSec, blockSec: windowSec })) {
    await securityEvent("rate_limited", { action, user: ctx.user.id });
    fail("You're doing that too often. Please wait a few minutes and try again.");
  }
}

/** Runs an action body with auth and turns thrown errors into friendly messages. No roles = any school user. */
export async function guarded(roles: Role[] | undefined, fn: (ctx: Awaited<ReturnType<typeof requireCtx>>) => ActionResult | void | Promise<ActionResult | void>): Promise<ActionResult> {
  const ctx = await requireCtx(roles ?? SCHOOL_ROLES);
  try {
    return (await fn(ctx)) ?? { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Postgres: 23505 unique violation, 23503 foreign key violation.
    const code = (e as { code?: string })?.code;
    if (code === "23505" || msg.includes("UNIQUE") || msg.includes("duplicate key")) return { error: "That record already exists (duplicate email, code or number)." };
    if (code === "23503" || msg.includes("FOREIGN KEY") || msg.includes("foreign key")) return { error: "This record is still linked to other data." };
    if (msg.startsWith("!")) return { error: msg.slice(1) };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}

/** Throw a user-facing validation error from inside guarded(). */
export function fail(message: string): never {
  throw new Error("!" + message);
}

// School roles only: the platform admin (super_admin) manages schools, not what happens inside them.
export const ADMIN: Role[] = ["school_admin"];
export const STAFF: Role[] = ["school_admin", "teacher"];
export const PLATFORM: Role[] = ["super_admin"];
export { EVERYONE };
