import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export type Role = "super_admin" | "school_admin" | "teacher" | "learner" | "parent";
/** Everyone who works inside a school. The platform admin (super_admin) only manages schools. */
export const SCHOOL_ROLES: Role[] = ["school_admin", "teacher", "learner", "parent"];
/** Pages and actions open to every signed-in user, including the platform admin (layout, dashboard, profile). */
export const EVERYONE: Role[] = ["super_admin", ...SCHOOL_ROLES];

export type User = {
  id: number; school_id: number | null; role: Role; title: string | null;
  first_name: string; last_name: string; email: string; phone: string | null; avatar_updated_at: string | null; banner_updated_at: string | null; language: string | null;
};

export type School = {
  id: number; name: string; emis_number: string; province: string; district: string; quintile: number;
  school_type: string; fee_paying: number; address: string; phone: string; email: string; principal: string;
  motto: string; current_year: number; current_term: number; logo_updated_at: string | null;
};

export type Ctx = {
  user: User;
  school: School;
  schoolId: number;
  /** teachers.id for educators, learners.id for learners */
  teacherId: number | null;
  learnerId: number | null;
  isAdmin: boolean;
};

/** Stands in for a school in the platform admin's context before any school exists. */
const NO_SCHOOL: School = {
  id: 0, name: "FerriDash", emis_number: "", province: "", district: "", quintile: 0, school_type: "", fee_paying: 0,
  address: "", phone: "", email: "", principal: "", motto: "", current_year: new Date().getFullYear(), current_term: 1, logo_updated_at: null,
};

/**
 * Who is signed in, with their school. One database round trip, remembered for the rest of the request
 * (the layout, the page and its components all ask). A session older than the user's session_version
 * (password changed or reset since) no longer counts.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const row = await get<User & { session_version: number; teacher_id: number | null; learner_id: number | null; school: (School & { active: number }) | null }>(
    `SELECT u.id, u.school_id, u.role, u.title, u.first_name, u.last_name, u.email, u.phone, u.avatar_updated_at, u.banner_updated_at, u.language, u.session_version,
       (SELECT id FROM teachers WHERE user_id = u.id) teacher_id, (SELECT id FROM learners WHERE user_id = u.id) learner_id,
       (SELECT row_to_json(s) FROM schools s WHERE s.id = CASE WHEN u.role = 'super_admin' THEN (SELECT MIN(id) FROM schools) ELSE u.school_id END) school
     FROM users u WHERE u.id = ? AND u.active = 1`, session.uid);
  if (!row || row.session_version !== session.sv) return null;
  const { session_version: _sv, teacher_id, learner_id, school, ...user } = row;

  // Platform admins don't belong to a school and never act inside one; the first school only fills
  // the context's school field (school pages and actions refuse platform admins). On a new installation
  // there is no school yet: the platform admin still signs in, to add the first one.
  if (!school) return user.role === "super_admin" ? { user, school: NO_SCHOOL, schoolId: 0, teacherId: null, learnerId: null, isAdmin: false } : null;
  // A suspended school's users are signed out straight away, not only at their next login.
  if (user.role !== "super_admin" && !school.active) return null;
  return {
    user, school, schoolId: school.id,
    teacherId: user.role === "teacher" ? teacher_id : null,
    learnerId: user.role === "learner" ? learner_id : null,
    isAdmin: user.role === "school_admin",
  };
});

/** Use at the top of every protected page / action. Redirects when not allowed. */
export async function requireCtx(roles?: Role[]): Promise<Ctx> {
  const ctx = await getCtx();
  // Signed in, but the account or its school can no longer be used: end the session properly.
  if (!ctx) redirect((await cookies()).get(SESSION_COOKIE) ? "/api/session-end" : "/login");
  // No roles = any school user. The platform admin only reaches pages that name "super_admin".
  if (!(roles ?? SCHOOL_ROLES).includes(ctx.user.role)) redirect("/dashboard");
  return ctx;
}

/** Learner ids the current user may see (own child/children for parents, self for learners). */
export async function ownLearnerIds(ctx: Ctx): Promise<number[] | null> {
  if (ctx.user.role === "learner") return ctx.learnerId ? [ctx.learnerId] : [];
  if (ctx.user.role === "parent") {
    return (await all<{ learner_id: number }>("SELECT learner_id FROM guardian_links WHERE parent_user_id = ?", ctx.user.id)).map((r) => r.learner_id);
  }
  return null; // staff: no restriction at learner level
}
