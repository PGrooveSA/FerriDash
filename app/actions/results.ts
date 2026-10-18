"use server";
import { revalidatePath } from "next/cache";
import { audit, get, run, tx } from "@/lib/db";
import { ADMIN, STAFF, fail, guarded, num, str, type ActionResult } from "@/lib/action-utils";
import type { Ctx } from "@/lib/auth";

/** Educators may only touch their own class-subjects; admins any in their school. */
function ownCs(ctx: Ctx, csId: number) {
  const cs = get<{ id: number; teacher_id: number | null }>("SELECT id, teacher_id FROM class_subjects WHERE id = ? AND school_id = ?", csId, ctx.schoolId) ?? fail("Subject not found.");
  if (!ctx.isAdmin && cs.teacher_id !== ctx.teacherId) fail("You can only capture marks for subjects you teach.");
  return cs;
}

function statusOf(csId: number, year: number, term: number) {
  return get<{ status: string }>("SELECT status FROM result_sets WHERE class_subject_id = ? AND year = ? AND term = ?", csId, year, term)?.status ?? "draft";
}

function assertEditable(ctx: Ctx, csId: number, year: number, term: number) {
  const s = statusOf(csId, year, term);
  if (s === "published" || s === "approved") fail(`Marks are ${s}. An administrator must return them to draft before changes can be made.`);
  if (s === "submitted" && !ctx.isAdmin) fail("Marks have been submitted for moderation and are locked.");
}

export async function saveAssessment(_: ActionResult, f: FormData) {
  return guarded(STAFF, (ctx) => {
    const id = num(f, "id"), csId = num(f, "class_subject_id")!, term = num(f, "term")!;
    ownCs(ctx, csId);
    assertEditable(ctx, csId, ctx.school.current_year, term);
    const max = num(f, "max_mark"), weight = num(f, "weight") ?? 1;
    if (!max || max <= 0) fail("Total marks must be more than 0.");
    if (weight <= 0) fail("Weight must be more than 0.");
    const vals = [str(f, "name"), str(f, "kind") || "SBA", max, weight, str(f, "date") || null];
    if (id) run("UPDATE assessments SET name=?, kind=?, max_mark=?, weight=?, date=? WHERE id = ? AND class_subject_id = ?", ...vals, id, csId);
    else run("INSERT INTO assessments (name, kind, max_mark, weight, date, school_id, class_subject_id, year, term) VALUES (?,?,?,?,?,?,?,?,?)", ...vals, ctx.schoolId, csId, ctx.school.current_year, term);
    audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "assessment", id, String(vals[0]));
    revalidatePath("/results");
  });
}

export async function deleteAssessment(id: number) {
  return guarded(STAFF, (ctx) => {
    const a = get<{ class_subject_id: number; year: number; term: number }>("SELECT class_subject_id, year, term FROM assessments WHERE id = ? AND school_id = ?", id, ctx.schoolId) ?? fail("Assessment not found.");
    ownCs(ctx, a.class_subject_id);
    assertEditable(ctx, a.class_subject_id, a.year, a.term);
    run("DELETE FROM assessments WHERE id = ?", id);
    audit(ctx.schoolId, ctx.user.id, "delete", "assessment", id);
    revalidatePath("/results");
  });
}

