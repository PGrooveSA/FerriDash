import { requireCtx } from "@/lib/auth";
import { gradeLabel } from "@/lib/format";
import { phaseOf } from "@/lib/caps";
import { classResults } from "@/lib/results";
import { staffClasses } from "@/lib/staff-classes";
import { Card, PageHeader, Empty, StatCard } from "@/components/ui/kit";
import { Filters, PrintButton, CsvButton } from "@/components/ui/forms";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export const metadata = { title: "Promotion schedule" };

const RULES: Record<string, string> = {
  Foundation: "Home Language 50%, Mathematics 40%, First Additional Language 40%.",
  Intermediate: "Home Language 50%, First Additional Language 40%, Mathematics 40%, any two other subjects 40%.",
  Senior: "Home Language 50%, First Additional Language 40%, Mathematics 40%, three other subjects 40% and two further subjects 30%.",
  FET: "Home Language 40%, two other subjects 40% and three further subjects 30%. Grade 12 also shows Higher Certificate, Diploma or Bachelor's pass.",
};

export default async function PromotionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "teacher"]);
  const sp = await searchParams;
  const classes = staffClasses(ctx);
  const classId = classes.find((c) => c.id === Number(sp.class))?.id ?? classes[0]?.id;
  if (!classId) return <Card><Empty title="No classes" /></Card>;
  const cr = classResults(ctx.schoolId, classId, ctx.school.current_year, "year")!;
  const rows = [...cr.learners].sort((a, b) => a.last_name.localeCompare(b.last_name));
  const promoted = rows.filter((r) => r.promotion?.promoted).length, notPromoted = rows.filter((r) => r.promotion && !r.promotion.promoted).length;
  const provisional = rows.some((r) => r.provisional);

  const csv = [
    [`${ctx.school.name} - Schedule of promotion ${cr.className} ${cr.year}`],
    ["Admission no.", "Surname", "Name", ...cr.subjects.map((s) => s.name), "Average", "Outcome", "Requirements not met"],
    ...rows.map((r) => [r.admission_number, r.last_name, r.first_name, ...cr.subjects.map((s) => r.pct[s.csId]), r.average, r.promotion?.outcome ?? "", r.promotion?.checks.filter((c) => !c.ok).map((c) => c.label).join("; ") ?? ""]),
  ];

  return (
    <>
      <PageHeader title="Schedule of promotion" subtitle={`${cr.className} · ${gradeLabel(cr.grade)} · ${phaseOf(cr.grade)} Phase · ${cr.year}`}>
        <Filters filters={[{ name: "class", label: "Class", value: classId, options: classes.map((c) => ({ value: c.id, label: c.name })) }]} />
        <CsvButton filename={`promotion-${cr.className}-${cr.year}.csv`} rows={csv} />
        <PrintButton label="Print" />
      </PageHeader>
      {provisional && <div className="glass p-4 mb-5 text-sm flex items-center gap-3"><Clock className="w-5 h-5 text-butter-500" /> Final examination marks are not captured yet, so these outcomes are <b>provisional</b> (based on SBA and earlier examinations).</div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 no-print">
        <StatCard label={cr.grade === 12 ? "NSC achieved" : "Promoted"} value={promoted} icon={CheckCircle2} tone="green" hint={rows.length ? `${Math.round((promoted / rows.length) * 100)}% of class` : undefined} />
        <StatCard label="Not meeting requirements" value={notPromoted} icon={XCircle} tone="gold" />
        <StatCard label="Phase requirements" value={phaseOf(cr.grade)} tone="butter" hint={RULES[phaseOf(cr.grade)]} />
      </div>
      <Card className="print-area">
        <div className="overflow-x-auto">
          <table className="table !text-xs">
            <thead><tr><th>Learner</th>{cr.subjects.map((s) => <th key={s.csId} className="text-center !whitespace-normal" title={s.name}>{s.code ?? s.name.slice(0, 5)}</th>)}<th className="text-center">Avg</th><th>Outcome</th><th>Requirements not met</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><p className="font-medium">{r.last_name}, {r.first_name}</p><p className="muted font-mono">{r.admission_number}</p></td>
                {cr.subjects.map((s) => <td key={s.csId} className={`text-center ${(r.pct[s.csId] ?? 100) < 40 ? "text-rose-600 font-semibold" : ""}`}>{r.pct[s.csId] ?? "-"}</td>)}
                <td className="text-center font-bold">{r.average ?? "-"}</td>
                <td className={`font-semibold ${r.promotion?.promoted ? "text-emerald-600" : "text-rose-600"}`}>{r.promotion?.outcome ?? "Incomplete marks"}</td>
                <td className="max-w-[18rem]">{r.promotion?.checks.filter((c) => !c.ok).map((c) => c.label).join("; ") || <span className="muted">—</span>}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
        <p className="text-xs muted mt-3">Requirements: {RULES[phaseOf(cr.grade)]} Based on the National Policy pertaining to Programme and Promotion Requirements; verify against the latest DBE circulars and apply condonation or progression policy where applicable.</p>
      </Card>
    </>
  );
}
