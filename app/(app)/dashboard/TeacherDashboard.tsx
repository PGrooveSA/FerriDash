import Link from "next/link";
import { visibleAssignments } from "@/lib/assignments";
import { BookOpen, ClipboardList, Users, CalendarCheck } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, fullName, bannerUrl } from "@/lib/format";
import { today } from "@/lib/today";
import { classResults } from "@/lib/results";
import { Card, StatCard, StatusChip } from "@/components/ui/kit";
import { bannerStyle } from "@/components/ui/banner";
import { tFor } from "@/lib/i18n";
import { Bars } from "@/components/charts";
import { SchoolMark } from "@/components/SchoolCrest";
import { MiniCalendar, Agenda, RecentMessages, NoticeList, ClassesToday } from "@/components/widgets";
import { teacherScheduleOn } from "@/lib/timetable";

export default async function TeacherDashboard({ ctx }: { ctx: Ctx }) {
  const tr = tFor(ctx.user);
  const sid = ctx.schoolId, year = ctx.school.current_year, term = ctx.school.current_term, t = today();
  const my = await all<{ csId: number; classId: number; className: string; subject: string; learners: number; status: string }>(`
    SELECT cs.id csId, c.id classId, c.name className, s.name subject,
      (SELECT COUNT(*) FROM learners l WHERE l.class_id = c.id AND l.status='Active') learners,
      COALESCE((SELECT status FROM result_sets r WHERE r.class_subject_id = cs.id AND r.year = ? AND r.term = ?), 'draft') status
    FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects s ON s.id = cs.subject_id
    WHERE cs.teacher_id = ? ORDER BY c.grade, s.name`, year, term, ctx.teacherId);

  const toCapture = (await get<{ n: number }>(`
    SELECT COUNT(*) n FROM assessments a JOIN class_subjects cs ON cs.id = a.class_subject_id
    WHERE cs.teacher_id = ? AND a.year = ? AND a.date <= ? AND
      (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id) < (SELECT COUNT(*) FROM learners l WHERE l.class_id = cs.class_id AND l.status='Active')`, ctx.teacherId, year, t))!.n;

  const homeroom = await get<{ id: number; name: string }>("SELECT id, name FROM classes WHERE class_teacher_id = ? AND year = ?", ctx.teacherId, year);
  const registerDone = homeroom ? (await get<{ n: number }>("SELECT COUNT(*) n FROM attendance a JOIN learners l ON l.id = a.learner_id WHERE l.class_id = ? AND a.date = ?", homeroom.id, t))!.n > 0 : false;

  // Average per class-subject for the previous term
  const prev = Math.max(1, term - 1);
  const cache = new Map<number, Awaited<ReturnType<typeof classResults>>>();
  const perf = (await Promise.all(my.map(async (m) => {
      if (!cache.has(m.classId)) cache.set(m.classId, await classResults(sid, m.classId, year, prev));
      const vals = cache.get(m.classId)?.learners.map((l) => l.pct[m.csId]).filter((v): v is number => v != null) ?? [];
      return { name: `${m.className} ${m.subject.split(" ")[0]}`, average: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
    })));

  const assignments = (await visibleAssignments(ctx, { from: t })).slice(0, 5);

  const myLessons = ctx.teacherId ? await teacherScheduleOn(ctx.teacherId, t) : [];
  const banner = bannerStyle(bannerUrl(ctx.user.id, ctx.user.banner_updated_at));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className={`glass p-6 sm:p-8 flex flex-wrap items-center gap-6 ${banner?.className ?? "bg-gradient-to-r from-sky-200/80 via-brand-100/50 to-emerald-200/70 dark:from-sky-500/20 dark:to-emerald-500/15"}`} style={banner?.style}>
          <div className="flex-1 min-w-[16rem]">
          <p className="text-sm muted">Sawubona · Dumela · {tr("Welcome")}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{fullName(ctx.user, true)}</h1>
          <p className="mt-2 text-sm max-w-xl">{tr(toCapture === 1 ? "You have 1 assessment waiting for marks." : "You have {n} assessments waiting for marks.", { n: toCapture })}{" "}
            {homeroom ? (registerDone ? tr("Today's register is complete.") : tr("The {class} register still needs to be taken today.", { class: homeroom.name })) : tr("You have no register class.")}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/results" className="btn btn-primary">{tr("Capture marks")}</Link>
            {homeroom && <Link href={`/attendance?class=${homeroom.id}`} className="btn btn-ghost">{tr("Take register")}</Link>}
          </div>
          </div>
          <SchoolMark school={ctx.school} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={tr("Subjects taught")} value={my.length} icon={BookOpen} tone="sky" />
          <StatCard label={tr("Learners")} value={[...new Map(my.map((m) => [m.classId, m.learners])).values()].reduce((a, b) => a + b, 0)} icon={Users} tone="green" />
          <StatCard label={tr("To capture")} value={toCapture} icon={ClipboardList} tone="gold" />
          <StatCard label={tr("Register class")} value={homeroom?.name ?? "-"} icon={CalendarCheck} tone="orange" hint={homeroom ? (registerDone ? tr("Taken today") : tr("Not yet taken")) : undefined} />
        </div>

        <Card title={tr("My classes · Term {n} averages", { n: prev })}>
          <Bars data={perf} xKey="name" yMax={100} unit="%" series={[{ key: "average", name: tr("Average"), color: "#38bdf8" }]} />
        </Card>

        <Card title={tr("My mark sheets")} action={<span className="text-xs muted">{tr("Term {n}", { n: term })}</span>}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{tr("Class")}</th><th>{tr("Subject")}</th><th>{tr("Learners")}</th><th>{tr("Status")}</th><th></th></tr></thead>
              <tbody>
                {my.map((m) => (
                  <tr key={m.csId}>
                    <td className="font-medium">{m.className}</td><td>{m.subject}</td><td>{m.learners}</td><td><StatusChip status={m.status} /></td>
                    <td className="text-right"><Link className="btn btn-ghost btn-sm" href={`/results?cs=${m.csId}&term=${term}`}>{tr("Open")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <aside className="space-y-6">
        <ClassesToday tr={tr} classIds={[]} slots={myLessons} showClass extras={false} card={{ title: tr("My lessons today"), action: <Link href="/timetable" className="text-xs muted">{tr("Timetable")}</Link> }} />
        <Card><MiniCalendar tr={tr} schoolId={sid} /><Agenda tr={tr} schoolId={sid} heading={tr("Agenda")} /></Card>
        {assignments.length > 0 && (
          <Card title={tr("Assignments set")} action={<Link href="/assignments" className="text-xs muted">{tr("View all")}</Link>}>
            <ul className="space-y-3">{assignments.map((a) => <li key={a.id} className="text-sm"><Link href={`/assignments/${a.id}`} className="font-medium hover:underline">{a.title}</Link><p className="text-xs muted">{a.subject} · {tr("Class {name}", { name: a.class_name })} · {tr("Due {date}", { date: fmtDate(a.due_date) })}</p></li>)}</ul>
          </Card>
        )}
        <RecentMessages tr={tr} userId={ctx.user.id} card={{ title: tr("Messages"), action: <Link href="/messages" className="text-xs muted">{tr("View all")}</Link> }} />
        <NoticeList tr={tr} schoolId={sid} audiences={["all", "staff"]} card={{ title: tr("Notices") }} />
      </aside>
    </div>
  );
}
