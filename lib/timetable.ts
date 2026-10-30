import { all, get } from "./db";
import type { Ctx } from "./auth";
import { today, addDays } from "./today";

// Class timetables. A slot is either a weekly lesson (day_of_week, 1 = Monday … 7 = Sunday) or a one-off
// extra class on a date. School admins manage every class; educators manage the classes they teach or
// register. Learners and parents see their own classes' timetable (dashboard and the Timetable page).

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type Slot = {
  id: number; class_id: number; class_name: string; class_subject_id: number | null; subject: string | null; title: string | null;
  day_of_week: number | null; date: string | null; start_time: string; end_time: string; room: string | null; notes: string | null; teacher: string | null;
};

const SELECT = `SELECT t.id, t.class_id, c.name class_name, t.class_subject_id, s.name subject, t.title, t.day_of_week, t.date, t.start_time, t.end_time, t.room, t.notes,
    COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name teacher
  FROM timetable_slots t JOIN classes c ON c.id = t.class_id
  LEFT JOIN class_subjects cs ON cs.id = t.class_subject_id LEFT JOIN subjects s ON s.id = cs.subject_id
  LEFT JOIN teachers te ON te.id = cs.teacher_id LEFT JOIN users u ON u.id = te.user_id`;

/** 1 = Monday … 7 = Sunday, for a YYYY-MM-DD date. */
export const weekday = (date: string) => ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
export const slotName = (s: Pick<Slot, "subject" | "title">) => s.subject ? (s.title ? `${s.subject}: ${s.title}` : s.subject) : (s.title ?? "");

/** Classes this user may schedule for (current year): admins all, educators the ones they teach or register. */
export async function managedClasses(ctx: Ctx): Promise<{ id: number; name: string; grade: number }[]> {
  if (ctx.isAdmin) return all("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, ctx.school.current_year);
  if (ctx.user.role !== "teacher" || !ctx.teacherId) return [];
  return all(`SELECT DISTINCT c.id, c.name, c.grade FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id
    WHERE c.school_id = ? AND c.year = ? AND (c.class_teacher_id = ? OR cs.teacher_id = ?) ORDER BY c.grade, c.name`, ctx.schoolId, ctx.school.current_year, ctx.teacherId, ctx.teacherId);
}

export async function canManageClass(ctx: Ctx, classId: number) {
  return (await managedClasses(ctx)).some((c) => c.id === classId);
}

/** A class's weekly lessons and its one-off classes from today on. */
export async function classTimetable(classId: number) {
  const weekly = await all<Slot>(`${SELECT} WHERE t.class_id = ? AND t.date IS NULL ORDER BY t.day_of_week, t.start_time`, classId);
  const extra = await all<Slot>(`${SELECT} WHERE t.class_id = ? AND t.date >= ? ORDER BY t.date, t.start_time`, classId, today());
  return { weekly, extra };
}

/** What these classes have on a date: that weekday's lessons plus extra classes on the date, by start time. */
export async function scheduleOn(classIds: number[], date: string): Promise<Slot[]> {
  if (!classIds.length) return [];
  const ids = classIds.map(() => "?").join(",");
  return all<Slot>(`${SELECT} WHERE t.class_id IN (${ids}) AND ((t.date IS NULL AND t.day_of_week = ?) OR t.date = ?) ORDER BY t.start_time, c.name`,
    ...classIds, weekday(date), date);
}

/** One-off extra classes for these classes in the next `days` days (today excluded). */
export async function upcomingExtras(classIds: number[], days = 14): Promise<Slot[]> {
  if (!classIds.length) return [];
  const t = today();
  return all<Slot>(`${SELECT} WHERE t.class_id IN (${classIds.map(() => "?").join(",")}) AND t.date > ? AND t.date <= ? ORDER BY t.date, t.start_time`,
    ...classIds, t, addDays(t, days));
}

/** An educator's own lessons on a date (subjects they teach). */
export async function teacherScheduleOn(teacherId: number, date: string): Promise<Slot[]> {
  return all<Slot>(`${SELECT} WHERE cs.teacher_id = ? AND ((t.date IS NULL AND t.day_of_week = ?) OR t.date = ?) ORDER BY t.start_time`, teacherId, weekday(date), date);
}

export async function getSlot(ctx: Ctx, id: number) {
  return get<{ id: number; class_id: number; date: string | null }>("SELECT id, class_id, date FROM timetable_slots WHERE id = ? AND school_id = ?", id, ctx.schoolId);
}
