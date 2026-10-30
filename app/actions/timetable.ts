"use server";
import { revalidatePath } from "next/cache";
import { all, audit, get, run } from "@/lib/db";
import { STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { fmtDate } from "@/lib/format";
import { notify, familyOf } from "@/lib/push";
import { today } from "@/lib/today";
import { canManageClass, getSlot } from "@/lib/timetable";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Adds or changes a lesson in a class timetable: weekly on a day, or once on a date (an extra class).
 * The "lesson" field is "cs:<class subject id>" for a subject, or "c:<class id>" for something else
 * (assembly, sport, study period), which then needs a title.
 */
export async function saveSlot(_: ActionResult, f: FormData): Promise<ActionResult> {
  const res = await guarded(STAFF, async (ctx) => {
    const id = num(f, "id");
    const [kind, ref] = str(f, "lesson").split(":");
    let classId: number, csId: number | null = null;
    if (kind === "cs") {
      const cs = (await get<{ class_id: number }>("SELECT class_id FROM class_subjects WHERE id = ? AND school_id = ?", Number(ref), ctx.schoolId)) ?? fail("Choose a class and subject.");
      classId = cs.class_id; csId = Number(ref);
    } else if (kind === "c") classId = Number(ref);
    else fail("Choose a class and subject.");
    if (!(await canManageClass(ctx, classId!))) fail("You can only schedule classes you teach or register.");
    const title = opt(f, "title")?.slice(0, 80) ?? null;
    if (!csId && !title) fail("Give the lesson a name, for example Assembly or Study period.");
    const once = str(f, "repeat") === "once";
    const date = once ? str(f, "date") : null;
    const day = once ? null : num(f, "day_of_week");
    if (once && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) fail("Choose the date of the extra class.");
    if (!once && !(day && day >= 1 && day <= 7)) fail("Choose the day of the week.");
    const start = str(f, "start_time"), end = str(f, "end_time");
    if (!TIME.test(start) || !TIME.test(end)) fail("Enter the start and end times.");
    if (end <= start) fail("The lesson must end after it starts.");
    const vals = [classId!, csId, title, day, date, start, end, opt(f, "room")?.slice(0, 40) ?? null, opt(f, "notes")?.slice(0, 300) ?? null];
    if (id) {
      const old = (await getSlot(ctx, id)) ?? fail("Lesson not found.");
      if (!(await canManageClass(ctx, old.class_id))) fail("You can only change classes you teach or register.");
      await run("UPDATE timetable_slots SET class_id=?, class_subject_id=?, title=?, day_of_week=?, date=?, start_time=?, end_time=?, room=?, notes=? WHERE id = ?", ...vals, id);
    } else {
      const newId = (await run("INSERT INTO timetable_slots (class_id, class_subject_id, title, day_of_week, date, start_time, end_time, room, notes, school_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ...vals, ctx.schoolId, ctx.user.id)).id;
      await audit(ctx.schoolId, ctx.user.id, "create", "timetable", newId);
      // A new extra class is news for the class's learners and their parents.
      if (once && date! >= today()) {
        const subject = csId ? (await get<{ name: string }>("SELECT s.name FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.id = ?", csId))?.name : null;
        const learners = (await all<{ id: number }>("SELECT id FROM learners WHERE class_id = ? AND status = 'Active'", classId!)).map((l) => l.id);
        notify(await familyOf(learners), {
          title: `Extra class: ${[subject, title].filter(Boolean).join(" · ")}`,
          body: `${fmtDate(date, { weekday: "short", day: "numeric", month: "short" })}, ${start}–${end}${vals[7] ? ` · ${vals[7]}` : ""}`,
          url: `/timetable?class=${classId!}`,
        });
      }
    }
    revalidatePath("/timetable");
    revalidatePath("/dashboard");
  });
  return res;
}

export async function deleteSlot(id: number): Promise<ActionResult> {
  return guarded(STAFF, async (ctx) => {
    const s = (await getSlot(ctx, id)) ?? fail("Lesson not found.");
    if (!(await canManageClass(ctx, s.class_id))) fail("You can only change classes you teach or register.");
    await run("DELETE FROM timetable_slots WHERE id = ?", id);
    await audit(ctx.schoolId, ctx.user.id, "delete", "timetable", id);
    revalidatePath("/timetable");
    revalidatePath("/dashboard");
  });
}
