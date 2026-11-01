// Where people are sent after signing in. Only these exact addresses are ever used: a redirect address that
// comes with the request (?next=, ?redirect=, ?returnTo=, a form field, a Referer header) is never followed,
// so a crafted sign-in link can't send someone to another site or an unexpected page.
import type { Role } from "./auth";

/** Every address the sign-in flow may redirect to. */
export const LOGIN_REDIRECTS: ReadonlySet<string> = new Set(["/dashboard"]);

/** The page each role opens on after signing in. */
const AFTER_LOGIN: Record<Role, string> = {
  super_admin: "/dashboard",
  school_admin: "/dashboard",
  teacher: "/dashboard",
  learner: "/dashboard",
  parent: "/dashboard",
};

/** The pre-approved page for this role; anything not on the list falls back to the dashboard. */
export function afterLoginPath(role: string): string {
  const path = AFTER_LOGIN[role as Role];
  return path && LOGIN_REDIRECTS.has(path) ? path : "/dashboard";
}
