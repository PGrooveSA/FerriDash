import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { gradeLabel, fmtDate } from "@/lib/format";
import { Card, PageHeader, Pager, TableWrap, Empty, StatusChip, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { saveLearner, deleteLearner } from "@/app/actions/people";

export const metadata = { title: "Learners" };
const PER_PAGE = 12;
const LANGS = ["English", "Afrikaans", "isiZulu", "isiXhosa", "Sepedi", "Setswana", "Sesotho", "Xitsonga", "siSwati", "Tshivenda", "isiNdebele", "SA Sign Language"];

type L = { id: number; first_name: string; last_name: string; admission_number: string; id_number: string | null; gender: string | null; date_of_birth: string | null; class_id: number | null; className: string | null; grade: number | null; home_language: string | null; address: string | null; status: string; parents: string | null; has_login: number };

export default async function LearnersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "teacher"]);
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1), classId = Number(sp.class) || 0;
  // Educators only see learners in classes they teach.
  const scope = ctx.user.role === "teacher" ? "AND l.class_id IN (SELECT class_id FROM class_subjects WHERE teacher_id = ?4 UNION SELECT id FROM classes WHERE class_teacher_id = ?4)" : "AND ?4 IS NULL";
  const where = `l.school_id = ?1 AND (?2 = 0 OR l.class_id = ?2) AND (?3 = '' OR l.first_name || ' ' || l.last_name LIKE '%' || ?3 || '%' OR l.admission_number LIKE '%' || ?3 || '%') ${scope}`;
  const args = [ctx.schoolId, classId, q, ctx.user.role === "teacher" ? ctx.teacherId : null] as const;
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM learners l WHERE ${where}`, ...args)!.n;
  const rows = all<L>(`
    SELECT l.*, c.name className, c.grade, l.user_id IS NOT NULL has_login,
      (SELECT GROUP_CONCAT(COALESCE(u.title || ' ', '') || u.first_name || ' ' || u.last_name || ' (' || COALESCE(u.phone, u.email) || ')', '; ') FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = l.id) parents
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE ${where}
    ORDER BY c.grade, l.last_name, l.first_name LIMIT ?5 OFFSET ?6`, ...args, PER_PAGE, (page - 1) * PER_PAGE);
  const classes = all<{ id: number; name: string; grade: number }>("SELECT id, name, grade FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, ctx.school.current_year);
  const nextAdmission = `${ctx.school.current_year}-${String((get<{ n: number }>("SELECT COUNT(*) n FROM learners WHERE school_id = ?", ctx.schoolId)!.n + 1)).padStart(4, "0")}`;

  const fields = (l?: L): Field[] => [
    { name: "first_name", label: "First name(s)", required: true, defaultValue: l?.first_name, half: true },
    { name: "last_name", label: "Surname", required: true, defaultValue: l?.last_name, half: true },
    { name: "admission_number", label: "Admission number", required: true, defaultValue: l?.admission_number ?? nextAdmission, half: true },
    { name: "id_number", label: "SA ID / birth certificate number", defaultValue: l?.id_number, half: true, help: "Date of birth and gender are read from a valid SA ID." },
    { name: "gender", label: "Gender", type: "select", options: ["Female", "Male", "Other"].map((v) => ({ value: v, label: v })), defaultValue: l?.gender, half: true },
    { name: "date_of_birth", label: "Date of birth", type: "date", defaultValue: l?.date_of_birth, half: true },
    { name: "class_id", label: "Class", type: "select", options: classes.map((c) => ({ value: c.id, label: `${c.name} (${gradeLabel(c.grade)})` })), defaultValue: l?.class_id, half: true },
    { name: "home_language", label: "Home language", type: "select", options: LANGS.map((v) => ({ value: v, label: v })), defaultValue: l?.home_language, half: true },
    { name: "address", label: "Home address", defaultValue: l?.address },
    ...(l ? [{ name: "status", label: "Status", type: "select", required: true, options: ["Active", "Transferred", "Withdrawn", "Graduated"].map((v) => ({ value: v, label: v })), defaultValue: l.status } as Field] : [
      { name: "login_email", label: "Learner login email (optional)", type: "email", half: true, help: "Usually for Grade 4 and up." } as Field,
      { name: "login_password", label: "Learner password", type: "password", half: true } as Field,
    ]),
    { name: "parent_email", label: "Parent / guardian email", type: "email", half: true, help: "Links an existing parent, or creates a new parent account." },
    { name: "relationship", label: "Relationship", type: "select", options: ["Mother", "Father", "Guardian", "Grandparent", "Foster parent"].map((v) => ({ value: v, label: v })), half: true },
    { name: "parent_first_name", label: "Parent first name", half: true },
    { name: "parent_last_name", label: "Parent surname", half: true },
    { name: "parent_phone", label: "Parent cell number", type: "tel", half: true },
    { name: "parent_password", label: "Parent portal password", type: "password", half: true },
  ];

  return (
    <>
      <PageHeader title="Learners" subtitle={`${total} learner${total === 1 ? "" : "s"}${classId ? "" : " across all classes"}`}>
        <Filters search={{ name: "q", placeholder: "Search name or admission no.", value: q }}
          filters={[{ name: "class", label: "Class", allLabel: "All classes", value: classId || "", options: classes.map((c) => ({ value: c.id, label: c.name })) }]} />
        {ctx.isAdmin && <FormDialog title="Admit learner" triggerLabel="Admit learner" fields={fields()} action={saveLearner} size="lg" />}
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty title="No learners found" /> : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Learner</th><th>Class</th><th>Gender</th><th>Date of birth</th><th>Home language</th><th>Parent / guardian</th><th>Status</th>{ctx.isAdmin && <th className="text-right">Action</th>}</tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar first={l.first_name} last={l.last_name} size={38} />
                        <div><p className="font-semibold">{l.first_name} {l.last_name}</p><p className="text-xs muted font-mono">{l.admission_number}</p></div>
                      </div>
                    </td>
                    <td>{l.className ? <Link className="hover:underline" href={`/learners?class=${l.class_id}`}>{l.className}</Link> : "-"}</td>
                    <td>{l.gender}</td>
                    <td className="whitespace-nowrap">{fmtDate(l.date_of_birth)}</td>
                    <td>{l.home_language}</td>
                    <td className="text-xs max-w-[15rem]">{l.parents ?? <span className="muted">None linked</span>}</td>
                    <td><StatusChip status={l.status} /></td>
                    {ctx.isAdmin && (
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <Link href={`/reports/report-cards?learner=${l.id}`} className="btn btn-ghost btn-sm">Report</Link>
                          <FormDialog trigger="edit" title={`Edit ${l.first_name}`} fields={fields(l)} hidden={{ id: l.id }} action={saveLearner} size="lg" />
                          <DeleteButton action={deleteLearner.bind(null, l.id)} label={`${l.first_name} ${l.last_name}`} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/learners", sp, { page: p })} />
      </Card>
    </>
  );
}
