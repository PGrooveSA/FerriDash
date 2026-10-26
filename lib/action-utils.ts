import { EVERYONE, SCHOOL_ROLES, requireCtx, type Role } from "./auth";

export type ActionResult = { error?: string; ok?: boolean; message?: string };

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const opt = (f: FormData, k: string) => str(f, k) || null;
export const num = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : Number(v); };

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
