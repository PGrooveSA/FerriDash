// Edge-safe session token helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sh_session";
export const SCHOOL_COOKIE = "sh_school";
export const SESSION_HOURS = 12;
/** "Remember me" on the sign-in page keeps the session for this long. */
export const REMEMBER_DAYS = 30;

export type SessionPayload = { uid: number; role: string };

const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me");

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
