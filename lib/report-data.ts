import { all, get } from "./db";
import type { Ctx } from "./auth";
import { attendanceSummary, classResults, termDates, type ClassResults, type Period } from "./results";
import type { ReportCardData } from "@/components/ReportCard";

/** Builds report-card data for every requested learner of one class (one classResults call). */
export async function reportCards(ctx: Ctx, classId: number, period: Period, learnerIds: number[] | null, publishedOnly: boolean, year = ctx.school.current_year): Promise<{ cr: ClassResults; cards: ReportCardData[] } | null> {
  const cr = await classResults(ctx.schoolId, classId, year, period, { publishedOnly });
  if (!cr) return null;
  const dates = await termDates(ctx.schoolId, year, period);
  const classTeacher = (await get<{ name: string }>("SELECT COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name name FROM classes c JOIN teachers t ON t.id = c.class_teacher_id JOIN users u ON u.id = t.user_id WHERE c.id = ?", classId))?.name ?? null;
  const commentTerm = period === "year" ? 4 : period;
  const unpublished = cr.subjects.some((s) => s.status !== "published");
  const rows = learnerIds ? cr.learners.filter((l) => learnerIds.includes(l.id)) : cr.learners;
  const ids = cr.learners.map((l) => l.id);
  const inIds = ids.map(() => "?").join(",") || "NULL";
  const details = new Map((await all<{ id: number; id_number: string | null; date_of_birth: string | null }>(`SELECT id, id_number, date_of_birth FROM learners WHERE id IN (${inIds})`, ...ids)).map((r) => [r.id, r]));
  const comments = new Map((await all<{ learner_id: number; class_teacher_comment: string | null; principal_comment: string | null }>(`SELECT learner_id, class_teacher_comment, principal_comment FROM report_comments WHERE year = ? AND term = ? AND learner_id IN (${inIds})`, year, commentTerm, ...ids)).map((c) => [c.learner_id, c]));
  return {
    cr,
    cards: (await Promise.all(rows.map(async (row) => ({
          school: ctx.school, cr, row, period,
          learner: { id_number: details.get(row.id)?.id_number ?? null, date_of_birth: details.get(row.id)?.date_of_birth ?? null, classTeacher },
          attendance: await attendanceSummary(row.id, dates.start, dates.end),
          comments: comments.get(row.id) ?? null,
          draft: !publishedOnly && unpublished,
        })))),
  };
}
