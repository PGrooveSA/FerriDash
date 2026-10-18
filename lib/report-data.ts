import { all, get } from "./db";
import type { Ctx } from "./auth";
import { attendanceSummary, classResults, termDates, type ClassResults, type Period } from "./results";
import type { ReportCardData } from "@/components/ReportCard";

/** Builds report-card data for every requested learner of one class (one classResults call). */
export function reportCards(ctx: Ctx, classId: number, period: Period, learnerIds: number[] | null, publishedOnly: boolean): { cr: ClassResults; cards: ReportCardData[] } | null {
  const cr = classResults(ctx.schoolId, classId, ctx.school.current_year, period, { publishedOnly });
  if (!cr) return null;
  const dates = termDates(ctx.schoolId, ctx.school.current_year, period);
  const classTeacher = get<{ name: string }>("SELECT COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name name FROM classes c JOIN teachers t ON t.id = c.class_teacher_id JOIN users u ON u.id = t.user_id WHERE c.id = ?", classId)?.name ?? null;
  const commentTerm = period === "year" ? 4 : period;
  const unpublished = cr.subjects.some((s) => s.status !== "published");
  const rows = learnerIds ? cr.learners.filter((l) => learnerIds.includes(l.id)) : cr.learners;
  const details = new Map(all<{ id: number; id_number: string | null; date_of_birth: string | null }>(`SELECT id, id_number, date_of_birth FROM learners WHERE class_id = ?`, classId).map((r) => [r.id, r]));
  const comments = new Map(all<{ learner_id: number; class_teacher_comment: string | null; principal_comment: string | null }>("SELECT learner_id, class_teacher_comment, principal_comment FROM report_comments WHERE year = ? AND term = ? AND learner_id IN (SELECT id FROM learners WHERE class_id = ?)", ctx.school.current_year, commentTerm, classId).map((c) => [c.learner_id, c]));
  return {
    cr,
    cards: rows.map((row) => ({
      school: ctx.school, cr, row, period,
      learner: { id_number: details.get(row.id)?.id_number ?? null, date_of_birth: details.get(row.id)?.date_of_birth ?? null, classTeacher },
      attendance: attendanceSummary(row.id, dates.start, dates.end),
      comments: comments.get(row.id) ?? null,
      draft: !publishedOnly && unpublished,
    })),
  };
}
