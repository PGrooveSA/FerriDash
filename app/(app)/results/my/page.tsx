import Link from "next/link";
import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { gradeLabel } from "@/lib/format";
import { capsLevel } from "@/lib/caps";
import { classResults, parsePeriod, periodLabel } from "@/lib/results";
import { Card, PageHeader, Empty, LevelBadge } from "@/components/ui/kit";
import { Filters } from "@/components/ui/forms";
import { HBars } from "@/components/charts";

export const metadata = { title: "My results" };

export default async function MyResultsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["learner", "parent"]);
  const sp = await searchParams;
  const ids = ownLearnerIds(ctx) ?? [];
  const learnerId = ids.includes(Number(sp.learner)) ? Number(sp.learner) : ids[0];
  if (!learnerId) return <Card><Empty title="No learner linked to this account" /></Card>;
  const kids = all<{ id: number; name: string }>(`SELECT id, first_name || ' ' || last_name name FROM learners WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  const l = get<{ class_id: number; first_name: string; last_name: string; grade: number; className: string }>("SELECT l.class_id, l.first_name, l.last_name, c.grade, c.name className FROM learners l JOIN classes c ON c.id = l.class_id WHERE l.id = ?", learnerId)!;
  const year = ctx.school.current_year;

  // Default to the latest term that has published results.
  const publishedTerms = all<{ term: number }>("SELECT DISTINCT term FROM result_sets WHERE status = 'published' AND year = ? AND class_subject_id IN (SELECT id FROM class_subjects WHERE class_id = ?) ORDER BY term", year, l.class_id).map((r) => r.term);
  const period = parsePeriod(sp.term, publishedTerms.at(-1) ?? 1);
  const cr = classResults(ctx.schoolId, l.class_id, year, period, { publishedOnly: true });
  const row = cr?.learners.find((x) => x.id === learnerId);
  const hasAny = row && Object.values(row.pct).some((v) => v != null);

  return (
    <>
      <PageHeader title={`Results · ${l.first_name} ${l.last_name}`} subtitle={`${gradeLabel(l.grade)} · Class ${l.className} · ${year}`}>
        <Filters filters={[
          ...(kids.length > 1 ? [{ name: "learner", label: "Child", value: learnerId, options: kids.map((k) => ({ value: k.id, label: k.name })) }] : []),
          { name: "term", label: "Term", value: String(period), options: [...[1, 2, 3, 4].map((t) => ({ value: String(t), label: `Term ${t}${publishedTerms.includes(t) ? "" : " (not published)"}` })), { value: "year", label: "Year to date" }] },
        ]} />
        <Link href={`/reports/report-cards?learner=${learnerId}&term=${period}`} className="btn btn-primary">View report card</Link>
      </PageHeader>
      {!hasAny || !cr || !row ? <Card><Empty title={`No published results for ${periodLabel(period)}`} hint="Results appear here once the school has moderated and published them." /></Card> : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_24rem] gap-6">
          <Card title={periodLabel(period)}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Subject</th><th>Mark</th><th>Level</th><th>Descriptor</th><th>Class average</th></tr></thead>
                <tbody>{cr.subjects.map((s) => {
                  const v = row.pct[s.csId];
                  const vals = cr.learners.map((x) => x.pct[s.csId]).filter((x): x is number => x != null);
                  return (
                    <tr key={s.csId}>
                      <td className="font-medium">{s.name}</td>
                      <td className="font-semibold">{v != null ? `${v}%` : "-"}</td>
                      <td><LevelBadge pct={v} /></td>
                      <td className="text-sm">{capsLevel(v)?.descriptor ?? "-"}</td>
                      <td className="muted">{vals.length ? `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%` : "-"}</td>
                    </tr>);
                })}</tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-6 mt-5 text-sm">
              <p>Average: <b>{row.average}%</b></p>
              {row.position && <p>Position: <b>{row.position}</b> of {cr.learners.length}</p>}
              {row.promotion && <p>Outcome: <b className={row.promotion.promoted ? "text-emerald-600" : "text-rose-600"}>{row.promotion.outcome}</b>{row.provisional && <span className="muted"> (provisional)</span>}</p>}
            </div>
          </Card>
          <Card title="At a glance">
            <HBars data={cr.subjects.map((s) => ({ name: s.name.replace(" Home Language", " HL").replace(" First Additional Language", " FAL"), value: row.pct[s.csId], color: (row.pct[s.csId] ?? 0) >= 50 ? "#f9c95e" : "#fda4af" }))} />
          </Card>
        </div>
      )}
    </>
  );
}
