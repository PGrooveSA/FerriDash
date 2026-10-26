import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { Card, PageHeader, StatusChip, StatCard } from "@/components/ui/kit";
import { Filters } from "@/components/ui/forms";
import { WorkflowButtons, PublishAll } from "../Workflow";
import { ClipboardCheck, FileClock, CheckCircle2, Globe } from "lucide-react";

export const metadata = { title: "Moderation" };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const year = ctx.school.current_year;
  const term = /^[1-4]$/.test(sp.term ?? "") ? Number(sp.term) : ctx.school.current_term;
  const statusFilter = sp.status ?? "";
  const rows = await all<{ csId: number; className: string; subject: string; teacher: string | null; status: string; learners: number; expected: number; captured: number; updated_at: string | null }>(`
    SELECT cs.id csId, c.name className, s.name subject,
      (SELECT COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = cs.teacher_id) teacher,
      COALESCE(r.status, 'draft') status, r.updated_at,
      (SELECT COUNT(*) FROM learners l WHERE l.class_id = c.id AND l.status = 'Active') learners,
      (SELECT COUNT(*) FROM assessments a WHERE a.class_subject_id = cs.id AND a.year = ?2 AND a.term = ?3) * (SELECT COUNT(*) FROM learners l WHERE l.class_id = c.id AND l.status = 'Active') expected,
      (SELECT COUNT(*) FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.class_subject_id = cs.id AND a.year = ?2 AND a.term = ?3) captured
    FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects s ON s.id = cs.subject_id
    LEFT JOIN result_sets r ON r.class_subject_id = cs.id AND r.year = ?2 AND r.term = ?3
    WHERE cs.school_id = ?1 AND c.year = ?2 AND (?4 = '' OR COALESCE(r.status, 'draft') = ?4) ORDER BY c.grade, c.name, s.name`, ctx.schoolId, year, term, statusFilter);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const all4 = statusFilter ? null : rows;

  return (
    <>
      <PageHeader title="Results moderation" subtitle={`Term ${term} · ${year}. Review captured marks, approve and publish to learners and parents.`}>
        <Filters filters={[
          { name: "term", label: "Term", value: term, options: [1, 2, 3, 4].map((t) => ({ value: t, label: `Term ${t}` })) },
          { name: "status", label: "Status", value: statusFilter, allLabel: "All statuses", options: ["draft", "submitted", "approved", "published"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
        ]} />
        <PublishAll term={term} count={count("approved")} />
      </PageHeader>
      {all4 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Draft" value={count("draft")} icon={FileClock} tone="sky" />
          <StatCard label="Awaiting moderation" value={count("submitted")} icon={ClipboardCheck} tone="butter" />
          <StatCard label="Approved" value={count("approved")} icon={CheckCircle2} tone="gold" />
          <StatCard label="Published" value={count("published")} icon={Globe} tone="green" />
        </div>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Class</th><th>Subject</th><th>Educator</th><th>Captured</th><th>Status</th><th>Updated</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.expected ? Math.round((r.captured / r.expected) * 100) : 0;
                return (
                  <tr key={r.csId}>
                    <td className="font-semibold">{r.className}</td>
                    <td><Link className="hover:underline" href={`/results?cs=${r.csId}&term=${term}`}>{r.subject}</Link></td>
                    <td>{r.teacher ?? <span className="muted">Unallocated</span>}</td>
                    <td className="min-w-[9rem]">
                      <div className="h-2 rounded-full bg-slate-500/15 overflow-hidden"><div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-400" : "bg-brand-400"}`} style={{ width: `${pct}%` }} /></div>
                      <p className="text-[0.7rem] muted mt-1">{r.captured}/{r.expected} marks ({pct}%)</p>
                    </td>
                    <td><StatusChip status={r.status} /></td>
                    <td className="text-xs muted">{r.updated_at ?? "-"}</td>
                    <td><div className="flex justify-end"><WorkflowButtons compact csId={r.csId} term={term} status={r.status as "draft"} isAdmin /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
