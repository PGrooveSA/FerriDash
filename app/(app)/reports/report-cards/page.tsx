import Link from "next/link";
import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { gradeLabel } from "@/lib/format";
import { parsePeriod, periodLabel } from "@/lib/results";
import { reportCards } from "@/lib/report-data";
import { Card, PageHeader, Empty, LevelBadge } from "@/components/ui/kit";
import { Filters, PdfButtons, FormDialog } from "@/components/ui/forms";
import ReportCard from "@/components/ReportCard";
import { saveComment } from "@/app/actions/results";

export const metadata = { title: "Report cards" };

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const family = ctx.user.role === "learner" || ctx.user.role === "parent";
  const year = ctx.school.current_year;
  const period = parsePeriod(sp.term, Math.max(1, ctx.school.current_term - 1));
  const periodFilter = { name: "term", label: "Period", value: String(period), options: [...[1, 2, 3, 4].map((t) => ({ value: String(t), label: `Term ${t}` })), { value: "year", label: "Final (year)" }] };

  // ---- Learners and parents: own report cards, published results only ----
  if (family) {
    const ids = ownLearnerIds(ctx) ?? [];
    const learnerId = ids.includes(Number(sp.learner)) ? Number(sp.learner) : ids[0];
    if (!learnerId) return <Card><Empty title="No learner linked" /></Card>;
    const kids = all<{ id: number; name: string }>(`SELECT id, first_name || ' ' || last_name name FROM learners WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
    const classId = get<{ class_id: number }>("SELECT class_id FROM learners WHERE id = ?", learnerId)!.class_id;
    const data = reportCards(ctx, classId, period, [learnerId], true);
    const card = data?.cards[0];
    const has = card && Object.values(card.row.pct).some((v) => v != null);
    return (
      <>
        <div className="no-print"><PageHeader title="Report card" subtitle={periodLabel(period)}>
          <Filters filters={[...(kids.length > 1 ? [{ name: "learner", label: "Child", value: learnerId, options: kids.map((k) => ({ value: k.id, label: k.name })) }] : []), periodFilter]} />
          {has && <PdfButtons filename={`Report card - ${card!.row.first_name} ${card!.row.last_name} - ${periodLabel(period)} ${ctx.school.current_year}`} />}
        </PageHeader></div>
        {has ? <ReportCard d={card!} /> : <Card><Empty title={`The ${periodLabel(period)} report has not been published yet`} /></Card>}
      </>
    );
  }

  // ---- Staff ----
  const classes = ctx.isAdmin
    ? all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, year)
    : all<{ id: number; name: string; grade: number }>("SELECT DISTINCT c.id, c.name, c.grade FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.year = ?2 AND (cs.teacher_id = ?1 OR c.class_teacher_id = ?1) ORDER BY c.grade, c.name", ctx.teacherId, year);
  const requestedLearner = Number(sp.learner) || 0;
  const learnerClass = requestedLearner ? get<{ class_id: number }>("SELECT class_id FROM learners WHERE id = ? AND school_id = ?", requestedLearner, ctx.schoolId)?.class_id : undefined;
  const classId = learnerClass ?? classes.find((c) => c.id === Number(sp.class))?.id ?? classes[0]?.id;
  if (!classId || !classes.some((c) => c.id === classId)) return <Card><Empty title="No classes available" /></Card>;
  const isClassTeacher = !!get("SELECT id FROM classes WHERE id = ? AND class_teacher_id = ?", classId, ctx.teacherId ?? -1);
  const mode = requestedLearner ? "one" : sp.all ? "all" : "list";
  const data = reportCards(ctx, classId, period, mode === "one" ? [requestedLearner] : null, false)!;
  const commentTerm = period === "year" ? 4 : period;

  const editor = (learnerId: number, c: { class_teacher_comment: string | null; principal_comment: string | null } | null) => (ctx.isAdmin || isClassTeacher) && (
    <FormDialog trigger="button" triggerLabel="Edit comments" title="Report comments" action={saveComment} hidden={{ learner_id: learnerId, term: commentTerm }}
      fields={[{ name: "class_teacher_comment", label: "Class teacher's comment", type: "textarea", defaultValue: c?.class_teacher_comment }, ...(ctx.isAdmin ? [{ name: "principal_comment", label: "Principal's comment", type: "textarea" as const, defaultValue: c?.principal_comment }] : [])]} />
  );

  return (
    <>
      <div className="no-print"><PageHeader title="Report cards" subtitle={`${data.cr.className} · ${gradeLabel(data.cr.grade)} · ${periodLabel(period)}`}>
        <Filters filters={[{ name: "class", label: "Class", value: classId, options: classes.map((c) => ({ value: c.id, label: c.name })) }, periodFilter]} />
        {mode === "list" && <Link href={`/reports/report-cards?class=${classId}&term=${period}&all=1`} className="btn btn-primary">Print whole class</Link>}
        {mode !== "list" && <><Link href={`/reports/report-cards?class=${classId}&term=${period}`} className="btn btn-ghost no-print">Back to list</Link><PdfButtons filename={mode === "one" && data.cards[0] ? `Report card - ${data.cards[0].row.first_name} ${data.cards[0].row.last_name} - ${periodLabel(period)} ${ctx.school.current_year}` : `Report cards - ${data.cr.className} - ${periodLabel(period)} ${ctx.school.current_year}`} /></>}
      </PageHeader></div>
      {data.cards.some((c) => c.draft) && <p className="no-print glass p-3 mb-4 text-sm">Some subjects are not yet published for this period, so these reports are marked <b>DRAFT</b>. Learners and parents only see published results.</p>}

      {mode === "list" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Pos.</th><th>Learner</th><th>Average</th><th>Outcome</th><th className="text-right">Report</th></tr></thead>
              <tbody>{[...data.cards].sort((a, b) => (a.row.position ?? 999) - (b.row.position ?? 999)).map((c) => (
                <tr key={c.row.id}>
                  <td className="font-semibold">{c.row.position ?? "-"}</td>
                  <td><p className="font-medium">{c.row.first_name} {c.row.last_name}</p><p className="text-xs muted font-mono">{c.row.admission_number}</p></td>
                  <td>{c.row.average ?? "-"}% <LevelBadge pct={c.row.average} /></td>
                  <td className="text-sm">{c.row.promotion ? <span className={c.row.promotion.promoted ? "text-emerald-600" : "text-rose-600"}>{c.row.promotion.outcome}</span> : <span className="muted">Term report</span>}</td>
                  <td className="text-right"><Link className="btn btn-ghost btn-sm" href={`/reports/report-cards?learner=${c.row.id}&term=${period}`}>Open</Link></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {data.cards.map((c) => <div key={c.row.id} className="page-break"><ReportCard d={c} editor={editor(c.row.id, c.comments)} /></div>)}
        </div>
      )}
    </>
  );
}
