import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, GraduationCap, CalendarCheck, Users } from "lucide-react";
import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { avatarUrl, fmtDate, gradeLabel } from "@/lib/format";
import { learnerHistory, canViewLearner } from "@/lib/learner-record";
import { Card, PageHeader, StatusChip, LevelBadge, Empty } from "@/components/ui/kit";
import Avatar from "@/components/ui/Avatar";

export const metadata = { title: "Learner record" };

type Learner = {
  id: number; first_name: string; last_name: string; admission_number: string; id_number: string | null; gender: string | null;
  date_of_birth: string | null; home_language: string | null; address: string | null; status: string; enrolled_on: string | null;
  user_id: number | null; av: string | null; className: string | null; grade: number | null; classYear: number | null;
};

const OUTCOME_TONE: Record<string, string> = { promoted: "chip-green", repeated: "chip-butter", graduated: "chip-info", left: "chip-slate" };

/** Grade 12 learners who passed are "Matriculated"; older rows stored the NSC pass type as the note. */
function yearEndLabel(outcome: string, note: string | null) {
  if (outcome === "graduated") return note === "Completed Grade 12" ? note : "Matriculated";
  return note ?? outcome;
}

export default async function LearnerRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const id = Number((await params).id);
  if (!id || !(await canViewLearner(ctx, id))) notFound();
  const family = !!(await ownLearnerIds(ctx));
  const l = (await get<Learner>(`SELECT l.*, (SELECT avatar_updated_at FROM users WHERE id = l.user_id) av, c.name className, c.grade, c.year classYear
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE l.id = ?`, id))!;
  const guardians = await all<{ title: string | null; first_name: string; last_name: string; relationship: string; phone: string | null; email: string }>(
      "SELECT u.title, u.first_name, u.last_name, g.relationship, u.phone, u.email FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = ?", id);
  // Families only ever see published results; staff see everything.
  const history = await learnerHistory(ctx, id, family);
  const graduated = history.find((h) => h.outcome === "graduated");
  const siblings = family ? (await all<{ id: number; name: string }>(`SELECT id, first_name || ' ' || last_name name FROM learners WHERE id IN (${((await ownLearnerIds(ctx)) ?? []).map(() => "?").join(",") || "NULL"})`, ...((await ownLearnerIds(ctx)) ?? []))) : [];

  const placement = l.status === "Active"
    ? (l.className ? `${gradeLabel(l.grade!)} · Class ${l.className} (${l.classYear})` : "No class")
    : graduated ? `Graduated ${graduated.year}` : l.status;

  return (
    <>
      <PageHeader title="Learner record" subtitle="Personal details and full academic history, kept after the learner moves on, graduates or leaves.">
        {siblings.length > 1 && <div className="flex gap-2">{siblings.map((s) => <Link key={s.id} href={`/learners/${s.id}`} className={`btn btn-sm ${s.id === id ? "btn-primary" : "btn-ghost"}`}>{s.name}</Link>)}</div>}
        {!family && <Link href="/learners" className="btn btn-ghost">All learners</Link>}
      </PageHeader>

      <div className="grid grid-cols-1 xl:grid-cols-[22rem_1fr] gap-6">
        <div className="space-y-6">
          <Card>
            <div className="text-center">
              <div className="inline-block"><Avatar first={l.first_name} last={l.last_name} size={104} photo={avatarUrl(l.user_id, l.av)} /></div>
              <h2 className="text-xl font-semibold mt-3">{l.first_name} {l.last_name}</h2>
              <p className="text-sm muted font-mono">{l.admission_number}</p>
              <div className="flex justify-center gap-2 mt-2"><StatusChip status={l.status} /></div>
              <p className="text-sm mt-2">{placement}</p>
            </div>
            <dl className="text-sm mt-6 space-y-2.5">
              {[["ID number", l.id_number], ["Date of birth", fmtDate(l.date_of_birth)], ["Gender", l.gender], ["Home language", l.home_language], ["First enrolled", fmtDate(l.enrolled_on)], ["Address", l.address]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="muted">{k}</dt><dd className="text-right">{v || "-"}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title={<span className="flex items-center gap-2"><Users className="w-4 h-4" />Parents / guardians</span>}>
            {guardians.length ? (
              <ul className="space-y-3 text-sm">{guardians.map((g, i) => (
                <li key={i}><p className="font-medium">{g.title ? `${g.title} ` : ""}{g.first_name} {g.last_name} <span className="muted font-normal">· {g.relationship}</span></p><p className="text-xs muted">{g.phone ?? ""}{g.phone ? " · " : ""}{g.email}</p></li>
              ))}</ul>
            ) : <p className="text-sm muted">None linked.</p>}
          </Card>
        </div>

        <Card title={<span className="flex items-center gap-2"><GraduationCap className="w-5 h-5" />Academic history</span>}>
          {history.length === 0 ? <Empty title="No class history yet" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Year</th><th>Grade · class</th><th>Year average</th><th>CAPS result</th><th>Year-end</th><th>Attendance</th><th className="text-right">Report card</th></tr></thead>
                <tbody>{history.map((h) => (
                  <tr key={h.year}>
                    <td className="font-semibold">{h.year}{h.current && <span className="chip chip-info ml-2">current</span>}</td>
                    <td>{gradeLabel(h.grade)} · {h.className}</td>
                    <td>{h.average != null ? <>{h.average}% <LevelBadge pct={h.average} /></> : <span className="muted">-</span>}</td>
                    <td className="text-sm">{h.result ? <>{h.result}{h.provisional && <span className="chip chip-slate ml-1">provisional</span>}</> : <span className="muted">{family ? "Not published" : "-"}</span>}</td>
                    <td>{h.outcome ? <span className={`chip ${OUTCOME_TONE[h.outcome] ?? "chip-slate"}`} title={h.note ?? ""}>{yearEndLabel(h.outcome, h.note)}</span> : <span className="muted text-sm">In progress</span>}</td>
                    <td className="text-sm">{h.attendanceRate != null ? <span className="flex items-center gap-1"><CalendarCheck className="w-3.5 h-3.5" />{h.attendanceRate}% <span className="muted">({h.daysRecorded} days)</span></span> : <span className="muted">-</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      {[1, 2, 3, 4].map((t) => <Link key={t} href={`/reports/report-cards?year=${h.year}&learner=${id}&term=${t}`} className="text-xs muted hover:text-[var(--ink)] hover:underline mr-2">T{t}</Link>)}
                      <Link href={`/reports/report-cards?year=${h.year}&learner=${id}&term=year`} className="btn btn-ghost btn-sm"><FileText className="w-3.5 h-3.5" />Final</Link>
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs muted mt-3">Records are kept permanently after year-end, including for learners who graduated, transferred or left.{family ? " Only published results are shown." : ""}</p>
        </Card>
      </div>
    </>
  );
}
