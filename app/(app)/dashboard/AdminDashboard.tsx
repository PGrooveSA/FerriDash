import Link from "next/link";
import { Users, GraduationCap, UsersRound, Wallet, Building2, Award } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, fmtDate, bannerUrl } from "@/lib/format";
import { bannerStyle } from "@/components/ui/banner";
import { tFor } from "@/lib/i18n";
import { MONTHS, today } from "@/lib/today";
import { classResults } from "@/lib/results";
import { Card, StatCard } from "@/components/ui/kit";
import { Donut, Bars, AreaTrend } from "@/components/charts";
import { MiniCalendar, Agenda, RecentMessages, NoticeList } from "@/components/widgets";
import { SchoolBanner } from "@/components/SchoolCrest";

export default async function AdminDashboard({ ctx }: { ctx: Ctx }) {
  const tr = tFor(ctx.user);
  const sid = ctx.schoolId, year = ctx.school.current_year;
  const c = (await get<{ learners: number; boys: number; girls: number; teachers: number; parents: number }>(`
    SELECT (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status='Active') learners,
           (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status='Active' AND gender='Male') boys,
           (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status='Active' AND gender='Female') girls,
           (SELECT COUNT(*) FROM teachers WHERE school_id = ?1 AND status = 'Active') teachers,
           (SELECT COUNT(*) FROM users WHERE school_id = ?1 AND role='parent') parents`, sid))!;
  const fees = (await get<{ billed: number; paid: number }>(`SELECT
      (SELECT COALESCE(SUM(tuition+activities+other),0) FROM invoices WHERE school_id = ?1 AND year = ?2) billed,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.school_id = ?1 AND i.year = ?2) paid`, sid, year))!;

  // Attendance for the last 5 recorded school days
  const att = (await all<{ date: string; present: number; absent: number }>(`
    SELECT date, ROUND(100.0 * SUM(status IN ('P','L')) / COUNT(*)) present, ROUND(100.0 * SUM(status IN ('A','E')) / COUNT(*)) absent
    FROM attendance WHERE school_id = ? AND date <= ? GROUP BY date ORDER BY date DESC LIMIT 5`, sid, today())).reverse()
    .map((r) => ({ ...r, day: new Date(r.date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" }) }));

  // Money in vs out per month
  const income = await all<{ m: string; v: number }>("SELECT substr(paid_on,6,2) m, SUM(amount) v FROM payments WHERE school_id = ? AND paid_on LIKE ? GROUP BY m", sid, `${year}-%`);
  const expense = await all<{ m: string; v: number }>("SELECT substr(paid_on,6,2) m, SUM(amount) v FROM expenses WHERE school_id = ? AND paid_on LIKE ? GROUP BY m", sid, `${year}-%`);
  const money = MONTHS.map((name, i) => {
    const key = String(i + 1).padStart(2, "0");
    return { name, income: income.find((r) => r.m === key)?.v ?? 0, expense: expense.find((r) => r.m === key)?.v ?? 0 };
  });

  // Academic performance per class for the latest completed term
  const term = Math.max(1, ctx.school.current_term - 1);
  const perf = (await Promise.all((await all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade", sid, year)).map(async (cl) => {
      const cr = await classResults(sid, cl.id, year, term);
      const avgs = cr?.learners.map((l) => l.average).filter((v): v is number => v != null) ?? [];
      const pass = cr?.learners.filter((l) => l.average != null && l.average >= 50).length ?? 0;
      return { name: cl.name, average: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null, pass: avgs.length ? Math.round((pass / avgs.length) * 100) : null };
    })));

  const pending = (await get<{ n: number }>("SELECT COUNT(*) n FROM result_sets WHERE school_id = ? AND year = ? AND status = 'submitted'", sid, year))!.n;

  return (
    <div className="space-y-6">
      <SchoolBanner school={ctx.school} tr={tr} cover={bannerStyle(bannerUrl(ctx.user.id, ctx.user.banner_updated_at))}>
        <div className="text-right">
          <p className="text-sm font-semibold">{fmtDate(today(), { weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="text-xs muted">EMIS {ctx.school.emis_number} · Quintile {ctx.school.quintile}</p>
          {ctx.isAdmin && !ctx.school.logo_updated_at && <Link href="/settings" className="btn btn-ghost btn-sm mt-2">{tr("Add school logo")}</Link>}
        </div>
      </SchoolBanner>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
        <div className="space-y-6 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={tr("Learners")} value={c.learners.toLocaleString("en-ZA")} icon={Users} tone="sky" hint={`${ctx.school.school_type} · Quintile ${ctx.school.quintile}`} />
            <StatCard label={tr("Educators")} value={c.teachers} icon={GraduationCap} tone="gold" hint={`${tr("Ratio")} 1:${c.teachers ? Math.round(c.learners / c.teachers) : 0}`} />
            <StatCard label={tr("Parents / Guardians")} value={c.parents} icon={UsersRound} tone="green" />
            {ctx.school.fee_paying
              ? <StatCard label={tr("Fees collected")} value={zar(fees.paid, true)} icon={Wallet} tone="orange" hint={tr("{pct}% of {total}", { pct: fees.billed ? Math.round((fees.paid / fees.billed) * 100) : 0, total: zar(fees.billed, true) })} />
              : <StatCard label={tr("No-fee school")} value="R 0" icon={Wallet} tone="green" hint={tr("Funded via norms & standards")} />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
            <Card title={tr("Learners")}>
              <Donut data={[{ name: tr("Boys"), value: c.boys, color: "#7dd3fc" }, { name: tr("Girls"), value: c.girls, color: "#ffdf55" }]} center={String(c.learners)} sub={tr("enrolled")} />
              <div className="grid grid-cols-2 mt-4 text-center">
                <div><span className="inline-block w-3 h-3 rounded-full bg-sky-300" /><p className="text-xl font-bold">{c.boys}</p><p className="text-xs muted">Boys ({c.learners ? Math.round((c.boys / c.learners) * 100) : 0}%)</p></div>
                <div><span className="inline-block w-3 h-3 rounded-full bg-butter-300" /><p className="text-xl font-bold">{c.girls}</p><p className="text-xs muted">Girls ({c.learners ? Math.round((c.girls / c.learners) * 100) : 0}%)</p></div>
              </div>
            </Card>
            <Card title={tr("Attendance")} action={<Link href="/attendance" className="text-xs muted hover:text-[var(--ink)]">{tr("View register")}</Link>}>
              <Bars data={att} xKey="day" yMax={100} unit="%" series={[{ key: "present", name: tr("Present"), color: "#6ee7b7" }, { key: "absent", name: tr("Absent"), color: "#ffa86d" }]} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6">
            <Card title={ctx.school.fee_paying ? tr("Income vs expenses") : tr("Expenses")}>
              <AreaTrend money data={money} xKey="name" series={ctx.school.fee_paying ? [{ key: "income", name: tr("Fee income"), color: "#34d399" }, { key: "expense", name: tr("Expenses"), color: "#fcca1c" }] : [{ key: "expense", name: tr("Expenses"), color: "#fcca1c" }]} />
            </Card>
            <div className="grid gap-6">
              <Link href="/results/moderation" className="glass p-5 block hover:scale-[1.01] transition-transform">
                <Award className="w-8 h-8 text-gold-500" />
                <p className="text-3xl font-bold mt-3">{pending}</p>
                <p className="muted text-sm">{tr("Mark sheets awaiting moderation")}</p>
              </Link>
              <div className="glass p-5">
                <p className="text-sm muted">{tr("Current term")}</p>
                <p className="text-3xl font-bold">{tr("Term {n}", { n: ctx.school.current_term })}</p>
                <p className="text-sm muted">{tr("{year} academic year", { year })} · {ctx.school.province}</p>
              </div>
            </div>
          </div>

          <Card title={tr("Academic performance by class · Term {n}", { n: term })} action={<Link href="/results/analysis" className="text-xs muted hover:text-[var(--ink)]">{tr("Analysis")}</Link>}>
            <Bars data={perf} xKey="name" yMax={100} unit="%" series={[{ key: "average", name: tr("Class average"), color: "#38bdf8" }, { key: "pass", name: tr("Learners averaging 50%+"), color: "#6ee7b7" }]} />
            <p className="text-xs muted mt-2">{tr("Averages use CAPS phase weighting: School-Based Assessment blended with examinations.")}</p>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card><MiniCalendar tr={tr} schoolId={sid} /><h3 className="font-semibold mt-6 mb-3">{tr("Agenda")}</h3><Agenda tr={tr} schoolId={sid} /></Card>
          <Card title={tr("Messages")} action={<Link href="/messages" className="text-xs muted">{tr("View all")}</Link>}><RecentMessages tr={tr} userId={ctx.user.id} /></Card>
          <Card title={tr("Notice board")} action={<Link href="/notices" className="text-xs muted">{tr("View all")}</Link>}><NoticeList tr={tr} schoolId={sid} audiences={["all", "staff", "learners", "parents"]} /></Card>
        </aside>
      </div>
    </div>
  );
}
