import { requireCtx } from "@/lib/auth";
import { gradeLabel } from "@/lib/format";
import { capsLevel } from "@/lib/caps";
import { classResults, subjectStats, parsePeriod, periodLabel } from "@/lib/results";
import { staffClasses } from "@/lib/staff-classes";
import { Card, PageHeader, Empty } from "@/components/ui/kit";
import { Filters, PrintButton, CsvButton } from "@/components/ui/forms";

export const metadata = { title: "Broadsheet" };

const cellTone = (v: number | null) => { const l = capsLevel(v)?.level ?? 0; return l >= 6 ? "bg-emerald-400/15" : l >= 4 ? "" : l === 3 ? "bg-butter-300/25" : l ? "bg-rose-400/20 text-rose-700 dark:text-rose-300" : ""; };

export default async function BroadsheetPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "teacher"]);
  const sp = await searchParams;
  const classes = await staffClasses(ctx);
  const classId = classes.find((c) => c.id === Number(sp.class))?.id ?? classes[0]?.id;
  if (!classId) return <Card><Empty title="No classes" /></Card>;
  const period = parsePeriod(sp.term, Math.max(1, ctx.school.current_term - 1));
  const cr = (await classResults(ctx.schoolId, classId, ctx.school.current_year, period))!;
  const stats = subjectStats(cr);
  const sorted = [...cr.learners].sort((a, b) => a.last_name.localeCompare(b.last_name));
  const short = (n: string) => n.replace(" Home Language", " HL").replace(" First Additional Language", " FAL");
  const showOutcome = period === "year" || period === 4;

  const csv: (string | number | null)[][] = [
    [`${ctx.school.name} - Broadsheet ${cr.className} ${periodLabel(period)} ${cr.year}`],
    ["Admission no.", "Surname", "Name", "Gender", ...cr.subjects.map((s) => s.name), "Average", "Position", ...(showOutcome ? ["Outcome"] : [])],
    ...sorted.map((l) => [l.admission_number, l.last_name, l.first_name, l.gender, ...cr.subjects.map((s) => l.pct[s.csId]), l.average, l.position, ...(showOutcome ? [l.promotion?.outcome ?? ""] : [])]),
    ["", "", "Subject average", "", ...stats.map((s) => s.average), "", ""],
    ["", "", "Pass rate %", "", ...stats.map((s) => s.passRate), "", ""],
  ];

  return (
    <>
      <PageHeader title="Class broadsheet" subtitle={`${cr.className} · ${gradeLabel(cr.grade)} · ${periodLabel(period)} ${cr.year}`}>
        <Filters filters={[
          { name: "class", label: "Class", value: classId, options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { name: "term", label: "Period", value: String(period), options: [...[1, 2, 3, 4].map((t) => ({ value: String(t), label: `Term ${t}` })), { value: "year", label: "Final (year)" }] },
        ]} />
        <CsvButton filename={`broadsheet-${cr.className}-${period}-${cr.year}.csv`} rows={csv} />
        <PrintButton label="Print" />
      </PageHeader>
      <Card className="print-area">
        <div className="hidden print:block mb-3"><p className="font-bold">{ctx.school.name}</p><p className="text-sm">Broadsheet · {cr.className} · {periodLabel(period)} {cr.year}</p></div>
        <div className="overflow-x-auto">
          <table className="table !text-xs">
            <thead>
              <tr>
                <th>#</th><th className="min-w-[11rem]">Learner</th>
                {cr.subjects.map((s) => <th key={s.csId} className="text-center !whitespace-normal min-w-[4.5rem]" title={s.name}>{short(s.name)}</th>)}
                <th className="text-center">Avg</th><th className="text-center">Pos</th>{showOutcome && <th>Outcome</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((l, i) => (
                <tr key={l.id}>
                  <td className="muted">{i + 1}</td>
                  <td><span className="font-medium">{l.last_name}, {l.first_name}</span></td>
                  {cr.subjects.map((s) => <td key={s.csId} className={`text-center font-medium ${cellTone(l.pct[s.csId])}`}>{l.pct[s.csId] ?? "-"}</td>)}
                  <td className="text-center font-bold">{l.average ?? "-"}</td>
                  <td className="text-center">{l.position ?? "-"}</td>
                  {showOutcome && <td className={l.promotion?.promoted ? "text-emerald-600" : "text-rose-600"}>{l.promotion?.outcome ?? "-"}{l.provisional ? "*" : ""}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr><td /><td className="px-4 py-2">Subject average</td>{stats.map((s) => <td key={s.csId} className="text-center">{s.average ?? "-"}</td>)}<td colSpan={showOutcome ? 3 : 2} /></tr>
              <tr><td /><td className="px-4 py-2">Pass rate</td>{stats.map((s) => <td key={s.csId} className="text-center">{s.passRate != null ? `${s.passRate}%` : "-"}</td>)}<td colSpan={showOutcome ? 3 : 2} /></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs muted mt-3">Shading: green = Level 6–7, yellow = Level 3, red = Level 1–2.{showOutcome ? " * Provisional until the final examination is captured." : ""}</p>
      </Card>
    </>
  );
}
