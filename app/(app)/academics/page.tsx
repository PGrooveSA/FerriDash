import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { gradeLabel } from "@/lib/format";
import { phaseOf } from "@/lib/caps";
import { Card, PageHeader, TableWrap, Empty } from "@/components/ui/kit";
import { FormDialog, DeleteButton, type Field } from "@/components/ui/forms";
import { saveClass, deleteClass, saveSubject, deleteSubject, addClassSubject, assignTeacher, removeClassSubject } from "@/app/actions/academics";

export const metadata = { title: "Classes & Subjects" };

const CATEGORIES = [
  { value: "HL", label: "Home Language" }, { value: "FAL", label: "First Additional Language" }, { value: "SAL", label: "Second Additional Language" },
  { value: "MATH", label: "Mathematics" }, { value: "MLIT", label: "Mathematical Literacy" }, { value: "LO", label: "Life Orientation / Life Skills" }, { value: "OTHER", label: "Other subject" },
];
const GRADES = Array.from({ length: 13 }, (_, g) => ({ value: g, label: gradeLabel(g) }));

export default async function AcademicsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const tab = sp.tab ?? "classes";
  const teachers = all<{ id: number; name: string }>("SELECT t.id, COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name name FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.school_id = ? ORDER BY u.last_name", ctx.schoolId);
  const teacherOpts = teachers.map((t) => ({ value: t.id, label: t.name }));
  const classes = all<{ id: number; grade: number; name: string; room: string | null; class_teacher_id: number | null; teacher: string | null; learners: number; subjects: number }>(`
    SELECT c.*, (SELECT COALESCE(u.title || ' ', '') || u.last_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = c.class_teacher_id) teacher,
      (SELECT COUNT(*) FROM learners l WHERE l.class_id = c.id AND l.status = 'Active') learners, (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id) subjects
    FROM classes c WHERE c.school_id = ? AND c.year = ? ORDER BY c.grade, c.name`, ctx.schoolId, ctx.school.current_year);
  const subjects = all<{ id: number; name: string; code: string | null; category: string; used: number }>("SELECT s.*, (SELECT COUNT(*) FROM class_subjects cs WHERE cs.subject_id = s.id) used FROM subjects s WHERE s.school_id = ? ORDER BY s.name", ctx.schoolId);

  const classFields = (c?: (typeof classes)[number]): Field[] => [
    { name: "grade", label: "Grade", type: "select", required: true, options: GRADES, defaultValue: c?.grade, half: true },
    { name: "name", label: "Class name", required: true, defaultValue: c?.name, placeholder: "e.g. 10B", half: true },
    { name: "class_teacher_id", label: "Class (register) teacher", type: "select", options: teacherOpts, defaultValue: c?.class_teacher_id, half: true },
    { name: "room", label: "Room", defaultValue: c?.room, half: true },
  ];
  const subjectFields = (s?: (typeof subjects)[number]): Field[] => [
    { name: "name", label: "Subject name", required: true, defaultValue: s?.name, placeholder: "e.g. Physical Sciences" },
    { name: "code", label: "Code", defaultValue: s?.code, half: true },
    { name: "category", label: "CAPS category", type: "select", required: true, options: CATEGORIES, defaultValue: s?.category ?? "OTHER", half: true, help: "Used for promotion rules." },
  ];

  const selectedClass = Number(sp.class) || classes[0]?.id;
  const allocation = selectedClass ? all<{ id: number; subject: string; category: string; teacher_id: number | null }>("SELECT cs.id, s.name subject, s.category, cs.teacher_id FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.class_id = ? ORDER BY s.name", selectedClass) : [];

  const tabs = [["classes", "Classes"], ["subjects", "Subjects"], ["allocation", "Teaching allocation"]];
  return (
    <>
      <PageHeader title="Classes & Subjects" subtitle={`${ctx.school.current_year} academic year`}>
        {tab === "classes" && <FormDialog title="Add class" triggerLabel="Add class" fields={classFields()} action={saveClass} />}
        {tab === "subjects" && <FormDialog title="Add subject" triggerLabel="Add subject" fields={subjectFields()} action={saveSubject} />}
      </PageHeader>
      <div className="glass-strong inline-flex rounded-full p-1 mb-5">
        {tabs.map(([k, label]) => <Link key={k} href={`/academics?tab=${k}`} className={`px-4 py-2 rounded-full text-sm font-medium ${tab === k ? "bg-gradient-to-r from-brand-200 to-gold-200 dark:from-brand-500/30 dark:to-gold-500/30" : "muted"}`}>{label}</Link>)}
      </div>

      {tab === "classes" && (
        <Card>
          {classes.length === 0 ? <Empty title="No classes yet" /> : (
            <TableWrap><table className="table">
              <thead><tr><th>Class</th><th>Grade</th><th>Phase</th><th>Class teacher</th><th>Room</th><th>Learners</th><th>Subjects</th><th className="text-right">Action</th></tr></thead>
              <tbody>{classes.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.name}</td><td>{gradeLabel(c.grade)}</td><td><span className="chip chip-gold">{phaseOf(c.grade)}</span></td>
                  <td>{c.teacher ?? "-"}</td><td>{c.room ?? "-"}</td>
                  <td><Link className="hover:underline" href={`/learners?class=${c.id}`}>{c.learners}</Link></td>
                  <td><Link className="hover:underline" href={`/academics?tab=allocation&class=${c.id}`}>{c.subjects}</Link></td>
                  <td><div className="flex justify-end gap-1.5"><FormDialog trigger="edit" title={`Edit ${c.name}`} fields={classFields(c)} hidden={{ id: c.id }} action={saveClass} /><DeleteButton action={deleteClass.bind(null, c.id)} label={c.name} /></div></td>
                </tr>))}
              </tbody>
            </table></TableWrap>
          )}
        </Card>
      )}

      {tab === "subjects" && (
        <Card>
          <TableWrap><table className="table">
            <thead><tr><th>Subject</th><th>Code</th><th>CAPS category</th><th>Classes</th><th className="text-right">Action</th></tr></thead>
            <tbody>{subjects.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td><td className="font-mono text-xs">{s.code}</td>
                <td><span className="chip chip-info">{CATEGORIES.find((c) => c.value === s.category)?.label}</span></td><td>{s.used}</td>
                <td><div className="flex justify-end gap-1.5"><FormDialog trigger="edit" title={`Edit ${s.name}`} fields={subjectFields(s)} hidden={{ id: s.id }} action={saveSubject} /><DeleteButton action={deleteSubject.bind(null, s.id)} label={s.name} /></div></td>
              </tr>))}
            </tbody>
          </table></TableWrap>
        </Card>
      )}

      {tab === "allocation" && (
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
          <Card title="Classes">
            <ul className="space-y-1">{classes.map((c) => (
              <li key={c.id}><Link href={`/academics?tab=allocation&class=${c.id}`} className={`block rounded-xl px-3 py-2 text-sm ${c.id === selectedClass ? "bg-brand-200/70 dark:bg-brand-500/25 font-semibold" : "hover:bg-white/50 dark:hover:bg-white/5"}`}>{c.name} <span className="muted">· {gradeLabel(c.grade)}</span></Link></li>
            ))}</ul>
          </Card>
          <Card title={`Subjects & educators · ${classes.find((c) => c.id === selectedClass)?.name ?? ""}`}
            action={selectedClass ? <FormDialog title="Add subject to class" triggerLabel="Add subject" action={addClassSubject} hidden={{ class_id: selectedClass }}
              fields={[{ name: "subject_id", label: "Subject", type: "select", required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })) }, { name: "teacher_id", label: "Educator", type: "select", options: teacherOpts }]} /> : null}>
            <TableWrap><table className="table">
              <thead><tr><th>Subject</th><th>Category</th><th>Educator</th><th></th></tr></thead>
              <tbody>{allocation.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.subject}</td><td><span className="chip chip-slate">{a.category}</span></td>
                  <td>
                    <form action={assignTeacher.bind(null, a.id)} className="flex gap-2">
                      <select name="teacher_id" defaultValue={a.teacher_id ?? ""} className="input !py-1.5 !w-56" aria-label={`Educator for ${a.subject}`}>
                        <option value="">Unallocated</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm">Save</button>
                    </form>
                  </td>
                  <td className="text-right"><DeleteButton action={removeClassSubject.bind(null, a.id)} label={`${a.subject} from this class`} /></td>
                </tr>))}
              </tbody>
            </table></TableWrap>
          </Card>
        </div>
      )}
    </>
  );
}
