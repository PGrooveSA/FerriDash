import { redirect } from "next/navigation";
import { requireCtx, ownLearnerIds, type Ctx, type Role } from "./auth";
import { all, get } from "./db";
import { isChildcare, ratioFor, staffNeeded } from "./org";

/** Like requireCtx, for childcare-only pages: anyone else goes to their dashboard. */
export async function requireChildcare(roles?: Role[]): Promise<Ctx> {
  const ctx = await requireCtx(roles);
  if (!isChildcare(ctx.school)) redirect("/dashboard");
  return ctx;
}

export type Room = {
  id: number; name: string; age_group: string | null; capacity: number | null; room: string | null;
  lead_id: number | null; staff: { id: number; name: string; lead: boolean }[];
  children: number; present: number; perStaff: number; needed: number; over: boolean;
};

/** The centre's classrooms with their staff, enrolled children, children in today and the staff-to-child ratio. */
export async function classrooms(ctx: Ctx, date: string): Promise<Room[]> {
  const rooms = await all<{ id: number; name: string; age_group: string | null; capacity: number | null; room: string | null; lead_id: number | null; children: number; present: number }>(`
    SELECT c.id, c.name, c.age_group, c.capacity, c.room, c.class_teacher_id lead_id,
      (SELECT COUNT(*) FROM learners l WHERE l.class_id = c.id AND l.status = 'Active') children,
      (SELECT COUNT(*) FROM checkins k JOIN learners l ON l.id = k.learner_id WHERE l.class_id = c.id AND k.date = ?3 AND k.out_at IS NULL) present
    FROM classes c WHERE c.school_id = ?1 AND c.year = ?2 ORDER BY c.name`, ctx.schoolId, ctx.school.current_year, date);
  const staff = await all<{ class_id: number; id: number; name: string; lead: number }>(`
    SELECT c.id class_id, t.id, u.first_name || ' ' || u.last_name name, 1 lead FROM classes c JOIN teachers t ON t.id = c.class_teacher_id JOIN users u ON u.id = t.user_id WHERE c.school_id = ?1 AND c.year = ?2
    UNION SELECT cs.class_id, t.id, u.first_name || ' ' || u.last_name, 0 FROM classroom_staff cs JOIN classes c ON c.id = cs.class_id JOIN teachers t ON t.id = cs.teacher_id JOIN users u ON u.id = t.user_id
      WHERE c.school_id = ?1 AND c.year = ?2 AND t.id IS DISTINCT FROM c.class_teacher_id
    ORDER BY lead DESC, name`, ctx.schoolId, ctx.school.current_year);
  const custom = await ratioSettings(ctx.schoolId);
  return rooms.map((r) => {
    const s = staff.filter((x) => x.class_id === r.id).map((x) => ({ id: x.id, name: x.name, lead: !!x.lead }));
    const perStaff = ratioFor(r.age_group, custom);
    const needed = staffNeeded(r.present, perStaff);
    return { ...r, staff: s, perStaff, needed, over: r.present > 0 && s.length < needed };
  });
}

export const ratioSettings = (schoolId: number) =>
  all<{ age_group: string; children_per_staff: number }>("SELECT age_group, children_per_staff FROM ratio_settings WHERE school_id = ?", schoolId);

/** Classroom ids a practitioner works in (lead or staff). */
export async function myRooms(ctx: Ctx): Promise<number[]> {
  if (!ctx.teacherId) return [];
  return (await all<{ id: number }>("SELECT id FROM classes WHERE class_teacher_id = ?1 UNION SELECT class_id FROM classroom_staff WHERE teacher_id = ?1", ctx.teacherId)).map((r) => r.id);
}

/**
 * The child, if this user may see them: staff see every child at the centre; parents only their own children.
 * Health and contact details are special personal information (POPIA), so every page and action asks this first.
 */
export async function childFor(ctx: Ctx, learnerId: number) {
  if (!Number.isInteger(learnerId)) return null;
  const own = await ownLearnerIds(ctx);
  if (own && !own.includes(learnerId)) return null;
  return get<{ id: number; first_name: string; last_name: string; admission_number: string; date_of_birth: string | null; gender: string | null; class_id: number | null; className: string | null; fee_plan_id: number | null; plan: string | null; status: string; enrolled_on: string | null; address: string | null; home_language: string | null; id_number: string | null }>(`
    SELECT l.id, l.first_name, l.last_name, l.admission_number, l.date_of_birth, l.gender, l.class_id, c.name className, l.fee_plan_id, fp.name plan, l.status, l.enrolled_on, l.address, l.home_language, l.id_number
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id LEFT JOIN fee_plans fp ON fp.id = l.fee_plan_id
    WHERE l.id = ? AND l.school_id = ?`, learnerId, ctx.schoolId);
}

export type Allergy = { id: number; learner_id: number; allergen: string; severity: "Mild" | "Moderate" | "Severe"; reaction: string | null; action_plan: string | null };

/** Allergies of these children, most serious first. */
export async function allergiesOf(learnerIds: number[]): Promise<Allergy[]> {
  if (!learnerIds.length) return [];
  return all<Allergy>(`SELECT id, learner_id, allergen, severity, reaction, action_plan FROM child_allergies WHERE learner_id IN (${learnerIds.map(() => "?").join(",")})
    ORDER BY CASE severity WHEN 'Severe' THEN 0 WHEN 'Moderate' THEN 1 ELSE 2 END, allergen`, ...learnerIds);
}

/** Who may collect the child: linked parents always, plus contacts marked "can collect". */
export async function collectors(learnerId: number) {
  const parents = await all<{ id: number; name: string; relationship: string; phone: string | null }>(`
    SELECT u.id, u.first_name || ' ' || u.last_name name, g.relationship, u.phone FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = ? AND u.active = 1 ORDER BY u.first_name`, learnerId);
  const contacts = await all<{ id: number; name: string; relationship: string | null; phone: string | null; id_last_digits: string | null }>(
    "SELECT id, name, relationship, phone, id_last_digits FROM child_contacts WHERE learner_id = ? AND can_collect = 1 ORDER BY name", learnerId);
  return { parents, contacts };
}
