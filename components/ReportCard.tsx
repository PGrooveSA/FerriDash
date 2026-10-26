import { CAPS_LEVELS, capsLevel, phaseOf, promotion, type Promotion } from "@/lib/caps";
import { fmtDate, gradeLabel, logoUrl } from "@/lib/format";
import { today } from "@/lib/today";
import type { School } from "@/lib/auth";
import type { ClassResults, LearnerRow, Period } from "@/lib/results";
import { periodLabel } from "@/lib/results";
import { BrandMark } from "@/components/BrandLogo";

export type ReportCardData = {
  school: School; cr: ClassResults; row: LearnerRow; period: Period;
  learner: { id_number: string | null; date_of_birth: string | null; classTeacher: string | null };
  attendance: { total: number; present: number; absent: number; late: number; excused: number; rate: number | null };
  comments: { class_teacher_comment: string | null; principal_comment: string | null } | null;
  draft: boolean;
};

/**
 * The headline result. Term 4 and final reports use the CAPS year result (promotion). Term 1-3 reports
 * apply the same CAPS pass requirements to that term's marks, as an early indication.
 */
function overallResult(d: ReportCardData): { status: "passed" | "failed" | "incomplete"; detail: string; basis: string; promo: Promotion | null } {
  const { cr, row, period } = d;
  if (row.promotion) {
    const p = row.promotion;
    return {
      status: p.promoted ? "passed" : "failed",
      detail: p.promoted ? p.outcome : cr.grade === 12 ? "NSC not achieved" : `Not promoted · repeats ${gradeLabel(cr.grade)}`,
      basis: row.provisional ? "Provisional: based on the year mark, until the final examination marks are published" : "Based on the year mark: school-based assessment across all terms plus the final examination",
      promo: p,
    };
  }
  const all = cr.subjects.map((s) => ({ name: s.name, category: s.category, pct: row.pct[s.csId] }));
  if (!all.length || all.some((x) => x.pct == null)) {
    return { status: "incomplete", detail: "Not all subjects have marks yet", basis: period === "year" || period === 4 ? "The final result is shown once every subject has a year mark" : `The ${periodLabel(period)} result is shown once every subject has a mark`, promo: null };
  }
  const p = promotion(cr.grade, all.map((x) => ({ ...x, pct: x.pct as number })));
  return {
    status: p.promoted ? "passed" : "failed",
    detail: p.promoted ? `Meets the CAPS pass requirements for ${periodLabel(period)}` : `Below the CAPS pass requirements for ${periodLabel(period)}`,
    basis: `Based on ${periodLabel(period)} marks only. Promotion is decided on the year mark at the end of the year`,
    promo: p,
  };
}

const RESULT_STYLE = {
  passed: { word: "PASSED", box: "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", mark: "✓" },
  failed: { word: "FAILED", box: "border-rose-500 bg-rose-50 dark:bg-rose-500/10", text: "text-rose-700 dark:text-rose-400", mark: "✗" },
  incomplete: { word: "INCOMPLETE", box: "border-amber-400 bg-amber-50 dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", mark: "…" },
} as const;

