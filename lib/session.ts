// Edge-safe session token helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sh_session";
export const SCHOOL_COOKIE = "sh_school";
export const SESSION_HOURS = 12;
/** "Remember me" on the sign-in page keeps the session for this long. */
export const REMEMBER_DAYS = 30;

/** sv: the user's session_version when signed in. Raising it in the database ends every older session (password changes and resets). */
export type SessionPayload = { uid: number; role: string; sv?: number };

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

export async function verifySession(token: string | undefined): Promise<(Required<SessionPayload> & { exp: number }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return { uid: Number(payload.uid), role: String(payload.role), sv: Number(payload.sv ?? 0), exp: Number(payload.exp ?? 0) };
  } catch {
    return null;
  }
}

// ---------------- Sign-in state ----------------
// Opening the sign-in page gives the browser a random value in a cookie (middleware.ts). The page's form carries
// a signed state token naming that same value; the sign-in action accepts the form only when the two match, the
// signature is FerriDash's own and the token hasn't expired. Another site can't read the cookie or forge the
// token, so it can't submit a sign-in on someone's behalf, and a tampered or replayed form is refused.
export const LOGIN_NONCE_COOKIE = "sh_login";
const LOGIN_STATE_MINUTES = 120;

export const newLoginNonce = () => crypto.randomUUID();

export async function signLoginState(nonce: string) {
  return new SignJWT({ n: nonce, p: "login" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${LOGIN_STATE_MINUTES}m`).sign(key());
}

/** True when the state token is ours, unexpired, for sign-in, and names the nonce in the browser's cookie. */
export async function checkLoginState(state: string | undefined | null, nonce: string | undefined): Promise<boolean> {
  if (!state || !nonce) return false;
  try {
    const { payload } = await jwtVerify(state, key(), { algorithms: ["HS256"] });
    return payload.p === "login" && typeof payload.n === "string" && payload.n === nonce;
  } catch {
    return false;
  }
}
