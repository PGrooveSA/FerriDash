import Link from "next/link";
import type { Ctx } from "@/lib/auth";
import { ownLearnerIds } from "@/lib/auth";
import { gradeLabel, zar, fullName, avatarUrl } from "@/lib/format";
import { Card, Empty, LevelBadge } from "@/components/ui/kit";
import { MiniCalendar, Agenda, NoticeList, RecentMessages } from "@/components/widgets";
import Avatar from "@/components/ui/Avatar";
import { SchoolMark } from "@/components/SchoolCrest";
import { learnerSnapshot } from "./LearnerDashboard";
import { ozowConfig } from "@/lib/online-payments";

export default function ParentDashboard({ ctx }: { ctx: Ctx }) {
  const payOnline = !!ctx.school.fee_paying && !!ozowConfig(ctx.schoolId);
  const kids = (ownLearnerIds(ctx) ?? []).map((id) => learnerSnapshot(ctx, id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className="glass p-6 sm:p-8 flex flex-wrap items-center gap-6 bg-gradient-to-r from-emerald-200/70 via-butter-100/50 to-sky-200/70 dark:from-gold-500/20 dark:to-transparent">
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold tracking-tight">Welcome, {fullName(ctx.user, true)}</h1>
            <p className="text-sm muted mt-1">Follow your {kids.length === 1 ? "child's" : "children's"} progress at {ctx.school.name}.</p>
          </div>
          <SchoolMark school={ctx.school} />
        </div>
        {kids.length === 0 && <Card><Empty title="No learners linked" hint="Ask the school office to link your child to your account." /></Card>}
        {kids.map(({ learner: l, latest, att, balance }) => (
          <Card key={l.id}>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar first={l.first_name} last={l.last_name} size={104} photo={avatarUrl(l.user_id, l.av)} />
              <div className="flex-1 min-w-[12rem]">
                <p className="text-xl font-semibold">{l.first_name} {l.last_name}</p>
                <p className="text-sm muted">{gradeLabel(l.grade)} · Class {l.className} · {l.admission_number}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/results/my?learner=${l.id}`} className="btn btn-primary btn-sm">Results</Link>
                <Link href={`/reports/report-cards?learner=${l.id}`} className="btn btn-ghost btn-sm">Report card</Link>
                <Link href={`/attendance?learner=${l.id}`} className="btn btn-ghost btn-sm">Attendance</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">Attendance</p><p className="text-2xl font-bold">{att.rate != null ? `${att.rate}%` : "-"}</p><p className="text-xs muted">{att.absent ?? 0} absent days</p></div>
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">{latest ? `Term ${latest.term} average` : "Average"}</p><p className="text-2xl font-bold">{latest?.row?.average != null ? `${latest.row.average}%` : "-"}</p><p className="text-xs muted">{latest?.row?.position ? `Position ${latest.row.position}` : "Not yet published"}</p></div>
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">Subjects</p><p className="text-2xl font-bold">{latest?.cr?.subjects.length ?? "-"}</p><p className="text-xs muted">CAPS curriculum</p></div>
              <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">Fee balance</p><p className={`text-2xl font-bold ${balance > 0 ? "text-rose-600" : ""}`}>{zar(Math.max(balance, 0), true)}</p>{payOnline && balance > 0
                ? <Link href={`/finance/statement?learner=${l.id}`} className="btn btn-primary btn-sm mt-1">Pay now</Link>
                : <Link href={`/finance/statement?learner=${l.id}`} className="text-xs muted underline">Statement</Link>}</div>
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
        <Card><MiniCalendar schoolId={ctx.schoolId} /><h3 className="font-semibold mt-6 mb-3">Agenda</h3><Agenda schoolId={ctx.schoolId} /></Card>
        <Card title="Notices"><NoticeList schoolId={ctx.schoolId} audiences={["all", "parents"]} /></Card>
        <Card title="Messages"><RecentMessages userId={ctx.user.id} /></Card>
      </aside>
    </div>
  );
}
