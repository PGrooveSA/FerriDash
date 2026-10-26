import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireCtx, ownLearnerIds, type Ctx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today, addDays, weekStart, MONTHS } from "@/lib/today";
import { attendanceSummary, termDates } from "@/lib/results";
import { Card, PageHeader, Empty, StatCard } from "@/components/ui/kit";
import { Filters } from "@/components/ui/forms";
import AttendanceGrid, { StatusDot } from "./AttendanceGrid";
import { CalendarCheck, CalendarX, Clock } from "lucide-react";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  if (ctx.user.role === "learner" || ctx.user.role === "parent") return <FamilyAttendance ctx={ctx} sp={sp} />;

  const classes = ctx.isAdmin
    ? (await all<{ id: number; name: string }>("SELECT id, name FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, ctx.school.current_year))
    : (await all<{ id: number; name: string }>("SELECT id, name FROM classes WHERE year = ?2 AND (class_teacher_id = ?1 OR id IN (SELECT class_id FROM class_subjects WHERE teacher_id = ?1)) ORDER BY grade, name", ctx.teacherId, ctx.school.current_year));
  const homeroom = ctx.teacherId ? (await get<{ id: number }>("SELECT id FROM classes WHERE class_teacher_id = ?", ctx.teacherId))?.id : undefined;
  const classId = Number(sp.class) || homeroom || classes[0]?.id;
  if (!classId) return <Card><Empty title="No classes allocated to you" /></Card>;

  const t = today();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? weekStart(sp.from) : addDays(weekStart(t), -7);
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(from, i), d = new Date(date + "T00:00:00Z");
    return { date, label: date.slice(8), weekday: d.toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" }), weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
  });
  const learners = await all<{ id: number; name: string }>("SELECT id, first_name || ' ' || last_name name FROM learners WHERE class_id = ? AND status = 'Active' ORDER BY last_name, first_name", classId);
  const marks = Object.fromEntries((await all<{ learner_id: number; date: string; status: "P" | "A" | "L" | "E" }>(
          "SELECT a.learner_id, a.date, a.status FROM attendance a JOIN learners l ON l.id = a.learner_id WHERE l.class_id = ? AND a.date BETWEEN ? AND ?", classId, days[0].date, days[13].date))
    .map((m) => [`${m.learner_id}:${m.date}`, m.status]));
  // Registers can be completed for today and the past 14 days; future days are locked.
  const editableDays = days.filter((d) => d.date <= t && d.date >= addDays(t, -14)).map((d) => d.date);
  const [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];

  return (
    <>
      <PageHeader title="Attendance register" subtitle={`${fmtDate(days[0].date)} – ${fmtDate(days[13].date)}`}>
        <Filters filters={[{ name: "class", label: "Class", value: classId, options: classes.map((c) => ({ value: c.id, label: `Class ${c.name}` })) }]} />
        <div className="glass-strong rounded-full flex items-center p-1">
          <Link className="icon-btn !w-8 !h-8" aria-label="Previous fortnight" href={`/attendance?class=${classId}&from=${addDays(from, -14)}`}><ChevronLeft className="w-4 h-4" /></Link>
          <span className="px-3 text-sm font-medium">{MONTHS[m - 1]} {y}</span>
          <Link className="icon-btn !w-8 !h-8" aria-label="Next fortnight" href={`/attendance?class=${classId}&from=${addDays(from, 14)}`}><ChevronRight className="w-4 h-4" /></Link>
        </div>
        <Link href={`/attendance?class=${classId}`} className="btn btn-ghost btn-sm">This week</Link>
      </PageHeader>
      <Card>
        {learners.length ? <AttendanceGrid key={`${classId}-${from}`} classId={classId} days={days} learners={learners} initial={marks} editableDays={editableDays} /> : <Empty title="No learners in this class" />}
      </Card>
    </>
  );
}

async function FamilyAttendance({ ctx, sp }: { ctx: Ctx; sp: Record<string, string> }) {
  const ids = (await ownLearnerIds(ctx)) ?? [];
  const kids = ids.length ? (await all<{ id: number; name: string }>(`SELECT id, first_name || ' ' || last_name name FROM learners WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids)) : [];
  const learnerId = ids.includes(Number(sp.learner)) ? Number(sp.learner) : ids[0];
  if (!learnerId) return <Card><Empty title="No learner linked" /></Card>;
  const yd = await termDates(ctx.schoolId, ctx.school.current_year, "year");
  const sum = await attendanceSummary(learnerId, yd.start, today());
  const rows = await all<{ date: string; status: "P" | "A" | "L" | "E" }>("SELECT date, status FROM attendance WHERE learner_id = ? ORDER BY date DESC", learnerId);
  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) { const k = r.date.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k)!.push(r); }

  return (
    <>
      <PageHeader title="Attendance" subtitle={kids.find((k) => k.id === learnerId)?.name}>
        {kids.length > 1 && <Filters filters={[{ name: "learner", label: "Child", value: learnerId, options: kids.map((k) => ({ value: k.id, label: k.name })) }]} />}
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Attendance rate" value={sum.rate != null ? `${sum.rate}%` : "-"} icon={CalendarCheck} tone="sky" />
        <StatCard label="Days present" value={sum.present ?? 0} icon={CalendarCheck} tone="green" />
        <StatCard label="Days absent" value={sum.absent ?? 0} icon={CalendarX} tone="gold" hint={`${sum.excused ?? 0} excused`} />
        <StatCard label="Late arrivals" value={sum.late ?? 0} icon={Clock} tone="butter" />
      </div>
      {[...byMonth.entries()].map(([month, list]) => (
        <Card key={month} title={fmtDate(month + "-01", { month: "long", year: "numeric" })} className="mb-6">
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {[...list].reverse().map((r) => (
              <div key={r.date} className="glass-strong rounded-2xl p-2 text-center">
                <p className="text-[0.65rem] muted">{fmtDate(r.date, { weekday: "short" })}</p>
                <p className="text-sm font-semibold mb-1">{r.date.slice(8)}</p>
                <StatusDot s={r.status} />
              </div>
            ))}
          </div>
        </Card>
      ))}
      {byMonth.size === 0 && <Card><Empty title="No attendance recorded yet" /></Card>}
    </>
  );
}
