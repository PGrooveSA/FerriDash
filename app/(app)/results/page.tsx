import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { gradeLabel, fmtDate } from "@/lib/format";
import { phaseOf, SBA_WEIGHT, type MarkLite } from "@/lib/caps";
import { Card, PageHeader, Empty, StatusChip } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import { saveAssessment, deleteAssessment } from "@/app/actions/results";
import MarkGrid from "./MarkGrid";
import { WorkflowButtons } from "./Workflow";

export const metadata = { title: "Results · Mark entry" };

type CS = { id: number; className: string; grade: number; subject: string; teacher: string | null };
type A = { id: number; name: string; kind: "SBA" | "PAT" | "EXAM"; max_mark: number; weight: number; term: number; date: string | null };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  if (ctx.user.role === "learner" || ctx.user.role === "parent") redirect("/results/my");
  const sp = await searchParams;
  const year = ctx.school.current_year;
  const term = /^[1-4]$/.test(sp.term ?? "") ? Number(sp.term) : ctx.school.current_term;

  const options = all<CS>(`
    SELECT cs.id, c.name className, c.grade, s.name subject, (SELECT COALESCE(u.title || ' ', '') || u.last_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = cs.teacher_id) teacher
    FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects s ON s.id = cs.subject_id
    WHERE cs.school_id = ? AND c.year = ? ${ctx.isAdmin ? "" : "AND cs.teacher_id = ?"} ORDER BY c.grade, c.name, s.name`,
    ...(ctx.isAdmin ? [ctx.schoolId, year] : [ctx.schoolId, year, ctx.teacherId]));
  if (!options.length) return <Card><Empty title="No subjects allocated" hint="Ask your school admin to allocate you to a class and subject." /></Card>;

  const cs = options.find((o) => o.id === Number(sp.cs)) ?? options[0];
  const status = (get<{ status: string }>("SELECT status FROM result_sets WHERE class_subject_id = ? AND year = ? AND term = ?", cs.id, year, term)?.status ?? "draft") as "draft" | "submitted" | "approved" | "published";
  const locked = status === "published" || status === "approved" || (status === "submitted" && !ctx.isAdmin);
  const assessments = all<A>("SELECT id, name, kind, max_mark, weight, term, date FROM assessments WHERE class_subject_id = ? AND year = ? AND term = ? ORDER BY COALESCE(date, '9999'), id", cs.id, year, term);
  const learners = all<{ id: number; name: string; admission_number: string }>("SELECT l.id, l.first_name || ' ' || l.last_name name, l.admission_number FROM learners l WHERE l.class_id = (SELECT class_id FROM class_subjects WHERE id = ?) AND l.status = 'Active' ORDER BY l.last_name, l.first_name", cs.id);
  const marks: Record<string, MarkLite> = {};
  if (assessments.length) for (const m of all<{ learner_id: number; assessment_id: number; mark: number | null; absent: number }>(
    `SELECT learner_id, assessment_id, mark, absent FROM marks WHERE assessment_id IN (${assessments.map(() => "?").join(",")})`, ...assessments.map((a) => a.id))) marks[`${m.learner_id}:${m.assessment_id}`] = m;

  const phase = phaseOf(cs.grade);
  const aFields = (a?: A): Field[] => [
    { name: "name", label: "Assessment name", required: true, defaultValue: a?.name, placeholder: "e.g. Test 2, Research Project" },
    { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "SBA", label: "School-Based Assessment (SBA)" }, { value: "PAT", label: "Practical Assessment Task (PAT)" }, { value: "EXAM", label: "Examination" }], defaultValue: a?.kind ?? "SBA", half: true },
    { name: "date", label: "Date", type: "date", defaultValue: a?.date, half: true },
    { name: "max_mark", label: "Total marks", type: "number", required: true, defaultValue: a?.max_mark ?? 50, half: true },
    { name: "weight", label: "Weight within its type", type: "number", step: "0.1", defaultValue: a?.weight ?? 1, half: true, help: "1 = normal. Use 2 to count a task double." },
  ];

  return (
    <>
      <PageHeader title="Mark entry" subtitle={`${cs.className} · ${cs.subject} · ${gradeLabel(cs.grade)} (${phase} Phase)${cs.teacher ? ` · ${cs.teacher}` : ""}`}>
        <Filters filters={[
          { name: "cs", label: "Class & subject", value: cs.id, options: options.map((o) => ({ value: o.id, label: `${o.className} – ${o.subject}` })) },
          { name: "term", label: "Term", value: term, options: [1, 2, 3, 4].map((t) => ({ value: t, label: `Term ${t}` })) },
        ]} />
      </PageHeader>

      <div className="glass p-4 mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2"><span className="text-sm muted">Status</span><StatusChip status={status} /></div>
        <p className="text-xs muted flex-1 min-w-[16rem]">
          Term mark = SBA {Math.round(SBA_WEIGHT[phase] * 100)}%{SBA_WEIGHT[phase] < 1 ? ` + examinations ${Math.round((1 - SBA_WEIGHT[phase]) * 100)}%` : ""} ({phase} Phase). Workflow: Draft → Submitted → Approved → Published.
        </p>
        <WorkflowButtons csId={cs.id} term={term} status={status} isAdmin={ctx.isAdmin} />
      </div>

      <Card title={`Term ${term} assessments`} action={!locked && <FormDialog title="New assessment" triggerLabel="Add assessment" fields={aFields()} hidden={{ class_subject_id: cs.id, term }} action={saveAssessment} />}>
        {assessments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {assessments.map((a) => (
              <span key={a.id} className="glass-strong rounded-full pl-3 pr-1 py-1 text-xs flex items-center gap-2">
                <b>{a.name}</b> <span className="muted">{a.kind} · /{a.max_mark} · {fmtDate(a.date, { day: "numeric", month: "short" })}</span>
                {!locked && <><FormDialog trigger="edit" title={`Edit ${a.name}`} fields={aFields(a)} hidden={{ id: a.id, class_subject_id: cs.id, term }} action={saveAssessment} /><DeleteButton action={deleteAssessment.bind(null, a.id)} label={`${a.name} and all its marks`} /></>}
              </span>
            ))}
          </div>
        )}
        {assessments.length === 0 ? <Empty title="No assessments for this term" hint="Add the tasks and examinations from your assessment programme." />
          : learners.length === 0 ? <Empty title="No learners in this class" />
          : <MarkGrid key={`${cs.id}-${term}`} grade={cs.grade} term={term} assessments={assessments} learners={learners} initial={marks} locked={locked} />}
        {locked && <p className="text-xs muted mt-4">These marks are locked ({status}). {ctx.isAdmin ? "Return them to draft to allow changes." : "Contact school management if a correction is needed."}</p>}
      </Card>
      <p className="text-xs muted mt-4">Every mark change is recorded in the audit trail. <Link className="underline" href={`/reports/broadsheet?class=${get<{ class_id: number }>("SELECT class_id FROM class_subjects WHERE id = ?", cs.id)!.class_id}&term=${term}`}>Open class broadsheet</Link></p>
    </>
  );
}
