import { all, get } from "./db";

/**
 * Learners who belonged to a class in a given year. After a year-end rollover the class history
 * (enrolments) is used; for the current year it is simply the active learners in the class.
 */
export async function classMemberIds(classId: number, year: number): Promise<number[]> {
  const past = await all<{ learner_id: number }>("SELECT learner_id FROM enrolments WHERE class_id = ? AND year = ?", classId, year);
  if (past.length) return past.map((r) => r.learner_id);
  return (await all<{ id: number }>("SELECT id FROM learners WHERE class_id = ? AND status = 'Active'", classId)).map((r) => r.id);
}

/** The class a learner was in for a year (history first, then their current class if it is that year's). */
export async function learnerClassForYear(learnerId: number, year: number): Promise<number | null> {
  const e = await get<{ class_id: number }>("SELECT class_id FROM enrolments WHERE learner_id = ? AND year = ?", learnerId, year);
  if (e) return e.class_id;
  return (await get<{ class_id: number }>("SELECT l.class_id FROM learners l JOIN classes c ON c.id = l.class_id WHERE l.id = ? AND c.year = ?", learnerId, year))?.class_id ?? null;
}

/** Years a learner has results for, newest first. */
export async function learnerYears(learnerId: number): Promise<number[]> {
  return (await all<{ year: number }>(`SELECT year FROM enrolments WHERE learner_id = ?1
    UNION SELECT c.year FROM learners l JOIN classes c ON c.id = l.class_id WHERE l.id = ?1 ORDER BY year DESC`, learnerId)).map((r) => r.year);
}

/** Academic years that have classes at a school, newest first. */
export async function schoolYears(schoolId: number): Promise<number[]> {
  return (await all<{ year: number }>("SELECT DISTINCT year FROM classes WHERE school_id = ? ORDER BY year DESC", schoolId)).map((r) => r.year);
}
