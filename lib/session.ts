// Edge-safe session token helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sh_session";
export const SCHOOL_COOKIE = "sh_school";
/** Remembers which school last signed in on this device, so the sign-in page can show its logo. */
export const LAST_SCHOOL_COOKIE = "sh_last_school";
export const SESSION_HOURS = 12;

export type SessionPayload = { uid: number; role: string };

const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me");

export async function signSession(p: SessionPayload) {
  return new SignJWT({ ...p }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_HOURS}h`).sign(key());
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
