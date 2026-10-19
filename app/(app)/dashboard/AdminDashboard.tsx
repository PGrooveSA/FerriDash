import Link from "next/link";
import { Users, GraduationCap, UsersRound, Wallet, Building2, Award } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, fmtDate } from "@/lib/format";
import { MONTHS, today } from "@/lib/today";
import { classResults } from "@/lib/results";
import { Card, StatCard } from "@/components/ui/kit";
import { Donut, Bars, AreaTrend } from "@/components/charts";
import { MiniCalendar, Agenda, RecentMessages, NoticeList } from "@/components/widgets";
import { SchoolBanner } from "@/components/SchoolCrest";

export default function AdminDashboard({ ctx }: { ctx: Ctx }) {
  const sid = ctx.schoolId, year = ctx.school.current_year;
  const c = get<{ learners: number; boys: number; girls: number; teachers: number; parents: number }>(`
    SELECT (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status='Active') learners,
           (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status='Active' AND gender='Male') boys,
           (SELECT COUNT(*) FROM learners WHERE school_id = ?1 AND status='Active' AND gender='Female') girls,
           (SELECT COUNT(*) FROM teachers WHERE school_id = ?1 AND status = 'Active') teachers,
           (SELECT COUNT(*) FROM users WHERE school_id = ?1 AND role='parent') parents`, sid)!;
  const fees = get<{ billed: number; paid: number }>(`SELECT
      (SELECT COALESCE(SUM(tuition+activities+other),0) FROM invoices WHERE school_id = ?1 AND year = ?2) billed,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.school_id = ?1 AND i.year = ?2) paid`, sid, year)!;

  // Attendance for the last 5 recorded school days
  const att = all<{ date: string; present: number; absent: number }>(`
    SELECT date, ROUND(100.0 * SUM(status IN ('P','L')) / COUNT(*)) present, ROUND(100.0 * SUM(status IN ('A','E')) / COUNT(*)) absent
    FROM attendance WHERE school_id = ? AND date <= ? GROUP BY date ORDER BY date DESC LIMIT 5`, sid, today()).reverse()
    .map((r) => ({ ...r, day: new Date(r.date + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" }) }));

  // Money in vs out per month
  const income = all<{ m: string; v: number }>("SELECT substr(paid_on,6,2) m, SUM(amount) v FROM payments WHERE school_id = ? AND paid_on LIKE ? GROUP BY m", sid, `${year}-%`);
  const expense = all<{ m: string; v: number }>("SELECT substr(paid_on,6,2) m, SUM(amount) v FROM expenses WHERE school_id = ? AND paid_on LIKE ? GROUP BY m", sid, `${year}-%`);
  const money = MONTHS.map((name, i) => {
    const key = String(i + 1).padStart(2, "0");
    return { name, income: income.find((r) => r.m === key)?.v ?? 0, expense: expense.find((r) => r.m === key)?.v ?? 0 };
  });

  // Academic performance per class for the latest completed term
  const term = Math.max(1, ctx.school.current_term - 1);
  const perf = all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade", sid, year).map((cl) => {
    const cr = classResults(sid, cl.id, year, term);
    const avgs = cr?.learners.map((l) => l.average).filter((v): v is number => v != null) ?? [];
    const pass = cr?.learners.filter((l) => l.average != null && l.average >= 50).length ?? 0;
    return { name: cl.name, average: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null, pass: avgs.length ? Math.round((pass / avgs.length) * 100) : null };
  });

  const pending = get<{ n: number }>("SELECT COUNT(*) n FROM result_sets WHERE school_id = ? AND year = ? AND status = 'submitted'", sid, year)!.n;
  const platform = ctx.user.role === "super_admin"
    ? get<{ schools: number; learners: number; provinces: number }>("SELECT (SELECT COUNT(*) FROM schools) schools, (SELECT COUNT(*) FROM learners WHERE status='Active') learners, (SELECT COUNT(DISTINCT province) FROM schools) provinces")
    : null;

  return (
    <div className="space-y-6">
      <SchoolBanner school={ctx.school}>
        <div className="text-right">
          <p className="text-sm font-semibold">{fmtDate(today(), { weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="text-xs muted">EMIS {ctx.school.emis_number} · Quintile {ctx.school.quintile}</p>
          {ctx.isAdmin && !ctx.school.logo_updated_at && <Link href="/settings" className="btn btn-ghost btn-sm mt-2">Add school logo</Link>}
        </div>
      </SchoolBanner>
      {platform && (
        <div className="glass p-5 flex flex-wrap items-center gap-6 bg-gradient-to-r from-gold-200/60 to-brand-200/50 dark:from-gold-500/15 dark:to-brand-500/10">
          <Building2 className="w-8 h-8" />
          <div><p className="text-sm muted">Platform</p><p className="font-semibold">{platform.schools} schools · {platform.learners} learners · {platform.provinces} provinces</p></div>
          <p className="text-sm muted">You are viewing <b className="text-[var(--ink)]">{ctx.school.name}</b>. Use the school switcher above to change school.</p>
          <Link href="/schools" className="btn btn-ghost btn-sm ml-auto">Manage schools</Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
        <div className="space-y-6 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Learners" value={c.learners.toLocaleString("en-ZA")} icon={Users} tone="sky" hint={`${ctx.school.school_type} · Quintile ${ctx.school.quintile}`} />
            <StatCard label="Educators" value={c.teachers} icon={GraduationCap} tone="gold" hint={`Ratio 1:${c.teachers ? Math.round(c.learners / c.teachers) : 0}`} />
            <StatCard label="Parents / Guardians" value={c.parents} icon={UsersRound} tone="green" />
            {ctx.school.fee_paying
              ? <StatCard label="Fees collected" value={zar(fees.paid, true)} icon={Wallet} tone="orange" hint={`${fees.billed ? Math.round((fees.paid / fees.billed) * 100) : 0}% of ${zar(fees.billed, true)}`} />
              : <StatCard label="No-fee school" value="R 0" icon={Wallet} tone="green" hint="Funded via norms & standards" />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
            <Card title="Learners">
              <Donut data={[{ name: "Boys", value: c.boys, color: "#7dd3fc" }, { name: "Girls", value: c.girls, color: "#ffdf55" }]} center={String(c.learners)} sub="enrolled" />
              <div className="grid grid-cols-2 mt-4 text-center">
                <div><span className="inline-block w-3 h-3 rounded-full bg-sky-300" /><p className="text-xl font-bold">{c.boys}</p><p className="text-xs muted">Boys ({c.learners ? Math.round((c.boys / c.learners) * 100) : 0}%)</p></div>
                <div><span className="inline-block w-3 h-3 rounded-full bg-butter-300" /><p className="text-xl font-bold">{c.girls}</p><p className="text-xs muted">Girls ({c.learners ? Math.round((c.girls / c.learners) * 100) : 0}%)</p></div>
              </div>
            </Card>
            <Card title="Attendance" action={<Link href="/attendance" className="text-xs muted hover:text-[var(--ink)]">View register</Link>}>
              <Bars data={att} xKey="day" yMax={100} unit="%" series={[{ key: "present", name: "Present", color: "#6ee7b7" }, { key: "absent", name: "Absent", color: "#ffa86d" }]} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6">
            <Card title={ctx.school.fee_paying ? "Income vs expenses" : "Expenses"}>
              <AreaTrend money data={money} xKey="name" series={ctx.school.fee_paying ? [{ key: "income", name: "Fee income", color: "#34d399" }, { key: "expense", name: "Expenses", color: "#fcca1c" }] : [{ key: "expense", name: "Expenses", color: "#fcca1c" }]} />
            </Card>
            <div className="grid gap-6">
              <Link href="/results/moderation" className="glass p-5 block hover:scale-[1.01] transition-transform">
                <Award className="w-8 h-8 text-gold-500" />
                <p className="text-3xl font-bold mt-3">{pending}</p>
                <p className="muted text-sm">Mark sheets awaiting moderation</p>
              </Link>
              <div className="glass p-5">
                <p className="text-sm muted">Current term</p>
                <p className="text-3xl font-bold">Term {ctx.school.current_term}</p>
                <p className="text-sm muted">{year} academic year · {ctx.school.province}</p>
              </div>
            </div>
          </div>

          <Card title={`Academic performance by class · Term ${term}`} action={<Link href="/results/analysis" className="text-xs muted hover:text-[var(--ink)]">Analysis</Link>}>
            <Bars data={perf} xKey="name" yMax={100} unit="%" series={[{ key: "average", name: "Class average", color: "#38bdf8" }, { key: "pass", name: "Learners averaging 50%+", color: "#6ee7b7" }]} />
            <p className="text-xs muted mt-2">Averages use CAPS phase weighting: School-Based Assessment blended with examinations.</p>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card><MiniCalendar schoolId={sid} /><h3 className="font-semibold mt-6 mb-3">Agenda</h3><Agenda schoolId={sid} /></Card>
          <Card title="Messages" action={<Link href="/messages" className="text-xs muted">View all</Link>}><RecentMessages userId={ctx.user.id} /></Card>
          <Card title="Notice board" action={<Link href="/notices" className="text-xs muted">View all</Link>}><NoticeList schoolId={sid} audiences={["all", "staff", "learners", "parents"]} /></Card>
        </aside>
      </div>
    </div>
  );
}
