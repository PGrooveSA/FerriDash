import Link from "next/link";
import { CalendarCheck, Award, ClipboardList, Clock } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, gradeLabel, avatarUrl, bannerUrl } from "@/lib/format";
import { today } from "@/lib/today";
import { classResults, attendanceSummary, termDates } from "@/lib/results";
import { capsLevel } from "@/lib/caps";
import { Card, StatCard, Empty } from "@/components/ui/kit";
import { bannerStyle } from "@/components/ui/banner";
import { HBars, Trend } from "@/components/charts";
import { visibleAssignments } from "@/lib/assignments";
import { MiniCalendar, Agenda, AssignmentsDue, NoticeList, ClassesToday } from "@/components/widgets";
import { scheduleOn } from "@/lib/timetable";
import Avatar from "@/components/ui/Avatar";
import { SchoolMark } from "@/components/SchoolCrest";
import { tFor, makeT, type T } from "@/lib/i18n";

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
  return { learner: l, terms, latest, att };
}

/** "Grade 10 · Class 10A", or a note while the learner has no class yet. */
export const classLine = (l: { grade: number | null; className: string | null }, tr: T = makeT({})) =>
  l.className != null && l.grade != null ? `${tr("Grade {n}", { n: gradeLabel(l.grade).replace("Grade ", "") })} · ${tr("Class {name}", { name: l.className })}` : tr("Not placed in a class yet");

export default async function LearnerDashboard({ ctx }: { ctx: Ctx }) {
  const tr = tFor(ctx.user);
  if (!ctx.learnerId) return <Empty title={tr("No learner profile linked to this account")} />;
  const snap = await learnerSnapshot(ctx, ctx.learnerId);
  if (!snap) return <Empty title={tr("No learner profile linked to this account")} />;
  const { learner: l, latest, att } = snap;
  const t = today();
  const assignments = await visibleAssignments(ctx, { from: t });
  const todayClasses = l.class_id ? await scheduleOn([l.class_id], t) : [];

  const bars = latest ? latest.cr!.subjects.map((s) => {
    const v = latest.row!.pct[s.csId];
    const lv = capsLevel(v)?.level ?? 0;
    return { name: s.name.replace(" Home Language", " HL").replace(" First Additional Language", " FAL"), value: v, color: lv >= 6 ? "#34d399" : lv >= 4 ? "#38bdf8" : lv === 3 ? "#fde68a" : "#fda4af" };
  }) : [];
  const trend = snap.terms.filter((x) => x.row?.average != null).map((x) => ({ term: tr("Term {n}", { n: x.term }), average: x.row!.average }));

  const banner = bannerStyle(bannerUrl(ctx.user.id, ctx.user.banner_updated_at));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className={`glass p-6 sm:p-8 flex flex-wrap items-center gap-6 ${banner?.className ?? "bg-gradient-to-r from-sky-200/80 via-brand-100/40 to-emerald-200/70 dark:from-sky-500/20 dark:to-emerald-500/10"}`} style={banner?.style}>
          {/* Phones: the school logo sits beside the photo; wider screens keep it on the right. */}
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <Avatar first={l.first_name} last={l.last_name} size={128} photo={avatarUrl(l.user_id, l.av)} />
            <div className="sm:hidden ml-auto"><SchoolMark school={ctx.school} /></div>
          </div>
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold tracking-tight">{tr("Welcome, {name}", { name: l.first_name })}</h1>
            <p className="text-sm muted mt-1">{classLine(l, tr)} · {tr("Admission no. {n}", { n: l.admission_number })}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href="/results/my" className="btn btn-primary">{tr("My results")}</Link>
              <Link href="/reports/report-cards" className="btn btn-ghost">{tr("Report cards")}</Link>
            </div>
          </div>
          <div className="hidden sm:block ml-auto"><SchoolMark school={ctx.school} /></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={tr("Attendance")} value={att.rate != null ? `${att.rate}%` : "-"} icon={CalendarCheck} tone="sky" hint={tr("{n} days absent this year", { n: att.absent ?? 0 })} />
          <StatCard label={latest ? tr("Term {n} average", { n: latest.term }) : tr("Average")} value={latest?.row?.average != null ? `${latest.row.average}%` : "-"} icon={Award} tone="green" hint={latest?.row?.position ? tr("Position {n} of {total}", { n: latest.row.position, total: latest.cr!.learners.length }) : undefined} />
          <StatCard label={tr("Assignments due")} value={assignments.length} icon={ClipboardList} tone="gold" />
          <StatCard label={tr("Classes today")} value={todayClasses.length} icon={Clock} tone="orange" />
        </div>
        <Card title={tr("Today's classes")} action={<Link href="/timetable" className="text-xs muted">{tr("Full timetable")}</Link>}>
          <ClassesToday tr={tr} classIds={l.class_id ? [l.class_id] : []} slots={todayClasses} />
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6">
          <Card title={latest ? `${tr("Marks by subject")} · ${tr("Term {n}", { n: latest.term })}` : tr("Marks by subject")}>
            {bars.length ? <HBars data={bars} /> : <Empty title={tr("No published results yet")} />}
          </Card>
          <Card title={tr("Progress")}>{trend.length ? <Trend data={trend} xKey="term" series={[{ key: "average", name: tr("Average %"), color: "#38bdf8" }]} /> : <Empty title={tr("Nothing here yet")} />}</Card>
        </div>
        <Card title={tr("Assignments")} action={<Link href="/assignments" className="text-xs muted">{tr("View all")}</Link>}>
          {assignments.length ? (
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>{tr("Task")}</th><th>{tr("Subject")}</th><th>{tr("Due")}</th></tr></thead>
              <tbody>{assignments.slice(0, 6).map((a) => <tr key={a.id}><td className="font-medium"><Link href={`/assignments/${a.id}`} className="hover:underline">{a.title}</Link></td><td>{a.subject}</td><td>{fmtDate(a.due_date)}</td></tr>)}</tbody></table></div>
          ) : <Empty title={tr("No assignments due")} />}
        </Card>
      </div>
      <aside className="space-y-6">
        <Card><MiniCalendar tr={tr} schoolId={ctx.schoolId} ctx={ctx} /><h3 className="font-semibold mt-6 mb-3">{tr("Assignments due")}</h3><AssignmentsDue tr={tr} ctx={ctx} /><h3 className="font-semibold mt-6 mb-3">{tr("Agenda")}</h3><Agenda tr={tr} schoolId={ctx.schoolId} /></Card>
        <Card title={tr("Notices")}><NoticeList tr={tr} schoolId={ctx.schoolId} audiences={["all", "learners"]} /></Card>
      </aside>
    </div>
  );
}
