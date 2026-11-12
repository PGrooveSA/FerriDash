/**
 * Schools and childcare centres share FerriDash. A childcare centre (schools.org_type = 'childcare') has classrooms by
 * age group instead of grades, children instead of learners, daily check-in and check-out, and monthly fee plans;
 * CAPS results, reports, the timetable and assignments are school-only.
 */
export type OrgType = "school" | "childcare";

export const isChildcare = (s: { org_type?: string | null } | null | undefined) => s?.org_type === "childcare";

/** Age groups for childcare classrooms, with the default number of children per staff member. */
export const AGE_GROUPS = [
  { id: "babies", label: "Babies (0–18 months)", ratio: 6 },
  { id: "toddlers", label: "Toddlers (18 months–3 years)", ratio: 12 },
  { id: "3-4", label: "3–4 years", ratio: 20 },
  { id: "4-5", label: "4–5 years", ratio: 30 },
  { id: "5-6", label: "5–6 years", ratio: 30 },
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number]["id"];
export const isAgeGroup = (v: unknown): v is AgeGroup => AGE_GROUPS.some((g) => g.id === v);
export const ageGroupLabel = (id: string | null | undefined) => AGE_GROUPS.find((g) => g.id === id)?.label ?? "-";

/** Children per staff member for an age group: the centre's own setting, or the default. */
export const ratioFor = (ageGroup: string | null | undefined, custom: { age_group: string; children_per_staff: number }[] = []) =>
  custom.find((c) => c.age_group === ageGroup)?.children_per_staff ?? AGE_GROUPS.find((g) => g.id === ageGroup)?.ratio ?? 20;

/** Staff needed for this many children at this ratio (at least one while any child is there). */
export const staffNeeded = (children: number, perStaff: number) => (children <= 0 ? 0 : Math.ceil(children / perStaff));

/** Pages that belong to schools only; a childcare centre is sent to its dashboard instead. */
export const SCHOOL_ONLY = ["/learners", "/academics", "/attendance", "/results", "/reports", "/records", "/timetable", "/assignments", "/admissions", "/import", "/search"];
/** Pages that belong to childcare centres only. */
export const CHILDCARE_ONLY = ["/children", "/classrooms", "/checkin"];

export const inSection = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));
