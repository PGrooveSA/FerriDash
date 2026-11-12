import { all, run } from "./db";

/**
 * Learners and children who have left keep their records, but not their logins: a learner's own login works only
 * while they are Active, and a parent's only while at least one of their linked children is. Called whenever a
 * status changes (leaving, re-admitting, year-end) or a child is linked. Switching a login off also ends the
 * person's open sessions (session_version).
 */
export async function syncFamilyLogins(learnerIds: number[]) {
  if (!learnerIds.length) return;
  const list = learnerIds.map(() => "?").join(",");
  const learners = await all<{ user_id: number; current: number }>(
    `SELECT user_id, (status = 'Active')::int current FROM learners WHERE user_id IS NOT NULL AND id IN (${list})`, ...learnerIds);
  for (const l of learners) await setActive(l.user_id, !!l.current);
  const parents = await all<{ id: number; current: number }>(`
    SELECT g.parent_user_id id, MAX((l.status = 'Active')::int) current FROM guardian_links g JOIN learners l ON l.id = g.learner_id
    WHERE g.parent_user_id IN (SELECT parent_user_id FROM guardian_links WHERE learner_id IN (${list})) GROUP BY g.parent_user_id`, ...learnerIds);
  for (const p of parents) await setActive(p.id, !!p.current);
}

const setActive = (userId: number, on: boolean) => on
  ? run("UPDATE users SET active = 1 WHERE id = ? AND active = 0 AND role IN ('learner','parent')", userId)
  : run("UPDATE users SET active = 0, session_version = session_version + 1 WHERE id = ? AND active = 1 AND role IN ('learner','parent')", userId);

/** Statuses for someone who has left, with the words a school and a childcare centre use for them. */
export const LEFT_STATUSES = {
  school: [{ value: "Transferred", label: "Transferred to another school" }, { value: "Withdrawn", label: "Withdrawn / left" }, { value: "Graduated", label: "Graduated (finished Grade 12)" }],
  childcare: [{ value: "Withdrawn", label: "Left the centre" }, { value: "Graduated", label: "Went to school" }, { value: "Transferred", label: "Moved to another centre" }],
};
export const leftLabel = (status: string, childcare: boolean) =>
  LEFT_STATUSES[childcare ? "childcare" : "school"].find((s) => s.value === status)?.label ?? status;
