import Link from "next/link";
import { CalendarCheck, Award, ClipboardList, Library } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, gradeLabel, avatarUrl } from "@/lib/format";
import { today } from "@/lib/today";
import { classResults, attendanceSummary, termDates } from "@/lib/results";
import { capsLevel } from "@/lib/caps";
import { Card, StatCard, Empty } from "@/components/ui/kit";
import { HBars, Trend } from "@/components/charts";
import { visibleAssignments } from "@/lib/assignments";
import { MiniCalendar, Agenda, AssignmentsDue, NoticeList } from "@/components/widgets";
import Avatar from "@/components/ui/Avatar";
import { SchoolMark } from "@/components/SchoolCrest";

export type LearnerSnapshot = ReturnType<typeof learnerSnapshot>;

/** Everything a learner or parent needs to see about one learner. Published results only. */
export async function learnerSnapshot(ctx: Ctx, learnerId: number) {
  const year = ctx.school.current_year;
  // A learner may not be placed in a class yet: then there are no class results to show.
  const l = await get<{ id: number; first_name: string; last_name: string; class_id: number | null; className: string | null; grade: number | null; admission_number: string; user_id: number | null; av: string | null }>(`
    SELECT l.id, l.first_name, l.last_name, l.class_id, c.name className, c.grade, l.admission_number, l.user_id, (SELECT avatar_updated_at FROM users WHERE id = l.user_id) av
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE l.id = ? AND l.school_id = ?`, learnerId, ctx.schoolId);
  if (!l) return null;
  const classId = l.class_id;
  const terms = (await Promise.all([1, 2, 3, 4].map(async (t) => {
      const cr = classId ? await classResults(ctx.schoolId, classId, year, t, { publishedOnly: true, learnerIds: [l.id] }) : null;
      return { term: t, cr, row: cr?.learners[0] };
    })));
  const latest = [...terms].reverse().find((t) => t.row?.average != null);
  const yd = await termDates(ctx.schoolId, year, "year");
  const att = await attendanceSummary(l.id, yd.start, today());
  const balance = (await get<{ b: number }>(`SELECT COALESCE(SUM(i.tuition+i.activities+i.other),0) - COALESCE((SELECT SUM(p.amount) FROM payments p JOIN invoices i2 ON i2.id = p.invoice_id WHERE i2.learner_id = ?1),0) b FROM invoices i WHERE i.learner_id = ?1`, l.id))!.b;
  return { learner: l, terms, latest, att, balance };
}

/** "Grade 10 · Class 10A", or a note while the learner has no class yet. */
export const classLine = (l: { grade: number | null; className: string | null }) =>
  l.className != null && l.grade != null ? `${gradeLabel(l.grade)} · Class ${l.className}` : "Not placed in a class yet";

export default async function LearnerDashboard({ ctx }: { ctx: Ctx }) {
  if (!ctx.learnerId) return <Empty title="No learner profile linked to this account" />;
  const snap = await learnerSnapshot(ctx, ctx.learnerId);
  if (!snap) return <Empty title="No learner profile linked to this account" />;
  const { learner: l, latest, att } = snap;
  const t = today();
  const assignments = await visibleAssignments(ctx, { from: t });
  const loans = (await get<{ n: number }>("SELECT COUNT(*) n FROM book_loans WHERE learner_id = ? AND returned_on IS NULL", l.id))!.n;

  const bars = latest ? latest.cr!.subjects.map((s) => {
    const v = latest.row!.pct[s.csId];
    const lv = capsLevel(v)?.level ?? 0;
    return { name: s.name.replace(" Home Language", " HL").replace(" First Additional Language", " FAL"), value: v, color: lv >= 6 ? "#34d399" : lv >= 4 ? "#38bdf8" : lv === 3 ? "#fde68a" : "#fda4af" };
  }) : [];
  const trend = snap.terms.filter((x) => x.row?.average != null).map((x) => ({ term: `Term ${x.term}`, average: x.row!.average }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className="glass p-6 sm:p-8 flex flex-wrap items-center gap-6 bg-gradient-to-r from-sky-200/80 via-brand-100/40 to-emerald-200/70 dark:from-sky-500/20 dark:to-emerald-500/10">
          <Avatar first={l.first_name} last={l.last_name} size={128} photo={avatarUrl(l.user_id, l.av)} />
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold tracking-tight">Welcome, {l.first_name}</h1>
            <p className="text-sm muted mt-1">{classLine(l)} · Admission no. {l.admission_number}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href="/results/my" className="btn btn-primary">My results</Link>
              <Link href="/reports/report-cards" className="btn btn-ghost">Report cards</Link>
            </div>
          </div>
          <SchoolMark school={ctx.school} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Attendance" value={att.rate != null ? `${att.rate}%` : "-"} icon={CalendarCheck} tone="sky" hint={`${att.absent ?? 0} days absent this year`} />
          <StatCard label={latest ? `Term ${latest.term} average` : "Average"} value={latest?.row?.average != null ? `${latest.row.average}%` : "-"} icon={Award} tone="green" hint={latest?.row?.position ? `Position ${latest.row.position} of ${latest.cr!.learners.length}` : undefined} />
          <StatCard label="Assignments due" value={assignments.length} icon={ClipboardList} tone="gold" />
          <StatCard label="Library books out" value={loans} icon={Library} tone="orange" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6">
          <Card title={latest ? `Marks by subject · Term ${latest.term}` : "Marks by subject"}>
            {bars.length ? <HBars data={bars} /> : <Empty title="No published results yet" />}
          </Card>
          <Card title="Progress">{trend.length ? <Trend data={trend} xKey="term" series={[{ key: "average", name: "Average %", color: "#38bdf8" }]} /> : <Empty />}</Card>
        </div>
        <Card title="Assignments" action={<Link href="/assignments" className="text-xs muted">View all</Link>}>
          {assignments.length ? (
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Task</th><th>Subject</th><th>Due</th></tr></thead>
              <tbody>{assignments.slice(0, 6).map((a) => <tr key={a.id}><td className="font-medium"><Link href="/assignments" className="hover:underline">{a.title}</Link></td><td>{a.subject}</td><td>{fmtDate(a.due_date)}</td></tr>)}</tbody></table></div>
          ) : <Empty title="No assignments due" />}
        </Card>
      </div>
      <aside className="space-y-6">
        <Card><MiniCalendar schoolId={ctx.schoolId} ctx={ctx} /><h3 className="font-semibold mt-6 mb-3">Assignments due</h3><AssignmentsDue ctx={ctx} /><h3 className="font-semibold mt-6 mb-3">Agenda</h3><Agenda schoolId={ctx.schoolId} /></Card>
        <Card title="Notices"><NoticeList schoolId={ctx.schoolId} audiences={["all", "learners"]} /></Card>
      </aside>
    </div>
  );
}