/** Saves a batch of cells. value: number, "ab" (absent) or "" (clear). */
export async function saveMarks(cells: { assessmentId: number; learnerId: number; value: string }[]): Promise<ActionResult> {
  return guarded(STAFF, (ctx) => {
    if (!cells.length) return;
    const meta = new Map<number, { max_mark: number; class_subject_id: number; year: number; term: number }>();
    for (const c of cells) {
      if (!meta.has(c.assessmentId)) {
        const a = get<{ max_mark: number; class_subject_id: number; year: number; term: number }>("SELECT max_mark, class_subject_id, year, term FROM assessments WHERE id = ? AND school_id = ?", c.assessmentId, ctx.schoolId) ?? fail("Assessment not found.");
        ownCs(ctx, a.class_subject_id);
        assertEditable(ctx, a.class_subject_id, a.year, a.term);
        meta.set(c.assessmentId, a);
      }
    }
    tx(() => {
      for (const c of cells) {
        const a = meta.get(c.assessmentId)!;
        const v = c.value.trim().toLowerCase();
        if (v === "") { run("DELETE FROM marks WHERE assessment_id = ? AND learner_id = ?", c.assessmentId, c.learnerId); continue; }
        const absent = v === "ab" || v === "a";
        const mark = absent ? null : Number(v.replace(",", "."));
        if (!absent && (Number.isNaN(mark) || mark! < 0 || mark! > a.max_mark)) fail(`Marks must be between 0 and ${a.max_mark} (or "ab" for absent).`);
        if (!get("SELECT id FROM learners WHERE id = ? AND class_id = (SELECT class_id FROM class_subjects WHERE id = ?)", c.learnerId, a.class_subject_id)) fail("Learner is not in this class.");
        run(`INSERT INTO marks (assessment_id, learner_id, mark, absent, updated_by, updated_at) VALUES (?,?,?,?,?,datetime('now'))
             ON CONFLICT(assessment_id, learner_id) DO UPDATE SET mark = excluded.mark, absent = excluded.absent, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          c.assessmentId, c.learnerId, mark, absent ? 1 : 0, ctx.user.id);
      }
    });
    audit(ctx.schoolId, ctx.user.id, "capture_marks", "marks", null, `${cells.length} cell(s)`);
  });
}

const TRANSITIONS: Record<string, { from: string[]; admin: boolean }> = {
  submitted: { from: ["draft"], admin: false },
  approved: { from: ["submitted", "draft"], admin: true },
  published: { from: ["approved", "submitted"], admin: true },
  draft: { from: ["submitted", "approved", "published"], admin: true },
};

export async function setResultStatus(csId: number, term: number, status: "draft" | "submitted" | "approved" | "published") {
  return guarded(STAFF, (ctx) => {
    ownCs(ctx, csId);
    const rule = TRANSITIONS[status] ?? fail("Unknown status.");
    if (rule.admin && !ctx.isAdmin) fail("Only school management can do this.");
    const year = ctx.school.current_year, current = statusOf(csId, year, term);
    if (!rule.from.includes(current)) fail(`Cannot move from ${current} to ${status}.`);
    run(`INSERT INTO result_sets (school_id, class_subject_id, year, term, status, submitted_by, approved_by, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(class_subject_id, year, term) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at,
           submitted_by = COALESCE(excluded.submitted_by, submitted_by), approved_by = COALESCE(excluded.approved_by, approved_by)`,
      ctx.schoolId, csId, year, term, status, status === "submitted" ? ctx.user.id : null, status === "approved" || status === "published" ? ctx.user.id : null);
    audit(ctx.schoolId, ctx.user.id, `results_${status}`, "result_set", csId, `term ${term}`);
    revalidatePath("/results", "layout");
  });
}

export async function publishAllApproved(term: number) {
  return guarded(ADMIN, (ctx) => {
    const r = run("UPDATE result_sets SET status = 'published', approved_by = ?, updated_at = datetime('now') WHERE school_id = ? AND year = ? AND term = ? AND status = 'approved'", ctx.user.id, ctx.schoolId, ctx.school.current_year, term);
    audit(ctx.schoolId, ctx.user.id, "results_publish_all", "result_set", null, `term ${term}: ${r.changes}`);
    revalidatePath("/results", "layout");
    return { ok: true, message: `${r.changes} mark sheet(s) published.` };
  });
}

export async function saveComment(_: ActionResult, f: FormData) {
  return guarded(STAFF, (ctx) => {
    const learnerId = num(f, "learner_id"), term = num(f, "term");
    if (!get("SELECT id FROM learners WHERE id = ? AND school_id = ?", learnerId, ctx.schoolId)) fail("Learner not found.");
    run(`INSERT INTO report_comments (school_id, learner_id, year, term, class_teacher_comment, principal_comment) VALUES (?,?,?,?,?,?)
         ON CONFLICT(learner_id, year, term) DO UPDATE SET class_teacher_comment = excluded.class_teacher_comment, principal_comment = COALESCE(excluded.principal_comment, principal_comment)`,
      ctx.schoolId, learnerId, ctx.school.current_year, term, str(f, "class_teacher_comment") || null, ctx.isAdmin ? str(f, "principal_comment") || null : null);
    revalidatePath("/reports/report-cards");
  });
}
