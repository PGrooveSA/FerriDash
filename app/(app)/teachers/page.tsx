import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fullName } from "@/lib/format";
import { Card, PageHeader, Pager, TableWrap, Empty, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { saveTeacher, deleteTeacher, resetPassword } from "@/app/actions/people";

export const metadata = { title: "Teachers" };
const PER_PAGE = 10;

type T = { id: number; user_id: number; title: string | null; first_name: string; last_name: string; email: string; phone: string | null; staff_number: string | null; persal_number: string | null; sace_number: string | null; id_number: string | null; gender: string | null; post_level: string | null; address: string | null; subjects: string | null; classes: string | null };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1);
  const where = "t.school_id = ?1 AND (?2 = '' OR u.first_name || ' ' || u.last_name LIKE '%' || ?2 || '%' OR t.staff_number LIKE '%' || ?2 || '%' OR u.email LIKE '%' || ?2 || '%')";
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM teachers t JOIN users u ON u.id = t.user_id WHERE ${where}`, ctx.schoolId, q)!.n;
  const rows = all<T>(`
    SELECT t.*, u.title, u.first_name, u.last_name, u.email, u.phone,
      (SELECT GROUP_CONCAT(DISTINCT s.name) FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.teacher_id = t.id) subjects,
      (SELECT GROUP_CONCAT(DISTINCT c.name) FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE cs.teacher_id = t.id) classes
    FROM teachers t JOIN users u ON u.id = t.user_id WHERE ${where}
    ORDER BY u.last_name, u.first_name LIMIT ?3 OFFSET ?4`, ctx.schoolId, q, PER_PAGE, (page - 1) * PER_PAGE);

  const fields = (t?: T): Field[] => [
    { name: "title", label: "Title", type: "select", options: ["Mr", "Ms", "Mrs", "Dr", "Prof"].map((v) => ({ value: v, label: v })), defaultValue: t?.title, half: true },
    { name: "gender", label: "Gender", type: "select", options: ["Female", "Male", "Other"].map((v) => ({ value: v, label: v })), defaultValue: t?.gender, half: true },
    { name: "first_name", label: "First name", required: true, defaultValue: t?.first_name, half: true },
    { name: "last_name", label: "Surname", required: true, defaultValue: t?.last_name, half: true },
    { name: "email", label: "Email (login)", type: "email", required: true, defaultValue: t?.email, half: true },
    { name: "phone", label: "Cell number", type: "tel", defaultValue: t?.phone, placeholder: "+27 82 123 4567", half: true },
    { name: "id_number", label: "SA ID number", defaultValue: t?.id_number, half: true },
    { name: "post_level", label: "Post level", type: "select", options: ["PL1", "PL2 (HOD)", "PL3 (Deputy)", "PL4 (Principal)"].map((v) => ({ value: v, label: v })), defaultValue: t?.post_level ?? "PL1", half: true },
    { name: "staff_number", label: "Staff number", defaultValue: t?.staff_number, half: true },
    { name: "persal_number", label: "PERSAL number", defaultValue: t?.persal_number, half: true },
    { name: "sace_number", label: "SACE registration", defaultValue: t?.sace_number, half: true },
    { name: "address", label: "Address", defaultValue: t?.address, half: true },
    ...(t ? [] : [{ name: "password", label: "Initial password", type: "password", required: true, help: "8+ characters with a capital letter and a number." } as Field]),
  ];

  return (
    <>
      <PageHeader title="All Teachers" subtitle={`${total} educators at ${ctx.school.name}`}>
        <Filters filters={[]} search={{ name: "q", placeholder: "Search by name, staff no. or email", value: q }} />
        <FormDialog title="Add teacher" triggerLabel="Add teacher" fields={fields()} action={saveTeacher} size="lg" />
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty title="No teachers found" /> : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Teacher</th><th>Staff no.</th><th>Subject(s)</th><th>Class(es)</th><th>Phone</th><th>Post level</th><th className="text-right">Action</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar first={t.first_name} last={t.last_name} size={40} />
                        <div><p className="font-semibold">{fullName(t, true)}</p><p className="text-xs muted">{t.email}</p></div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{t.staff_number}</td>
                    <td className="max-w-[16rem] text-sm">{t.subjects?.split(",").join(", ") ?? <span className="muted">Not allocated</span>}</td>
                    <td className="text-sm">{t.classes?.split(",").join(", ") ?? "-"}</td>
                    <td className="whitespace-nowrap">{t.phone}</td>
                    <td><span className="chip chip-lilac">{t.post_level}</span></td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <FormDialog trigger="edit" title={`Edit ${t.first_name}`} fields={fields(t)} hidden={{ id: t.id }} action={saveTeacher} size="lg" />
                        <FormDialog trigger="button" triggerLabel="Password" title={`Reset password · ${t.first_name} ${t.last_name}`} hidden={{ user_id: t.user_id }} action={resetPassword} submitLabel="Set password"
                          fields={[{ name: "password", label: "New password", type: "password", required: true, help: "8+ characters with a capital letter and a number." }]} />
                        <DeleteButton action={deleteTeacher.bind(null, t.id)} label={fullName(t)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/teachers", sp, { page: p })} />
      </Card>
    </>
  );
}
