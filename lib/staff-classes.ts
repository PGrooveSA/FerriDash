import { all } from "./db";
import type { Ctx } from "./auth";

/** Classes the current staff member may report on (all for admins). */
export function staffClasses(ctx: Ctx) {
  return ctx.isAdmin
    ? all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, ctx.school.current_year)
    : all<{ id: number; name: string; grade: number }>("SELECT DISTINCT c.id, c.name, c.grade FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.year = ?2 AND (cs.teacher_id = ?1 OR c.class_teacher_id = ?1) ORDER BY c.grade, c.name", ctx.teacherId, ctx.school.current_year);
}
