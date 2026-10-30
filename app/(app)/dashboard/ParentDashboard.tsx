import Link from "next/link";
import type { Ctx } from "@/lib/auth";
import { ownLearnerIds } from "@/lib/auth";
import { zar, fullName, avatarUrl, bannerUrl } from "@/lib/format";
import { Card, Empty, LevelBadge } from "@/components/ui/kit";
import { bannerStyle } from "@/components/ui/banner";
import { tFor } from "@/lib/i18n";
import { MiniCalendar, Agenda, AssignmentsDue, NoticeList, RecentMessages, ClassesToday } from "@/components/widgets";
import Avatar from "@/components/ui/Avatar";
import { SchoolMark } from "@/components/SchoolCrest";
import { learnerSnapshot, classLine } from "./LearnerDashboard";

export default async function ParentDashboard({ ctx }: { ctx: Ctx }) {
  const tr = tFor(ctx.user);
  const kids = (await Promise.all(((await ownLearnerIds(ctx)) ?? []).map((id) => learnerSnapshot(ctx, id)))).filter((x): x is NonNullable<typeof x> => !!x);
  const banner = bannerStyle(bannerUrl(ctx.user.id, ctx.user.banner_updated_at));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className={`glass p-6 sm:p-8 flex flex-wrap items-center gap-6 ${banner?.className ?? "bg-gradient-to-r from-emerald-200/70 via-butter-100/50 to-sky-200/70 dark:from-gold-500/20 dark:to-transparent"}`} style={banner?.style}>
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold tracking-tight">{tr("Welcome, {name}", { name: fullName(ctx.user, true) })}</h1>
            <p className="text-sm muted mt-1">{tr(kids.length === 1 ? "Follow your child's progress at {school}." : "Follow your children's progress at {school}.", { school: ctx.school.name })}</p>
          </div>
          <SchoolMark school={ctx.school} />
        </div>
        {/* Every child's lessons today, in one list (class shown when there is more than one child). */}
        {kids.some((k) => k.learner.class_id) && (
          <Card title={tr("Today's classes")} action={<Link href="/timetable" className="text-xs muted">{tr("Full timetable")}</Link>}>
            <ClassesToday tr={tr} classIds={[...new Set(kids.map((k) => k.learner.class_id).filter((c): c is number => !!c))]} showClass={kids.length > 1} />
          </Card>
        )}
        {kids.length === 0 && <Card><Empty title={tr("No learners linked")} hint={tr("Ask the school office to link your child to your account.")} /></Card>}
        {kids.map(({ learner: l, latest, att }) => (
          <Card key={l.id}>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar first={l.first_name} last={l.last_name} size={104} photo={avatarUrl(l.user_id, l.av)} />
              <div className="flex-1 min-w-[12rem]">
                <p className="text-xl font-semibold">{l.first_name} {l.last_name}</p>
                <p className="text-sm muted">{classLine(l, tr)} · {l.admission_number}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/results/my?learner=${l.id}`} className="btn btn-primary btn-sm">{tr("Results")}</Link>
                <Link href={`/reports/report-cards?learner=${l.id}`} className="btn btn-ghost btn-sm">{tr("Report card")}</Link>
                <Link href={`/attendance?learner=${l.id}`} className="btn btn-ghost btn-sm">{tr("Attendance")}</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">{tr("Attendance")}</p><p className="text-2xl font-bold">{att.rate != null ? `${att.rate}%` : "-"}</p><p className="text-xs muted">{tr("{n} absent days", { n: att.absent ?? 0 })}</p></div>
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">{latest ? tr("Term {n} average", { n: latest.term }) : tr("Average")}</p><p className="text-2xl font-bold">{latest?.row?.average != null ? `${latest.row.average}%` : "-"}</p><p className="text-xs muted">{latest?.row?.position ? tr("Position {n}", { n: latest.row.position }) : tr("Not yet published")}</p></div>
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">{tr("Subjects")}</p><p className="text-2xl font-bold">{latest?.cr?.subjects.length ?? "-"}</p><p className="text-xs muted">{tr("CAPS curriculum")}</p></div>
            </div>
            {latest && (
              <div className="flex flex-wrap gap-2 mt-4">
                {latest.cr!.subjects.map((s) => (
                  <span key={s.csId} className="glass-strong rounded-full pl-3 pr-1 py-1 text-xs flex items-center gap-2">{s.name} <b>{latest.row!.pct[s.csId] ?? "-"}%</b><LevelBadge pct={latest.row!.pct[s.csId]} /></span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
      <aside className="space-y-6">
        <Card><MiniCalendar tr={tr} schoolId={ctx.schoolId} ctx={ctx} /><h3 className="font-semibold mt-6 mb-3">{tr("Assignments due")}</h3><AssignmentsDue tr={tr} ctx={ctx} /><h3 className="font-semibold mt-6 mb-3">{tr("Agenda")}</h3><Agenda tr={tr} schoolId={ctx.schoolId} /></Card>
        <Card title={tr("Notices")}><NoticeList tr={tr} schoolId={ctx.schoolId} audiences={["all", "parents"]} /></Card>
        <Card title={tr("Messages")}><RecentMessages tr={tr} userId={ctx.user.id} /></Card>
      </aside>
    </div>
  );
}
