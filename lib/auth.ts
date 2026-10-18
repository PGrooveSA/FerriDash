import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get } from "./db";
import { SCHOOL_COOKIE, SESSION_COOKIE, verifySession } from "./session";

export type Role = "super_admin" | "school_admin" | "teacher" | "learner" | "parent";

export type User = {
  id: number; school_id: number | null; role: Role; title: string | null;
  first_name: string; last_name: string; email: string; phone: string | null;
};

export type School = {
  id: number; name: string; emis_number: string; province: string; district: string; quintile: number;
  school_type: string; fee_paying: number; address: string; phone: string; email: string; principal: string;
  motto: string; current_year: number; current_term: number;
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

export async function getCtx(): Promise<Ctx | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = get<User>("SELECT id, school_id, role, title, first_name, last_name, email, phone FROM users WHERE id = ? AND active = 1", session.uid);
  if (!user) return null;

  let schoolId = user.school_id;
  if (user.role === "super_admin") {
    // Platform admins act inside whichever school they have selected.
    const chosen = Number(store.get(SCHOOL_COOKIE)?.value);
    schoolId = chosen && get("SELECT id FROM schools WHERE id = ?", chosen) ? chosen : (get<{ id: number }>("SELECT id FROM schools ORDER BY id LIMIT 1")?.id ?? null);
  }
  if (!schoolId) return null;
  const school = get<School>("SELECT * FROM schools WHERE id = ?", schoolId)!;
  const teacherId = user.role === "teacher" ? (get<{ id: number }>("SELECT id FROM teachers WHERE user_id = ?", user.id)?.id ?? null) : null;
  const learnerId = user.role === "learner" ? (get<{ id: number }>("SELECT id FROM learners WHERE user_id = ?", user.id)?.id ?? null) : null;
  return { user, school, schoolId, teacherId, learnerId, isAdmin: user.role === "super_admin" || user.role === "school_admin" };
}

/** Use at the top of every protected page / action. Redirects when not allowed. */
export async function requireCtx(roles?: Role[]): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (roles && !roles.includes(ctx.user.role) && !(ctx.user.role === "super_admin" && roles.includes("school_admin"))) redirect("/dashboard");
  return ctx;
}

/** Learner ids the current user may see (own child/children for parents, self for learners). */
export function ownLearnerIds(ctx: Ctx): number[] | null {
  if (ctx.user.role === "learner") return ctx.learnerId ? [ctx.learnerId] : [];
  if (ctx.user.role === "parent") {
    return all<{ learner_id: number }>("SELECT learner_id FROM guardian_links WHERE parent_user_id = ?", ctx.user.id).map((r) => r.learner_id);
  }
  return null; // staff: no restriction at learner level
}
