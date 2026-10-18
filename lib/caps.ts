// CAPS (Curriculum and Assessment Policy Statement) helpers.
// Promotion rules follow the National Policy pertaining to Programme and Promotion
// Requirements (NPPPPR). They are indicative: schools must verify against the
// latest DBE circulars before using results for official promotion decisions.

export type Level = { level: number; min: number; max: number; descriptor: string; short: string };

export const CAPS_LEVELS: Level[] = [
  { level: 7, min: 80, max: 100, descriptor: "Outstanding achievement", short: "Outstanding" },
  { level: 6, min: 70, max: 79, descriptor: "Meritorious achievement", short: "Meritorious" },
  { level: 5, min: 60, max: 69, descriptor: "Substantial achievement", short: "Substantial" },
  { level: 4, min: 50, max: 59, descriptor: "Adequate achievement", short: "Adequate" },
  { level: 3, min: 40, max: 49, descriptor: "Moderate achievement", short: "Moderate" },
  { level: 2, min: 30, max: 39, descriptor: "Elementary achievement", short: "Elementary" },
  { level: 1, min: 0, max: 29, descriptor: "Not achieved", short: "Not achieved" },
];

export function capsLevel(pct: number | null | undefined): Level | null {
  if (pct == null || Number.isNaN(pct)) return null;
  const p = Math.round(pct);
  return CAPS_LEVELS.find((l) => p >= l.min) ?? CAPS_LEVELS[CAPS_LEVELS.length - 1];
}

export type Phase = "Foundation" | "Intermediate" | "Senior" | "FET";

export function phaseOf(grade: number): Phase {
  if (grade <= 3) return "Foundation";
  if (grade <= 6) return "Intermediate";
  if (grade <= 9) return "Senior";
  return "FET";
}

/** Share of the final mark that comes from School-Based Assessment (the rest is examinations). */
export const SBA_WEIGHT: Record<Phase, number> = { Foundation: 1, Intermediate: 0.75, Senior: 0.4, FET: 0.25 };

export type AssessmentLite = { id: number; term: number; kind: "SBA" | "PAT" | "EXAM"; max_mark: number; weight: number };
export type MarkLite = { mark: number | null; absent: number };

/** Weighted percentage over assessments that have a captured mark (absent counts as 0). */
function weightedPct(list: AssessmentLite[], marks: Map<number, MarkLite>): number | null {
  let num = 0, den = 0;
  for (const a of list) {
    const m = marks.get(a.id);
    if (!m || (m.mark == null && !m.absent)) continue;
    num += ((m.mark ?? 0) / a.max_mark) * 100 * a.weight;
    den += a.weight;
  }
  return den ? num / den : null;
}

function blend(grade: number, sba: number | null, exam: number | null): number | null {
  if (sba == null && exam == null) return null;
  if (exam == null) return sba;
  if (sba == null) return exam;
  const w = SBA_WEIGHT[phaseOf(grade)];
  return sba * w + exam * (1 - w);
}

/** Mark for one term: SBA tasks blended with that term's examination by phase weighting. */
export function termMark(grade: number, assessments: AssessmentLite[], marks: Map<number, MarkLite>, term: number): number | null {
  const t = assessments.filter((a) => a.term === term);
  return blend(grade, weightedPct(t.filter((a) => a.kind !== "EXAM"), marks), weightedPct(t.filter((a) => a.kind === "EXAM"), marks));
}

/**
 * Year mark: all SBA/PAT tasks plus the mid-year and preparatory examinations (which form
 * part of SBA) make up the SBA component; the Term 4 examination is the final exam.
 * Until the final exam is written the year mark is provisional (SBA only).
 */
export function yearMark(grade: number, assessments: AssessmentLite[], marks: Map<number, MarkLite>): { pct: number | null; provisional: boolean } {
  const sbaPart = assessments.filter((a) => a.kind !== "EXAM" || a.term < 4);
  const finalExam = assessments.filter((a) => a.kind === "EXAM" && a.term === 4);
  const sba = weightedPct(sbaPart, marks);
  const exam = weightedPct(finalExam, marks);
  if (phaseOf(grade) === "Foundation") return { pct: sba, provisional: false };
  return { pct: blend(grade, sba, exam), provisional: exam == null };
}

