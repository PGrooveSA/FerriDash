"use server";
import { revalidatePath } from "next/cache";
import { all, audit, get, run, tx } from "@/lib/db";
import { ADMIN, fail, guarded, num, type ActionResult } from "@/lib/action-utils";
import { nextClassName, yearEndPlan, type YearEndAction } from "@/lib/yearend";

const ACTIONS: YearEndAction[] = ["promote", "repeat", "graduate", "leave"];
const shiftYear = (date: string, by: number) => `${Number(date.slice(0, 4)) + by}${date.slice(4)}`;

/**
 * Closes the current academic year and opens the next one:
 * records every learner's class and outcome for the year, creates next year's classes
 * (copying subjects, teachers and register teachers), moves learners, graduates Grade 12s,
 * copies term dates and fee structures, and advances the school to Term 1 of the new year.
 */
export async function runYearEnd(_: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(ADMIN, (ctx) => {
    const year = ctx.school.current_year, next = year + 1;
    if (num(f, "confirm_year") !== year) fail(`Type ${year} to confirm.`);
    const plan = yearEndPlan(ctx);
    const counts = { promote: 0, repeat: 0, graduate: 0, leave: 0 };

    tx(() => {
      // Next year's class for a given name/grade: reuse if it exists, else create it from this year's same-grade class.
      const classFor = (name: string, grade: number): number => {
        const existing = get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND name = ? AND year = ?", ctx.schoolId, name, next);
        if (existing) return existing.id;
        const source = get<{ id: number; class_teacher_id: number | null; room: string | null }>(
          "SELECT id, class_teacher_id, room FROM classes WHERE school_id = ? AND year = ? AND grade = ? ORDER BY (name = ?) DESC, id LIMIT 1", ctx.schoolId, year, grade, name);
        const id = run("INSERT INTO classes (school_id, grade, name, year, class_teacher_id, room) VALUES (?,?,?,?,?,?)",
          ctx.schoolId, grade, name, next, source?.class_teacher_id ?? null, source?.room ?? null).id;
        if (source) run("INSERT INTO class_subjects (school_id, class_id, subject_id, teacher_id) SELECT school_id, ?, subject_id, teacher_id FROM class_subjects WHERE class_id = ?", id, source.id);
        return id;
      };

      for (const c of plan) {
        for (const l of c.learners) {
          let action = String(f.get(`action_${l.id}`) ?? l.action) as YearEndAction;
          if (!ACTIONS.includes(action)) action = l.action;
          if (action === "promote" && c.grade >= 12) action = "graduate";
          if (action === "graduate" && c.grade < 12) fail(`Only Grade 12 learners can graduate (${l.name}).`);

          const note = action === "promote" ? `Promoted to Grade ${c.grade + 1}` : action === "repeat" ? `Repeating ${c.grade === 0 ? "Grade R" : "Grade " + c.grade}` : action === "graduate" ? (l.promoted ? "Matriculated" : "Completed Grade 12") : "Left the school";
          run("INSERT INTO enrolments (learner_id, year, class_id, outcome, outcome_note) VALUES (?,?,?,?,?) ON CONFLICT(learner_id, year) DO UPDATE SET class_id = excluded.class_id, outcome = excluded.outcome, outcome_note = excluded.outcome_note",
            l.id, year, c.id, action === "promote" ? "promoted" : action === "repeat" ? "repeated" : action === "graduate" ? "graduated" : "left", note);

          if (action === "promote") run("UPDATE learners SET class_id = ? WHERE id = ?", classFor(nextClassName(c.name, c.grade), c.grade + 1), l.id);
          else if (action === "repeat") run("UPDATE learners SET class_id = ? WHERE id = ?", classFor(c.name, c.grade), l.id);
          else if (action === "graduate") run("UPDATE learners SET status = 'Graduated' WHERE id = ?", l.id);
          else run("UPDATE learners SET status = 'Withdrawn' WHERE id = ?", l.id);
          counts[action]++;
        }
      }

      // Term dates and fee structures carry over a year (edit them later in Settings / Fees).
      for (const t of all<{ number: number; start_date: string; end_date: string }>("SELECT number, start_date, end_date FROM terms WHERE school_id = ? AND year = ?", ctx.schoolId, year))
        run("INSERT OR IGNORE INTO terms (school_id, year, number, start_date, end_date) VALUES (?,?,?,?,?)", ctx.schoolId, next, t.number, shiftYear(t.start_date, 1), shiftYear(t.end_date, 1));
      run(`INSERT OR IGNORE INTO fee_structures (school_id, year, grade, tuition, activities, other)
           SELECT school_id, ?, grade, tuition, activities, other FROM fee_structures WHERE school_id = ? AND year = ?`, next, ctx.schoolId, year);
      run("UPDATE schools SET current_year = ?, current_term = 1 WHERE id = ?", next, ctx.schoolId);
      audit(ctx.schoolId, ctx.user.id, "year_end", "school", ctx.schoolId,
        `${year} -> ${next}: ${counts.promote} promoted, ${counts.repeat} repeating, ${counts.graduate} graduated, ${counts.leave} left`);
    });

    revalidatePath("/", "layout");
    return { ok: true, message: `${year} closed. ${counts.promote} promoted, ${counts.repeat} repeating, ${counts.graduate} graduated, ${counts.leave} left. Welcome to ${next}.` };
  });
}
