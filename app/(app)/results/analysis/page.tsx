import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { gradeLabel } from "@/lib/format";
import { CAPS_LEVELS } from "@/lib/caps";
import { classResults, subjectStats, parsePeriod, periodLabel } from "@/lib/results";
import { Card, PageHeader, Empty, StatCard, LevelBadge } from "@/components/ui/kit";
import { Filters } from "@/components/ui/forms";
import { Bars } from "@/components/charts";
import { Users, TrendingUp, AlertTriangle, Trophy } from "lucide-react";

export const metadata = { title: "Results analysis" };
const LEVEL_COLORS = ["#fda4af", "#fdba74", "#fde68a", "#bae6fd", "#7dd3fc", "#c4b5fd", "#86efac"];

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "teacher"]);
  const sp = await searchParams;
  const year = ctx.school.current_year;
  const classes = ctx.isAdmin
    ? all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, year)
    : all<{ id: number; name: string; grade: number }>("SELECT DISTINCT c.id, c.name, c.grade FROM classes c LEFT JOIN class_subjects cs ON cs.class_id = c.id WHERE c.year = ?2 AND (cs.teacher_id = ?1 OR c.class_teacher_id = ?1) ORDER BY c.grade, c.name", ctx.teacherId, year);
  const classId = classes.find((c) => c.id === Number(sp.class))?.id ?? classes[0]?.id;
  if (!classId) return <Card><Empty title="No classes" /></Card>;
  const period = parsePeriod(sp.term, Math.max(1, ctx.school.current_term - 1));
  const cr = classResults(ctx.schoolId, classId, year, period)!;
  const stats = subjectStats(cr);
  const avgs = cr.learners.map((l) => l.average).filter((v): v is number => v != null);
  const classAvg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;

  // At risk: below the promotion threshold in any core subject or averaging under 40%.
  const atRisk = cr.learners.filter((l) => l.average != null).map((l) => {
    const fails = cr.subjects.filter((s) => { const v = l.pct[s.csId]; return v != null && v < (s.category === "HL" ? 50 : s.category === "LO" ? 30 : 40) && ["HL", "FAL", "MATH", "MLIT"].includes(s.category); });
    return { l, fails };
  }).filter((x) => x.fails.length > 0 || (x.l.average ?? 100) < 40).sort((a, b) => (a.l.average ?? 0) - (b.l.average ?? 0));
  const top = [...cr.learners].filter((l) => l.position != null).sort((a, b) => a.position! - b.position!).slice(0, 5);

  const levelData = stats.map((s) => ({ name: s.name.replace(" Home Language", " HL").replace(" First Additional Language", " FAL").slice(0, 18), ...Object.fromEntries(s.levels.map((n, i) => [`L${i + 1}`, n])) }));

  return (
    <>
      <PageHeader title="Results analysis" subtitle={`${cr.className} · ${gradeLabel(cr.grade)} · ${periodLabel(period)}`}>
        <Filters filters={[
          { name: "class", label: "Class", value: classId, options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { name: "term", label: "Period", value: String(period), options: [...[1, 2, 3, 4].map((t) => ({ value: String(t), label: `Term ${t}` })), { value: "year", label: "Year (final)" }] },
        ]} />
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Learners assessed" value={avgs.length} icon={Users} tone="sky" />
        <StatCard label="Class average" value={classAvg != null ? `${classAvg}%` : "-"} icon={TrendingUp} tone="lilac" />
        <StatCard label="Learners at risk" value={atRisk.length} icon={AlertTriangle} tone="butter" hint="Below core-subject thresholds" />
        <StatCard label="Top learner" value={top[0] ? `${top[0].average}%` : "-"} icon={Trophy} tone="green" hint={top[0] ? `${top[0].first_name} ${top[0].last_name}` : undefined} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card title="Subject averages & pass rates">
          <Bars data={stats.map((s) => ({ name: s.code ?? s.name.slice(0, 6), average: s.average, pass: s.passRate }))} xKey="name" yMax={100} unit="%" series={[{ key: "average", name: "Average", color: "#c4b5fd" }, { key: "pass", name: "Pass rate", color: "#7dd3fc" }]} />
        </Card>
        <Card title="CAPS level distribution">
          <Bars data={levelData} xKey="name" series={CAPS_LEVELS.slice().reverse().map((l, i) => ({ key: `L${l.level}`, name: `Level ${l.level}`, color: LEVEL_COLORS[i] }))} />
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
        <Card title="Subject summary">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Subject</th><th>Educator</th><th>Average</th><th>Pass rate</th>{CAPS_LEVELS.slice().reverse().map((l) => <th key={l.level} className="text-center">L{l.level}</th>)}</tr></thead>
              <tbody>{stats.map((s) => (
                <tr key={s.csId}>
                  <td className="font-medium">{s.name}</td><td className="text-sm">{s.teacher ?? "-"}</td>
                  <td><span className="font-semibold">{s.average ?? "-"}%</span> <LevelBadge pct={s.average} /></td>
                  <td>{s.passRate ?? "-"}%</td>
                  {s.levels.map((n, i) => <td key={i} className="text-center">{n || <span className="muted">·</span>}</td>)}
                </tr>))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Top 5">
            <ol className="space-y-2">{top.map((l) => <li key={l.id} className="flex justify-between text-sm"><span><b>{l.position}.</b> {l.first_name} {l.last_name}</span><span className="font-semibold">{l.average}%</span></li>)}</ol>
          </Card>
          <Card title="Needs support">
            {atRisk.length === 0 ? <p className="text-sm muted">No learners below the thresholds.</p> : (
              <ul className="space-y-3">{atRisk.slice(0, 10).map(({ l, fails }) => (
                <li key={l.id} className="text-sm">
                  <div className="flex justify-between"><Link className="font-medium hover:underline" href={`/reports/report-cards?learner=${l.id}&term=${period}`}>{l.first_name} {l.last_name}</Link><span className="text-rose-600 font-semibold">{l.average}%</span></div>
                  {fails.length > 0 && <p className="text-xs muted">{fails.map((s) => `${s.name} ${l.pct[s.csId]}%`).join(" · ")}</p>}
                </li>))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