export type SubjectResult = { name: string; category: string; pct: number | null };
export type PromotionCheck = { label: string; ok: boolean };
export type Promotion = { outcome: string; promoted: boolean; checks: PromotionCheck[] };

function countAtLeast(sortedDesc: number[], n: number, min: number, offset = 0) {
  return sortedDesc.length >= offset + n && sortedDesc.slice(offset, offset + n).every((p) => p >= min);
}

export function promotion(grade: number, results: SubjectResult[]): Promotion {
  const r = results.map((x) => ({ ...x, pct: x.pct == null ? 0 : Math.round(x.pct) }));
  const find = (...cats: string[]) => r.find((x) => cats.includes(x.category));
  const hl = find("HL"), fal = find("FAL"), math = find("MATH", "MLIT");
  const core = new Set([hl, fal, math].filter(Boolean));
  const others = r.filter((x) => !core.has(x)).map((x) => x.pct).sort((a, b) => b - a);
  const checks: PromotionCheck[] = [];
  const need = (label: string, s: { pct: number } | undefined, min: number) => s && checks.push({ label: `${label} at least ${min}% (${s.pct}%)`, ok: s.pct >= min });

  if (grade === 0) return { outcome: "Progressed to Grade 1", promoted: true, checks: [{ label: "Grade R learners progress with their age cohort", ok: true }] };

  const phase = phaseOf(grade);
  if (phase === "Foundation") {
    need("Home Language", hl, 50); need("Mathematics", math, 40); need("First Additional Language", fal, 40);
  } else if (phase === "Intermediate") {
    need("Home Language", hl, 50); need("First Additional Language", fal, 40); need("Mathematics", math, 40);
    checks.push({ label: "Any two other subjects at least 40%", ok: countAtLeast(others, 2, 40) });
  } else if (phase === "Senior") {
    need("Home Language", hl, 50); need("First Additional Language", fal, 40); need("Mathematics", math, 40);
    checks.push({ label: "Any three other subjects at least 40%", ok: countAtLeast(others, 3, 40) });
    checks.push({ label: "Any two further subjects at least 30%", ok: countAtLeast(others, 2, 30, 3) });
  } else {
    const rest = r.filter((x) => x !== hl).map((x) => x.pct).sort((a, b) => b - a);
    need("Home Language", hl, 40);
    checks.push({ label: "Two other subjects at least 40%", ok: countAtLeast(rest, 2, 40) });
    checks.push({ label: "Three further subjects at least 30%", ok: countAtLeast(rest, 3, 30, 2) });
  }

  const promoted = checks.every((c) => c.ok);
  if (grade < 12) return { outcome: promoted ? `Promoted to Grade ${grade + 1}` : "Not promoted", promoted, checks };

  // Grade 12: NSC pass types (designated-subject list simplified to all non-LO subjects).
  if (!promoted) return { outcome: "NSC not achieved", promoted, checks };
  const nonLo = r.filter((x) => x !== hl && x.category !== "LO").map((x) => x.pct).sort((a, b) => b - a);
  const lo = r.filter((x) => x !== hl && x.category === "LO").map((x) => x.pct);
  const tail = (n: number) => [...nonLo.slice(n), ...lo].sort((a, b) => b - a);
  if (countAtLeast(nonLo, 4, 50) && countAtLeast(tail(4), 2, 30)) return { outcome: "NSC - Bachelor's degree pass", promoted, checks };
  if (countAtLeast(nonLo, 4, 40) && countAtLeast(tail(4), 2, 30)) return { outcome: "NSC - Diploma pass", promoted, checks };
  return { outcome: "NSC - Higher Certificate pass", promoted, checks };
}
