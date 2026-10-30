// Edge-safe session token helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sh_session";
export const SCHOOL_COOKIE = "sh_school";
export const SESSION_HOURS = 12;
/** "Remember me" on the sign-in page keeps the session for this long. */
export const REMEMBER_DAYS = 30;

export type SessionPayload = { uid: number; role: string };

/**
 * The server's own secret: signs session cookies.
 * SESSION_SECRET, or failing that one derived from the Supabase service role key (also server-only).
 * The built-in fallback is for local development only; production refuses to run on it.
 */
export function appSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return "ferridash-session:" + process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set.");
  return "dev-only-insecure-secret-change-me";
}

const key = () => new TextEncoder().encode(appSecret());

export async function signSession(p: SessionPayload, hours = SESSION_HOURS) {
  return new SignJWT({ ...p }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${hours}h`).sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { uid: Number(payload.uid), role: String(payload.role) };
  } catch {
    return null;
  }
}
