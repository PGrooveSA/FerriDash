"use server";
import { get, run, tx } from "@/lib/db";
import { STAFF, fail, guarded } from "@/lib/action-utils";
import type { Ctx } from "@/lib/auth";

async function canMark(ctx: Ctx, classId: number) {
  if (ctx.isAdmin) return !!(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", classId, ctx.schoolId));
  return !!(await get("SELECT 1 FROM classes WHERE id = ?1 AND (class_teacher_id = ?2 OR id IN (SELECT class_id FROM class_subjects WHERE teacher_id = ?2))", classId, ctx.teacherId));
}

export async function setAttendance(learnerId: number, date: string, status: "P" | "A" | "L" | "E" | null) {
  return guarded(STAFF, async (ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("Invalid date.");
    const l = (await get<{ class_id: number }>("SELECT class_id FROM learners WHERE id = ? AND school_id = ?", learnerId, ctx.schoolId)) ?? fail("Learner not found.");
    if (!(await canMark(ctx, l.class_id))) fail("You can only take the register for your own classes.");
    if (status == null) await run("DELETE FROM attendance WHERE learner_id = ? AND date = ?", learnerId, date);
    else await run("INSERT INTO attendance (school_id, learner_id, date, status, recorded_by) VALUES (?,?,?,?,?) ON CONFLICT(learner_id, date) DO UPDATE SET status = excluded.status, recorded_by = excluded.recorded_by", ctx.schoolId, learnerId, date, status, ctx.user.id);
  });
}

/** Marks everyone without a status on that day as present. */
export async function markAllPresent(classId: number, date: string) {
  return guarded(STAFF, async (ctx) => {
    if (!(await canMark(ctx, classId))) fail("You can only take the register for your own classes.");
    await tx(() => run(`INSERT INTO attendance (school_id, learner_id, date, status, recorded_by)
      SELECT ?, id, ?, 'P', ? FROM learners WHERE class_id = ? AND status = 'Active'
      ON CONFLICT (learner_id, date) DO NOTHING`, ctx.schoolId, date, ctx.user.id, classId));
  });
}
