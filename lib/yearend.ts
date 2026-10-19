import { all } from "./db";
import type { Ctx } from "./auth";
import { classResults } from "./results";
import { gradeLabel } from "./format";

export type YearEndAction = "promote" | "repeat" | "graduate" | "leave";

export type PlanLearner = {
  id: number; name: string; admission_number: string; average: number | null;
  outcome: string; promoted: boolean | null; provisional: boolean; incomplete: boolean;
  action: YearEndAction; reason: string;
};
export type PlanClass = { id: number; name: string; grade: number; promoteTo: string; repeatIn: string; learners: PlanLearner[] };

/** Class name for the next grade: "8A" -> "9A", "Grade R-A" -> "1A"; Grade 12 has no next grade. */
export function nextClassName(name: string, grade: number): string {
  const suffix = name.replace(/^(grade\s*)?(\d{1,2}|R)\s*[-\s]?/i, "").trim() || "A";
  return grade >= 12 ? name : `${grade + 1}${suffix}`;
}

/** Works out the default year-end action for every active learner in the current year's classes. */
export function yearEndPlan(ctx: Ctx): PlanClass[] {
  const year = ctx.school.current_year;
  const classes = all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, year);
  return classes.map((c) => {
    const cr = classResults(ctx.schoolId, c.id, year, "year");
    const learners: PlanLearner[] = (cr?.learners ?? []).map((l) => {
      const p = l.promotion;
      const incomplete = !p;
      let action: YearEndAction, reason: string;
      if (incomplete) { action = "repeat"; reason = "Marks are incomplete: check before promoting."; }
      else if (c.grade === 12) { action = p!.promoted ? "graduate" : "repeat"; reason = p!.outcome; }
      else { action = p!.promoted ? "promote" : "repeat"; reason = p!.outcome; }
      return {
        id: l.id, name: `${l.last_name}, ${l.first_name}`, admission_number: l.admission_number, average: l.average,
        outcome: p?.outcome ?? "Incomplete marks", promoted: p ? p.promoted : null, provisional: l.provisional, incomplete, action, reason,
      };
    });
    return { id: c.id, name: c.name, grade: c.grade, promoteTo: c.grade >= 12 ? "-" : `${nextClassName(c.name, c.grade)} (${gradeLabel(c.grade + 1)})`, repeatIn: `${c.name} (${gradeLabel(c.grade)})`, learners };
  });
}