export default function ReportCard({ d, editor }: { d: ReportCardData; editor?: React.ReactNode }) {
  const { school, cr, row, period } = d;
  const result = overallResult(d);
  const rs = RESULT_STYLE[result.status];
  const classAvg = (csId: number) => {
    const v = cr.learners.map((l) => l.pct[csId]).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  return (
    <article className="rc-page glass-solid print-area w-full max-w-[210mm] mx-auto p-6 sm:p-8 relative overflow-hidden text-[0.9rem]">
      {d.draft && <div className="absolute inset-0 grid place-items-center pointer-events-none"><span className="text-7xl font-black text-rose-500/10 -rotate-12 select-none">DRAFT</span></div>}
      <header className="flex flex-wrap items-start gap-4 pb-4 border-b-2 border-brand-300">
        <img src={logoUrl(school.id, school.logo_updated_at) ?? "/icon.svg"} alt="" className="w-16 h-16 object-contain" />
        <div className="flex-1 min-w-[14rem]">
          <h2 className="text-xl font-bold tracking-tight">{school.name}</h2>
          <p className="text-xs muted">{school.address} · {school.phone} · EMIS {school.emis_number}</p>
          {school.motto && <p className="text-xs italic mt-0.5">“{school.motto}”</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest muted">Learner Progress Report</p>
          <p className="font-bold text-lg">{periodLabel(period)} · {cr.year}</p>
          <p className="text-xs muted">{school.province} Department of Education</p>
        </div>
      </header>

      <section className="rc-grid grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 py-4 text-sm">
        <div><p className="text-xs muted">Learner</p><p className="font-semibold">{row.first_name} {row.last_name}</p></div>
        <div><p className="text-xs muted">Admission no.</p><p className="font-mono">{row.admission_number}</p></div>
        <div><p className="text-xs muted">Grade / class</p><p>{gradeLabel(cr.grade)} · {cr.className}</p></div>
        <div><p className="text-xs muted">Phase</p><p>{phaseOf(cr.grade)}</p></div>
        <div><p className="text-xs muted">ID number</p><p className="font-mono">{d.learner.id_number ?? "-"}</p></div>
        <div><p className="text-xs muted">Date of birth</p><p>{fmtDate(d.learner.date_of_birth)}</p></div>
        <div><p className="text-xs muted">Class teacher</p><p>{d.learner.classTeacher ?? "-"}</p></div>
        <div><p className="text-xs muted">Date issued</p><p>{fmtDate(today())}</p></div>
      </section>

      {/* The result, stated plainly: PASSED or FAILED (or INCOMPLETE while marks are missing). */}
      <section className={`rc-result mb-4 rounded-2xl border-2 px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 ${rs.box}`} aria-label={`Result: ${rs.word}`}>
        <p className="text-xs uppercase tracking-widest muted">{period === "year" || period === 4 ? "Final result" : `${periodLabel(period)} result`}</p>
        <p className={`rc-result-word text-3xl font-black tracking-wide ${rs.text}`}>{rs.mark} {rs.word}</p>
        <div className="min-w-[12rem] flex-1">
          <p className="font-semibold">{result.detail}</p>
          <p className="text-xs muted">{result.basis}.</p>
        </div>
      </section>

      <table className="table rc-table !text-sm">
        <thead><tr><th>Subject</th><th className="text-center">Mark %</th><th className="text-center">Level</th><th>Achievement descriptor</th><th className="text-center">Class avg</th></tr></thead>
        <tbody>
          {cr.subjects.map((s) => {
            const v = row.pct[s.csId], lv = capsLevel(v);
            return (
              <tr key={s.csId}>
                <td className="font-medium">{s.name}</td>
                <td className={`text-center font-semibold ${v != null && v < 40 ? "text-rose-600" : ""}`}>{v ?? "-"}</td>
                <td className="text-center font-bold">{lv?.level ?? "-"}</td>
                <td>{lv?.descriptor ?? "-"}</td>
                <td className="text-center muted">{classAvg(s.csId) ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="rc-grid rc-summary grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-2xl bg-brand-100/60 dark:bg-brand-500/10 p-3"><p className="text-xs muted">Average</p><p className="text-xl font-bold">{row.average ?? "-"}%</p></div>
        <div className="rounded-2xl bg-gold-100/60 dark:bg-gold-500/10 p-3"><p className="text-xs muted">Position in class</p><p className="text-xl font-bold">{row.position ?? "-"} <span className="text-sm font-normal muted">/ {cr.learners.length}</span></p></div>
        <div className="rounded-2xl bg-emerald-100/60 dark:bg-emerald-500/10 p-3"><p className="text-xs muted">Attendance</p><p className="text-xl font-bold">{d.attendance.rate ?? "-"}%</p></div>
      </section>

      {result.promo && (
        <section className={`rc-box mt-4 rounded-2xl p-4 border ${result.promo.promoted ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-500/10" : "border-rose-300 bg-rose-50/60 dark:bg-rose-500/10"}`}>
          <p className="font-semibold">CAPS pass requirements{row.promotion ? ` · ${row.provisional ? "provisional outcome" : "outcome"}: ${row.promotion.outcome}` : ` · ${periodLabel(period)}`}</p>
          <ul className="text-xs mt-1 grid sm:grid-cols-2 gap-x-4">{result.promo.checks.map((c, i) => <li key={i}>{c.ok ? "✓" : "✗"} {c.label}</li>)}</ul>
          {cr.grade === 12 && row.promotion && <p className="text-xs muted mt-1">The official NSC result is issued by the Department of Basic Education.</p>}
        </section>
      )}

      <section className="rc-grid rc-comments grid sm:grid-cols-2 gap-4 mt-4 text-sm">
        <div><p className="text-xs muted mb-1">Class teacher&apos;s comment</p><p className="min-h-[2.5rem]">{d.comments?.class_teacher_comment ?? "—"}</p></div>
        <div><p className="text-xs muted mb-1">Principal&apos;s comment</p><p className="min-h-[2.5rem]">{d.comments?.principal_comment ?? "—"}</p></div>
      </section>
      {editor && <div className="no-print mt-3">{editor}</div>}

      <section className="grid grid-cols-3 gap-6 mt-8 text-xs">
        {["Class teacher", "Principal", "Parent / guardian"].map((s) => <div key={s}><div className="border-b border-current/40 h-8" /><p className="muted mt-1">{s}</p></div>)}
      </section>

      <p className="mt-6 pt-3 border-t border-line text-[0.68rem] muted flex flex-wrap gap-x-3 gap-y-1">
        <span className="font-semibold">CAPS scale:</span>
        {CAPS_LEVELS.map((l) => <span key={l.level}>{l.level} = {l.min}–{l.max}% {l.short}</span>)}
      </p>

      {/* Bottom of every printed page (see .rc-page in globals.css). */}
      <footer className="rc-footer mt-4 pt-2 border-t border-line text-[0.68rem] muted flex items-center justify-center gap-1">
        <BrandMark />Generated by FerriDash · Copyright © Infinite Q Graphics
      </footer>
    </article>
  );
}
