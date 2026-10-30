import { all } from "./db";
import type { Ctx } from "./auth";

// Study groups: group chats that learners and staff start in Messages, for example to work through an
// assignment together. Learners may add classmates in their own grade and school staff, and every group a
// learner starts must include at least one educator or school admin. Staff may add anyone at the school
// except parents. Parents don't start study groups.

export const STAFF_ROLES = ["school_admin", "teacher"];
export const canStartGroup = (role: string) => role === "learner" || STAFF_ROLES.includes(role);

export type GroupCandidate = { id: number; name: string; role: string; group: string };

/** The people this user may add to a study group (not themselves), grouped for the picker. */
export async function groupCandidates(ctx: Ctx): Promise<GroupCandidate[]> {
  if (!canStartGroup(ctx.user.role)) return [];
  const staff = await all<{ id: number; name: string; role: string }>(`SELECT id, COALESCE(title || ' ', '') || first_name || ' ' || last_name name, role FROM users
    WHERE school_id = ? AND active = 1 AND id <> ? AND role IN ('school_admin','teacher') ORDER BY last_name, first_name`, ctx.schoolId, ctx.user.id);
  // Learners with a login, by class. A learner sees classmates in their own grade only.
  let grade: number | null = null;
  if (ctx.user.role === "learner") {
    grade = (await all<{ grade: number }>("SELECT c.grade FROM learners l JOIN classes c ON c.id = l.class_id WHERE l.user_id = ?", ctx.user.id))[0]?.grade ?? -1;
  }
  const learners = await all<{ id: number; name: string; class_name: string | null }>(`SELECT u.id, u.first_name || ' ' || u.last_name name, c.name class_name
    FROM users u JOIN learners l ON l.user_id = u.id LEFT JOIN classes c ON c.id = l.class_id
    WHERE u.school_id = ? AND u.active = 1 AND u.id <> ? AND u.role = 'learner' AND l.status = 'Active' ${grade !== null ? "AND c.grade = ?" : ""}
    ORDER BY c.grade, c.name, u.last_name, u.first_name`, ctx.schoolId, ctx.user.id, ...(grade !== null ? [grade] : []));
  return [
    ...staff.map((s) => ({ ...s, group: "Staff" })),
    ...learners.map((l) => ({ id: l.id, name: l.name, role: "learner", group: l.class_name ? `Class ${l.class_name}` : "Learners" })),
  ];
}
