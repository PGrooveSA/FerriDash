import { all, get } from "./db";
import type { Ctx } from "./auth";
import { ownLearnerIds } from "./auth";
import { attendanceSummary, classResults, termDates } from "./results";

export type HistoryRow = {
  year: number; classId: number; className: string; grade: number; current: boolean;
  outcome: string | null; note: string | null; average: number | null; result: string | null; provisional: boolean;
  attendanceRate: number | null; daysRecorded: number;
};

/** Every year a learner was at the school, newest first: class history after year-end plus the current class. */
export async function learnerHistory(ctx: Ctx, learnerId: number, publishedOnly: boolean): Promise<HistoryRow[]> {
  const rows = await all<{ year: number; class_id: number; outcome: string | null; outcome_note: string | null }>(
      "SELECT year, class_id, outcome, outcome_note FROM enrolments WHERE learner_id = ? ORDER BY year DESC", learnerId);
  const cur = await get<{ class_id: number; year: number }>("SELECT l.class_id, c.year FROM learners l JOIN classes c ON c.id = l.class_id WHERE l.id = ? AND l.status = 'Active'", learnerId);
  if (cur && !rows.some((r) => r.year === cur.year)) rows.unshift({ year: cur.year, class_id: cur.class_id, outcome: null, outcome_note: null });
  rows.sort((a, b) => b.year - a.year);

  return (await Promise.all(rows.map(async (r) => {
      const cls = (await get<{ name: string; grade: number }>("SELECT name, grade FROM classes WHERE id = ?", r.class_id)) ?? { name: "?", grade: 0 };
      const cr = await classResults(ctx.schoolId, r.class_id, r.year, "year", { publishedOnly, learnerIds: [learnerId] });
      const row = cr?.learners[0];
      const dates = await termDates(ctx.schoolId, r.year, "year");
      const att = await attendanceSummary(learnerId, dates.start, dates.end);
      return {
        year: r.year, classId: r.class_id, className: cls.name, grade: cls.grade,
        current: r.year === ctx.school.current_year && !r.outcome,
        outcome: r.outcome, note: r.outcome_note,
        average: row?.average ?? null, result: row?.promotion?.outcome ?? null, provisional: row?.provisional ?? false,
        attendanceRate: att.rate, daysRecorded: att.total ?? 0,
      };
    })));
}

/**
 * Who may open a learner's record: school admins; educators who teach or taught the learner
 * (now or in an earlier year); the learner themself; their linked parents/guardians.
 */
export async function canViewLearner(ctx: Ctx, learnerId: number): Promise<boolean> {
  if (!(await get("SELECT id FROM learners WHERE id = ? AND school_id = ?", learnerId, ctx.schoolId))) return false;
  if (ctx.isAdmin) return true;
  const own = await ownLearnerIds(ctx);
  if (own) return own.includes(learnerId);
  if (ctx.user.role !== "teacher" || !ctx.teacherId) return false;
  return !!(await get(`SELECT 1 FROM (
      SELECT class_id FROM learners WHERE id = ?1 UNION SELECT class_id FROM enrolments WHERE learner_id = ?1
    ) k WHERE k.class_id IN (SELECT class_id FROM class_subjects WHERE teacher_id = ?2 UNION SELECT id FROM classes WHERE class_teacher_id = ?2) LIMIT 1`,
      learnerId, ctx.teacherId));
}
