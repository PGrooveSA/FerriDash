import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Briefcase } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { avatarUrl, fmtDate, fullName, gradeLabel } from "@/lib/format";
import { Card, PageHeader, StatusChip, Empty } from "@/components/ui/kit";
import Avatar from "@/components/ui/Avatar";

export const metadata = { title: "Teacher record" };

type Teacher = {
  id: number; user_id: number; title: string | null; first_name: string; last_name: string; email: string; phone: string | null; avatar_updated_at: string | null;
  staff_number: string | null; persal_number: string | null; sace_number: string | null; post_level: string | null; employed_since: string | null;
  status: string; left_on: string | null; exit_note: string | null;
};
type Row = { year: number; className: string; grade: number; subject: string | null; register: number; until: string | null; handedTo: string | null };

export default async function TeacherRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(["school_admin"]);
  const id = Number((await params).id);
  const t = id ? (await get<Teacher>(`SELECT t.*, u.title, u.first_name, u.last_name, u.email, u.phone, u.avatar_updated_at
    FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.school_id = ?`, id, ctx.schoolId)) : undefined;
  if (!t) notFound();

  // Everything they taught: subjects and register classes still allocated to them (this and past years),
  // plus what they handed over when they left.
  const name = "COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name";
  const rows = await all<Row>(`
    SELECT c.year, c.name className, c.grade, s.name subject, 0 register, NULL until, NULL handedTo
      FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects s ON s.id = cs.subject_id WHERE cs.teacher_id = ?1
    UNION ALL SELECT c.year, c.name, c.grade, NULL, 1, NULL, NULL FROM classes c WHERE c.class_teacher_id = ?1
    UNION ALL SELECT c.year, c.name, c.grade, s.name, h.register, h.ended_on,
      (SELECT ${name} FROM teachers t2 JOIN users u ON u.id = t2.user_id WHERE t2.id = h.handed_to)
      FROM teaching_handovers h JOIN classes c ON c.id = h.class_id LEFT JOIN subjects s ON s.id = h.subject_id WHERE h.teacher_id = ?1
    ORDER BY 1 DESC, 3, 2, 5 DESC, 4`, id);
  const years = [...new Set(rows.map((r) => r.year))];
  const active = t.status === "Active";

  return (
    <>
      <PageHeader title="Teacher record" subtitle="Service details and teaching history, kept after a teacher resigns, transfers or retires.">
        <Link href={active ? "/teachers" : "/teachers?status=former"} className="btn btn-ghost">All teachers</Link>
      </PageHeader>

      <div className="grid grid-cols-1 xl:grid-cols-[22rem_1fr] gap-6">
        <Card>
          <div className="text-center">
            <div className="inline-block"><Avatar first={t.first_name} last={t.last_name} size={104} photo={avatarUrl(t.user_id, t.avatar_updated_at)} /></div>
            <h2 className="text-xl font-semibold mt-3">{fullName(t, true)}</h2>
            <p className="text-sm muted">{t.email}</p>
            <div className="flex justify-center gap-2 mt-2"><StatusChip status={t.status} /><span className="chip chip-gold">{t.post_level}</span></div>
            {!active && <p className="text-sm mt-2">Left on {fmtDate(t.left_on)}{t.exit_note ? <><br /><span className="muted">{t.exit_note}</span></> : null}</p>}
          </div>
          <dl className="text-sm mt-6 space-y-2.5">
            {[["Staff number", t.staff_number], ["PERSAL number", t.persal_number], ["SACE registration", t.sace_number], ["Phone", t.phone],
              ["Employed since", fmtDate(t.employed_since)], ["Last working day", active ? "Still employed" : fmtDate(t.left_on)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="muted">{k}</dt><dd className="text-right">{v || "-"}</dd></div>
            ))}
          </dl>
          {!active && <p className="text-xs muted mt-4 flex gap-1.5"><Briefcase className="w-3.5 h-3.5 shrink-0 mt-0.5" />Login switched off. Marks, report cards and attendance they captured are kept.</p>}
        </Card>

        <Card title={<span className="flex items-center gap-2"><BookOpen className="w-5 h-5" />Teaching history</span>}>
          {rows.length === 0 ? <Empty title="No teaching allocated" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Year</th><th>Class</th><th>Subject / role</th><th>Until</th><th>Handed over to</th></tr></thead>
                <tbody>{years.flatMap((y) => rows.filter((r) => r.year === y).map((r, i) => (
                  <tr key={`${y}-${i}`}>
                    <td className="font-semibold">{i === 0 ? <>{y}{y === ctx.school.current_year && <span className="chip chip-info ml-2">current</span>}</> : ""}</td>
                    <td>{r.className} <span className="muted text-xs">· {gradeLabel(r.grade)}</span></td>
                    <td>{r.register ? <span className="chip chip-butter">Register teacher</span> : r.subject}</td>
                    <td className="text-sm">{r.until ? fmtDate(r.until) : y < ctx.school.current_year ? <span className="muted">End of year</span> : <span className="muted">Now</span>}</td>
                    <td className="text-sm">{r.until ? (r.handedTo ?? <span className="muted">Unallocated</span>) : <span className="muted">-</span>}</td>
                  </tr>)))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
