import Link from "next/link";
import type { Ctx } from "@/lib/auth";
import { ownLearnerIds } from "@/lib/auth";
import { all } from "@/lib/db";
import { zar, fullName, bannerUrl } from "@/lib/format";
import { today } from "@/lib/today";
import { tFor } from "@/lib/i18n";
import { account, feesOn } from "@/lib/fees";
import { allergiesOf } from "@/lib/childcare";
import { Card, Empty } from "@/components/ui/kit";
import { bannerStyle } from "@/components/ui/banner";
import { MiniCalendar, Agenda, RecentMessages, NoticeList } from "@/components/widgets";
import Avatar from "@/components/ui/Avatar";
import { SchoolMark } from "@/components/SchoolCrest";
import { AllergyChips, ageText, todayStatus } from "@/components/childcare";

/** A parent at a childcare centre: each child's day so far (arrived, collected), their classroom and the fees due. */
export default async function ChildcareParentDashboard({ ctx }: { ctx: Ctx }) {
  const tr = tFor(ctx.user);
  const t = today();
  const ids = (await ownLearnerIds(ctx)) ?? [];
  const kids = ids.length ? await all<{ id: number; first_name: string; last_name: string; date_of_birth: string | null; className: string | null; in_at: string | null; dropped_by: string | null; out_at: string | null; collected_by: string | null }>(`
    SELECT l.id, l.first_name, l.last_name, l.date_of_birth, c.name className, k.in_at, k.dropped_by, k.out_at, k.collected_by
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id LEFT JOIN checkins k ON k.learner_id = l.id AND k.date = ?
    WHERE l.id IN (${ids.map(() => "?").join(",")}) AND l.status = 'Active' ORDER BY l.first_name`, t, ...ids) : [];
  const allergies = await allergiesOf(kids.map((k) => k.id));
  const fees = feesOn(ctx.school) ? new Map(await Promise.all(kids.map(async (k) => [k.id, await account(k.id)] as const))) : null;
  const banner = bannerStyle(bannerUrl(ctx.user.id, ctx.user.banner_updated_at));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className={`glass p-6 sm:p-8 flex flex-wrap items-center gap-6 ${banner?.className ?? "bg-gradient-to-r from-emerald-200/70 via-butter-100/50 to-sky-200/70 dark:from-gold-500/20 dark:to-transparent"}`} style={banner?.style}>
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold tracking-tight">{tr("Welcome, {name}", { name: fullName(ctx.user, true) })}</h1>
            <p className="text-sm muted mt-1">{kids.length === 1 ? `${kids[0].first_name}'s day at ${ctx.school.name}.` : `Your children's day at ${ctx.school.name}.`}</p>
          </div>
          <SchoolMark school={ctx.school} />
        </div>
        {kids.length === 0 && <Card><Empty title="No children linked" hint="Ask the centre to link your child to your account." /></Card>}
        {kids.map((k) => {
          const st = todayStatus(k);
          const a = fees?.get(k.id);
          return (
            <Card key={k.id}>
              <div className="flex flex-wrap items-center gap-4">
                <Avatar first={k.first_name} last={k.last_name} size={88} />
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-xl font-semibold">{k.first_name} {k.last_name}</p>
                  <p className="text-sm muted">{ageText(k.date_of_birth, t)} · {k.className ?? "No classroom yet"}</p>
                  <div className="mt-1.5"><AllergyChips allergies={allergies.filter((x) => x.learner_id === k.id)} compact /></div>
                </div>
                <Link href={`/children/${k.id}`} className="btn btn-ghost btn-sm">Profile and contacts</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">Today</p><p className="text-lg font-bold"><span className={`chip ${st.tone} !text-sm`}>{st.label}</span></p>
                  <p className="text-xs muted mt-1">{k.in_at ? `Dropped off by ${k.dropped_by}` : "Not checked in yet"}</p></div>
                <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">Collected</p><p className="text-lg font-bold">{k.out_at ?? "-"}</p><p className="text-xs muted">{k.collected_by ? `by ${k.collected_by}` : "Still at the centre or not in today"}</p></div>
                {a ? (
                  <Link href={`/finance/statement?learner=${k.id}`} className="glass-strong rounded-2xl p-4 hover:-translate-y-0.5 transition-transform">
                    <p className="text-xs muted">Fees due now</p>
                    <p className={`text-lg font-bold ${a.overdue > 0.5 ? "text-rose-600" : ""}`}>{zar(Math.max(0, a.dueNow))}</p>
                    <p className="text-xs muted">{a.overdue > 0.5 ? `${zar(a.overdue)} overdue` : a.total > 0.5 ? "Tap to pay or see the statement" : "Paid up. Thank you!"}</p>
                  </Link>
                ) : <div className="glass-strong rounded-2xl p-4"><p className="text-xs muted">Centre hours</p><p className="text-lg font-bold">{ctx.school.opens_at ?? "?"}–{ctx.school.closes_at ?? "?"}</p></div>}
              </div>
            </Card>
          );
        })}
      </div>
      <aside className="space-y-6">
        <Card><MiniCalendar tr={tr} schoolId={ctx.schoolId} ctx={ctx} /><Agenda tr={tr} schoolId={ctx.schoolId} heading={tr("Agenda")} /></Card>
        <NoticeList tr={tr} schoolId={ctx.schoolId} audiences={["all", "parents"]} card={{ title: tr("Notices") }} />
        <RecentMessages tr={tr} userId={ctx.user.id} card={{ title: tr("Messages") }} />
      </aside>
    </div>
  );
}
