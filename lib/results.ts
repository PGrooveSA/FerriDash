import { all, get } from "./db";
import { capsLevel, promotion, termMark, yearMark, type AssessmentLite, type MarkLite, type Promotion } from "./caps";

export type Period = number | "year"; // 1-4 or full year

export type ClassSubject = { csId: number; subjectId: number; name: string; code: string | null; category: string; teacher: string | null; status: string };
export type LearnerRow = {
  id: number; first_name: string; last_name: string; admission_number: string; gender: string;
  pct: Record<number, number | null>; average: number | null; position: number | null; provisional: boolean; promotion: Promotion | null;
};
export type ClassResults = { classId: number; className: string; grade: number; year: number; period: Period; subjects: ClassSubject[]; learners: LearnerRow[] };

export function classResults(schoolId: number, classId: number, year: number, period: Period, opts: { publishedOnly?: boolean; learnerIds?: number[] } = {}): ClassResults | null {
  const cls = get<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE id = ? AND school_id = ?", classId, schoolId);
  if (!cls) return null;

  const subjects = all<ClassSubject>(`
    SELECT cs.id AS csId, s.id AS subjectId, s.name, s.code, s.category,
           (SELECT COALESCE(u.title || ' ', '') || u.last_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = cs.teacher_id) AS teacher,
           COALESCE((SELECT status FROM result_sets r WHERE r.class_subject_id = cs.id AND r.year = ? AND r.term = ?), 'draft') AS status
    FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id
    WHERE cs.class_id = ? ORDER BY CASE s.category WHEN 'HL' THEN 1 WHEN 'FAL' THEN 2 WHEN 'SAL' THEN 3 WHEN 'MATH' THEN 4 WHEN 'MLIT' THEN 4 ELSE 5 END, CASE WHEN s.category = 'LO' THEN 1 ELSE 0 END, s.name`,
    year, period === "year" ? 4 : period, classId);

  const published = new Set(
    all<{ class_subject_id: number; term: number }>(`SELECT class_subject_id, term FROM result_sets WHERE status = 'published' AND year = ? AND class_subject_id IN (SELECT id FROM class_subjects WHERE class_id = ?)`, year, classId)
      .map((r) => `${r.class_subject_id}:${r.term}`));

  const assessments = all<AssessmentLite & { class_subject_id: number }>(`SELECT id, class_subject_id, term, kind, max_mark, weight FROM assessments WHERE year = ? AND class_subject_id IN (SELECT id FROM class_subjects WHERE class_id = ?)`, year, classId)
    .filter((a) => !opts.publishedOnly || published.has(`${a.class_subject_id}:${a.term}`));

  const learners = all<Omit<LearnerRow, "pct" | "average" | "position" | "provisional" | "promotion">>(`SELECT id, first_name, last_name, admission_number, gender FROM learners WHERE class_id = ? AND status = 'Active' ORDER BY last_name, first_name`, classId);

  const marks = new Map<number, Map<number, MarkLite>>(); // learner -> assessment -> mark
  for (const m of all<{ learner_id: number; assessment_id: number; mark: number | null; absent: number }>(
    `SELECT m.learner_id, m.assessment_id, m.mark, m.absent FROM marks m JOIN assessments a ON a.id = m.assessment_id
     WHERE a.year = ? AND a.class_subject_id IN (SELECT id FROM class_subjects WHERE class_id = ?)`, year, classId)) {
    if (!marks.has(m.learner_id)) marks.set(m.learner_id, new Map());
    marks.get(m.learner_id)!.set(m.assessment_id, m);
  }

  const byCs = new Map<number, AssessmentLite[]>();
  for (const a of assessments) {
    if (!byCs.has(a.class_subject_id)) byCs.set(a.class_subject_id, []);
    byCs.get(a.class_subject_id)!.push(a);
  }

  const rows: LearnerRow[] = learners.map((l) => {
    const lm = marks.get(l.id) ?? new Map();
    const pct: Record<number, number | null> = {};
    let provisional = false;
    for (const s of subjects) {
      const list = byCs.get(s.csId) ?? [];
      if (period === "year") {
        const y = yearMark(cls.grade, list, lm);
        pct[s.csId] = y.pct == null ? null : Math.round(y.pct);
        provisional ||= y.provisional && y.pct != null;
      } else {
        const t = termMark(cls.grade, list, lm, period);
        pct[s.csId] = t == null ? null : Math.round(t);
      }
    }
    const vals = Object.values(pct).filter((v): v is number => v != null);
    const average = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    const promo = period === "year" || period === 4
      ? (vals.length === subjects.length && vals.length > 0 ? promotion(cls.grade, subjects.map((s) => ({ name: s.name, category: s.category, pct: pct[s.csId] }))) : null)
      : null;
    return { ...l, pct, average, position: null, provisional, promotion: promo };
  });

  const ranked = [...rows].filter((r) => r.average != null).sort((a, b) => b.average! - a.average!);
  ranked.forEach((r, i) => { r.position = i > 0 && ranked[i - 1].average === r.average ? ranked[i - 1].position : i + 1; });

  return {
    classId: cls.id, className: cls.name, grade: cls.grade, year, period, subjects,
    learners: opts.learnerIds ? rows.filter((r) => opts.learnerIds!.includes(r.id)) : rows,
  };
}

export function subjectStats(cr: ClassResults) {
  return cr.subjects.map((s) => {
    const vals = cr.learners.map((l) => l.pct[s.csId]).filter((v): v is number => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return {
      ...s, average: avg == null ? null : Math.round(avg), count: vals.length,
      passRate: vals.length ? Math.round((vals.filter((v) => v >= (s.category === "HL" ? 50 : 40)).length / vals.length) * 100) : null,
      levels: [1, 2, 3, 4, 5, 6, 7].map((lv) => vals.filter((v) => capsLevel(v)!.level === lv).length),
    };
  });
}

/** Attendance summary between two dates for one learner. */
export function attendanceSummary(learnerId: number, from: string, to: string) {
  const r = get<{ total: number; present: number; absent: number; late: number; excused: number }>(`
    SELECT COUNT(*) total, SUM(status='P') present, SUM(status='A') absent, SUM(status='L') late, SUM(status='E') excused
    FROM attendance WHERE learner_id = ? AND date BETWEEN ? AND ?`, learnerId, from, to)!;
  const attended = (r.present ?? 0) + (r.late ?? 0);
  return { ...r, rate: r.total ? Math.round((attended / r.total) * 100) : null };
}

export function termDates(schoolId: number, year: number, term: Period) {
  if (term === "year") {
    const r = get<{ a: string; b: string }>("SELECT MIN(start_date) a, MAX(end_date) b FROM terms WHERE school_id = ? AND year = ?", schoolId, year);
    return { start: r?.a ?? `${year}-01-01`, end: r?.b ?? `${year}-12-31` };
  }
  const r = get<{ start_date: string; end_date: string }>("SELECT start_date, end_date FROM terms WHERE school_id = ? AND year = ? AND number = ?", schoolId, year, term);
  return { start: r?.start_date ?? `${year}-01-01`, end: r?.end_date ?? `${year}-12-31` };
}

export const periodLabel = (p: Period) => (p === "year" ? "Final (Year)" : `Term ${p}`);
export const parsePeriod = (v: string | undefined, fallback: number): Period => (v === "year" ? "year" : v && /^[1-4]$/.test(v) ? Number(v) : fallback);
