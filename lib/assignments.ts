import { all, get, run } from "./db";
import { ownLearnerIds, type Ctx } from "./auth";

export type Assignment = {
  id: number; title: string; instructions: string | null; due_date: string; document_name: string | null; created_at: string;
  created_by: number | null; class_subject_id: number; class_id: number; class_name: string; grade: number; subject: string; author: string | null;
};

const SELECT = `SELECT a.id, a.title, a.instructions, a.due_date, a.document_name, a.created_at, a.created_by, a.class_subject_id,
    c.id class_id, c.name class_name, c.grade, s.name subject, COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name author
  FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id JOIN classes c ON c.id = cs.class_id
  JOIN subjects s ON s.id = cs.subject_id LEFT JOIN users u ON u.id = a.created_by`;

/** The current classes of a learner (self) or a parent's children. */
export async function familyClassIds(ctx: Ctx): Promise<number[]> {
  const ids = (await ownLearnerIds(ctx)) ?? [];
  if (!ids.length) return [];
  return (await all<{ class_id: number }>(`SELECT DISTINCT class_id FROM learners WHERE id IN (${ids.map(() => "?").join(",")}) AND class_id IS NOT NULL AND status = 'Active'`, ...ids)).map((r) => r.class_id);
}

/** May this staff member set or change work for this class subject? Admins: any in their school; educators: subjects they teach, or their own class. */
export async function canTeach(ctx: Ctx, classSubjectId: number): Promise<boolean> {
  if (ctx.isAdmin) return !!(await get("SELECT 1 FROM class_subjects WHERE id = ? AND school_id = ?", classSubjectId, ctx.schoolId));
  if (!ctx.teacherId) return false;
  return !!(await get(`SELECT 1 FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
    WHERE cs.id = ? AND cs.school_id = ? AND (cs.teacher_id = ? OR c.class_teacher_id = ?)`, classSubjectId, ctx.schoolId, ctx.teacherId, ctx.teacherId));
}

/**
 * Assignments this user may see, by due date. Learners and parents: their classes. Educators: work they set or
 * for classes they teach. Admins: the whole school, or only their own with `ownOnly` (keeps calendars readable).
 */
export async function visibleAssignments(ctx: Ctx, opts: { from?: string; to?: string; ownOnly?: boolean; id?: number } = {}): Promise<Assignment[]> {
  const where = ["a.school_id = ?"], args: (string | number)[] = [ctx.schoolId];
  if (ctx.user.role === "learner" || ctx.user.role === "parent") {
    const classes = await familyClassIds(ctx);
    if (!classes.length) return [];
    where.push(`c.id IN (${classes.map(() => "?").join(",")})`); args.push(...classes);
  } else if (ctx.isAdmin) {
    if (opts.ownOnly) { where.push("a.created_by = ?"); args.push(ctx.user.id); }
  } else {
    where.push("(a.created_by = ? OR cs.teacher_id = ? OR c.class_teacher_id = ?)"); args.push(ctx.user.id, ctx.teacherId ?? -1, ctx.teacherId ?? -1);
  }
  if (opts.id) { where.push("a.id = ?"); args.push(opts.id); }
  if (opts.from) { where.push("a.due_date >= ?"); args.push(opts.from); }
  if (opts.to) { where.push("a.due_date <= ?"); args.push(opts.to); }
  return all<Assignment>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY a.due_date, c.grade, c.name, s.name`, ...args);
}

/** New assignments for a learner or parent since they last opened the assignments page (top bar dot). */
export async function unreadAssignmentCount(ctx: Ctx): Promise<number> {
  if (ctx.user.role !== "learner" && ctx.user.role !== "parent") return 0;
  const classes = await familyClassIds(ctx);
  if (!classes.length) return 0;
  return (await get<{ n: number }>(`SELECT COUNT(*) n FROM assignments a JOIN class_subjects cs ON cs.id = a.class_subject_id
    WHERE cs.class_id IN (${classes.map(() => "?").join(",")}) AND a.created_at > COALESCE((SELECT assignments_seen_at FROM users WHERE id = ?), '')`,
    ...classes, ctx.user.id))!.n;
}

export async function markAssignmentsSeen(userId: number) {
  await run("UPDATE users SET assignments_seen_at = datetime('now') WHERE id = ?", userId);
}
