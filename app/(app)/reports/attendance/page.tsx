import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today, addDays } from "@/lib/today";
import { staffClasses } from "@/lib/staff-classes";
import { Card, PageHeader, StatCard } from "@/components/ui/kit";
import { Filters, PrintButton, CsvButton } from "@/components/ui/forms";
import { Bars } from "@/components/charts";
import { CalendarCheck, AlertTriangle, Users } from "lucide-react";

export const metadata = { title: "Attendance report" };
type Row = { id: number; name: string; className: string; total: number; present: number; absent: number; late: number; excused: number };

export default async function AttendanceReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "teacher"]);
  const sp = await searchParams;
  const classes = staffClasses(ctx);
  const classId = classes.find((c) => c.id === Number(sp.class))?.id ?? (ctx.isAdmin ? 0 : classes[0]?.id ?? -1);
  const range = sp.range ?? "30";
  const to = today(), from = range === "year" ? `${ctx.school.current_year}-01-01` : addDays(to, -Number(range));
  const allowed = classes.map((c) => c.id);
  const rows = all<Row>(`
    SELECT l.id, l.first_name || ' ' || l.last_name name, c.name className, COUNT(a.id) total,
      SUM(a.status = 'P') present, SUM(a.status = 'A') absent, SUM(a.status = 'L') late, SUM(a.status = 'E') excused
    FROM learners l JOIN classes c ON c.id = l.class_id LEFT JOIN attendance a ON a.learner_id = l.id AND a.date BETWEEN ? AND ?
    WHERE l.school_id = ? AND l.status = 'Active' AND (? = 0 OR l.class_id = ?) AND l.class_id IN (${allowed.map(() => "?").join(",") || "NULL"})
    GROUP BY l.id ORDER BY c.grade, c.name, l.last_name`, from, to, ctx.schoolId, classId, classId, ...allowed);
  const rate = (r: Pick<Row, "total" | "present" | "late">) => (r.total ? Math.round(((r.present + r.late) / r.total) * 100) : null);
  const byClass = [...new Set(rows.map((r) => r.className))].map((name) => {
    const rs = rows.filter((r) => r.className === name);
    const tot = rs.reduce((a, r) => ({ total: a.total + r.total, present: a.present + r.present, late: a.late + r.late }), { total: 0, present: 0, late: 0 });
    return { name, rate: rate(tot) };
  });
  const overall = rate(rows.reduce((a, r) => ({ total: a.total + r.total, present: a.present + (r.present ?? 0), late: a.late + (r.late ?? 0) }), { total: 0, present: 0, late: 0 }));
  const chronic = rows.filter((r) => (rate(r) ?? 100) < 90);

  const csv = [["Learner", "Class", "Days recorded", "Present", "Late", "Absent", "Excused", "Rate %"], ...rows.map((r) => [r.name, r.className, r.total, r.present, r.late, r.absent, r.excused, rate(r)])];
  return (
    <>
      <PageHeader title="Attendance report" subtitle={`${fmtDate(from)} – ${fmtDate(to)}`}>
        <Filters filters={[
          { name: "class", label: "Class", value: classId || "", allLabel: ctx.isAdmin ? "Whole school" : undefined, options: classes.map((c) => ({ value: c.id, label: c.name })) },
          { name: "range", label: "Range", value: range, options: [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "year", label: "Year to date" }] },
        ]} />
        <CsvButton filename={`attendance-${from}-${to}.csv`} rows={csv} />
        <PrintButton label="Print" />
      </PageHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Overall attendance" value={overall != null ? `${overall}%` : "-"} icon={CalendarCheck} tone="sky" />
        <StatCard label="Learners" value={rows.length} icon={Users} tone="gold" />
        <StatCard label="Below 90% attendance" value={chronic.length} icon={AlertTriangle} tone="butter" hint="Follow up with parents" />
      </div>
      {byClass.length > 1 && <Card title="Attendance by class" className="mb-6"><Bars data={byClass} xKey="name" yMax={100} unit="%" series={[{ key: "rate", name: "Attendance", color: "#79d0a3" }]} /></Card>}
      <Card className="print-area">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Learner</th><th>Class</th><th>Days</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>Rate</th></tr></thead>
            <tbody>{rows.map((r) => {
              const p = rate(r);
              return <tr key={r.id}><td className="font-medium">{r.name}</td><td>{r.className}</td><td>{r.total}</td><td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td>{r.excused}</td><td className={`font-semibold ${p != null && p < 90 ? "text-rose-600" : ""}`}>{p != null ? `${p}%` : "-"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
