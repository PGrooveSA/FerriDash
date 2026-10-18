import { requireCtx, type Role } from "./auth";

export type ActionResult = { error?: string; ok?: boolean; message?: string };

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const opt = (f: FormData, k: string) => str(f, k) || null;
export const num = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : Number(v); };

/** Runs an action body with auth and turns thrown errors into friendly messages. */
export async function guarded(roles: Role[] | undefined, fn: (ctx: Awaited<ReturnType<typeof requireCtx>>) => ActionResult | void | Promise<ActionResult | void>): Promise<ActionResult> {
  const ctx = await requireCtx(roles);
  try {
    return (await fn(ctx)) ?? { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) return { error: "That record already exists (duplicate email, code or number)." };
    if (msg.includes("FOREIGN KEY")) return { error: "This record is still linked to other data." };
    if (msg.startsWith("!")) return { error: msg.slice(1) };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}

/** Throw a user-facing validation error from inside guarded(). */
export function fail(message: string): never {
  throw new Error("!" + message);
}

export const ADMIN: Role[] = ["super_admin", "school_admin"];
export const STAFF: Role[] = ["super_admin", "school_admin", "teacher"];
