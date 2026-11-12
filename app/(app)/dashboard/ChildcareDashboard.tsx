import Link from "next/link";
import { Baby, LogIn, Home, AlertTriangle, Wallet, ShieldAlert } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, fmtDate, fullName } from "@/lib/format";
import { addDays, nowTime, today } from "@/lib/today";
import { tFor } from "@/lib/i18n";
import { feesOn } from "@/lib/fees";
import { classrooms, allergiesOf, myRooms } from "@/lib/childcare";
import { ageGroupLabel } from "@/lib/org";
import { Card, StatCard, Empty } from "@/components/ui/kit";
import { MiniCalendar, Agenda, RecentMessages, NoticeList } from "@/components/widgets";
import SchoolCrest from "@/components/SchoolCrest";
import { AllergyChips } from "@/components/childcare";

/** The owner's and practitioners' home page at a childcare centre: who is in, each room's ratio, allergies, collections and fees. */
export default async function ChildcareDashboard({ ctx }: { ctx: Ctx }) {
  const tr = tFor(ctx.user);
  const sid = ctx.schoolId, t = today(), now = nowTime();
  const all_ = await classrooms(ctx, t);
  // A practitioner sees their own classrooms first (all of them if they have none).
  const mine = ctx.isAdmin ? [] : await myRooms(ctx);
  const rooms = mine.length ? all_.filter((r) => mine.includes(r.id)) : all_;
  const c = (await get<{ children: number; arrived: number; inside: number; home: number }>(`
    SELECT (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status = 'Active') children,
      (SELECT COUNT(*) FROM checkins WHERE school_id = ?1 AND date = ?2) arrived,
      (SELECT COUNT(*) FROM checkins WHERE school_id = ?1 AND date = ?2 AND out_at IS NULL) inside,
      (SELECT COUNT(*) FROM checkins WHERE school_id = ?1 AND date = ?2 AND out_at IS NOT NULL) home`, sid, t))!;
  // Children in right now with a severe allergy: everyone on duty should know.
  const inside = await all<{ id: number; first_name: string; last_name: string; className: string | null }>(`SELECT l.id, l.first_name, l.last_name, c.name className
    FROM checkins k JOIN learners l ON l.id = k.learner_id LEFT JOIN classes c ON c.id = l.class_id WHERE k.school_id = ? AND k.date = ? AND k.out_at IS NULL`, sid, t);
  const severe = (await allergiesOf(inside.map((k) => k.id))).filter((a) => a.severity === "Severe");
  const severeKids = inside.filter((k) => severe.some((a) => a.learner_id === k.id));
  const unlisted = await all<{ learner_id: number; name: string; date: string; out_at: string; collected_by: string }>(`SELECT k.learner_id, l.first_name || ' ' || l.last_name name, k.date, k.out_at, k.collected_by
    FROM checkins k JOIN learners l ON l.id = k.learner_id WHERE k.school_id = ? AND k.unauthorised = 1 AND k.date >= ? ORDER BY k.date DESC, k.out_at DESC LIMIT 5`, sid, addDays(t, -7));
  const fees = ctx.isAdmin && feesOn(ctx.school) ? (await get<{ due: number; overdue: number }>(`
    SELECT COALESCE(SUM(CASE WHEN b > 0 THEN b END), 0) due, COALESCE(SUM(CASE WHEN b > 0 AND due_date < ?2 THEN b END), 0) overdue
    FROM (SELECT i.due_date, i.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) b FROM invoices i WHERE i.school_id = ?1 AND i.due_date <= ?2) z`, sid, t))! : null;
  const late = ctx.school.closes_at && now > ctx.school.closes_at ? c.inside : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
      <div className="space-y-6 min-w-0">
        <div className="glass p-5 sm:p-6 flex flex-wrap items-center gap-5 bg-gradient-to-r from-butter-100/70 via-brand-50/50 to-emerald-100/60 dark:from-brand-500/15 dark:via-transparent dark:to-emerald-500/10">
          <SchoolCrest school={ctx.school} size={72} zoom />
          <div className="flex-1 min-w-[14rem]">
            <h1 className="text-2xl font-bold tracking-tight">{ctx.isAdmin ? ctx.school.name : tr("Welcome, {name}", { name: fullName(ctx.user, true) })}</h1>
            <p className="text-sm muted">{fmtDate(t)} · {now}{ctx.school.opens_at && ctx.school.closes_at ? ` · open ${ctx.school.opens_at}–${ctx.school.closes_at}` : ""}</p>
          </div>
          <Link href="/checkin" className="btn btn-primary"><LogIn className="w-4 h-4" />Check-in board</Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="In now" value={c.inside} icon={Baby} tone="green" hint={`${c.arrived} arrived today`} />
          <StatCard label="Not arrived" value={Math.max(0, c.children - c.arrived)} icon={LogIn} tone="charcoal" hint={`of ${c.children} enrolled`} />
          <StatCard label="Gone home" value={c.home} icon={Home} tone="sky" />
          {fees ? <StatCard label="Fees overdue" value={zar(fees.overdue, true)} icon={Wallet} tone="orange" hint={`${zar(fees.due, true)} due to date`} />
            : <StatCard label="Classrooms" value={all_.length} icon={Baby} tone="gold" />}
        </div>

        {late > 0 && (
          <Link href="/checkin" className="glass p-4 flex items-start gap-3 border-2 !border-butter-300">
            <AlertTriangle className="w-5 h-5 text-butter-600 shrink-0 mt-0.5" />
            <p className="text-sm"><b>{late} child{late === 1 ? " is" : "ren are"} still here after closing ({ctx.school.closes_at}).</b> Open the check-in board to see who.</p>
          </Link>
        )}

        <Card title={mine.length ? "My classrooms" : "Classrooms right now"} action={<Link href="/classrooms" className="text-xs muted">View all</Link>}>
          {rooms.length === 0 ? <Empty title="No classrooms yet" hint={ctx.isAdmin ? "Add classrooms under Classrooms." : undefined} /> : (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Classroom</th><th>In now</th><th>Staff</th><th>Ratio</th><th /></tr></thead>
              <tbody>{rooms.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/checkin?room=${r.id}`} className="font-semibold hover:underline">{r.name}</Link><p className="text-xs muted">{ageGroupLabel(r.age_group)}</p></td>
                  <td>{r.present}<span className="muted text-xs"> / {r.children}</span></td>
                  <td className="text-sm">{r.staff.length ? r.staff.map((s) => s.name.split(" ")[0]).join(", ") : <span className="muted">None</span>}</td>
                  <td className="text-sm">1:{r.perStaff}</td>
                  <td>{r.over ? <span className="chip chip-red">Needs {r.needed - r.staff.length} more staff</span> : r.present ? <span className="chip chip-green">OK</span> : <span className="chip chip-slate">Empty</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title={<span className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-500" />Severe allergies in today</span>}>
            {severeKids.length === 0 ? <p className="text-sm muted">No child with a severe allergy is in right now.</p> : (
              <ul className="divide-line">{severeKids.map((k) => (
                <li key={k.id} className="py-2">
                  <Link href={`/children/${k.id}`} className="font-medium hover:underline">{k.first_name} {k.last_name}</Link> <span className="text-xs muted">{k.className}</span>
                  <div className="mt-1"><AllergyChips allergies={severe.filter((a) => a.learner_id === k.id)} compact /></div>
                </li>
              ))}</ul>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-butter-600" />Collected by someone not on the list</span>}>
            {unlisted.length === 0 ? <p className="text-sm muted">None in the last 7 days.</p> : (
              <ul className="divide-line">{unlisted.map((u) => (
                <li key={`${u.learner_id}${u.date}`} className="py-2 text-sm">
                  <Link href={`/children/${u.learner_id}`} className="font-medium hover:underline">{u.name}</Link>
                  <p className="text-xs muted">{fmtDate(u.date)} at {u.out_at} by {u.collected_by}</p>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>

      <aside className="space-y-6">
        <Card><MiniCalendar tr={tr} schoolId={sid} /><Agenda tr={tr} schoolId={sid} heading={tr("Agenda")} /></Card>
        <RecentMessages tr={tr} userId={ctx.user.id} card={{ title: tr("Messages"), action: <Link href="/messages" className="text-xs muted">{tr("View all")}</Link> }} />
        <NoticeList tr={tr} schoolId={sid} audiences={["all", "staff", "parents"]} card={{ title: tr("Notice board"), action: <Link href="/notices" className="text-xs muted">{tr("View all")}</Link> }} />
      </aside>
    </div>
  );
}
