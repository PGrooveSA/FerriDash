import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fullName, avatarUrl } from "@/lib/format";
import { Card, PageHeader, Pager, TableWrap, Empty, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { saveParent, linkChild, unlinkChild, deleteUser, resetPassword } from "@/app/actions/people";

export const metadata = { title: "Parents" };
const PER_PAGE = 12;

type P = { id: number; title: string | null; first_name: string; last_name: string; email: string; phone: string | null; last_login: string | null; avatar_updated_at: string | null };

export default async function ParentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1);
  const where = "u.school_id = ?1 AND u.role = 'parent' AND (?2 = '' OR u.first_name || ' ' || u.last_name LIKE '%' || ?2 || '%' OR u.email LIKE '%' || ?2 || '%' OR u.phone LIKE '%' || ?2 || '%')";
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM users u WHERE ${where}`, ctx.schoolId, q)!.n;
  const rows = all<P>(`SELECT id, title, first_name, last_name, email, phone, last_login, avatar_updated_at FROM users u WHERE ${where} ORDER BY last_name, first_name LIMIT ?3 OFFSET ?4`, ctx.schoolId, q, PER_PAGE, (page - 1) * PER_PAGE);
  const kids = rows.length ? all<{ parent_user_id: number; learner_id: number; relationship: string; first_name: string; last_name: string; className: string | null }>(`
    SELECT g.parent_user_id, g.learner_id, g.relationship, l.first_name, l.last_name, c.name className
    FROM guardian_links g JOIN learners l ON l.id = g.learner_id LEFT JOIN classes c ON c.id = l.class_id
    WHERE g.parent_user_id IN (${rows.map(() => "?").join(",")})`, ...rows.map((r) => r.id)) : [];

  const fields = (p?: P): Field[] => [
    { name: "title", label: "Title", type: "select", options: ["Mr", "Ms", "Mrs", "Dr"].map((v) => ({ value: v, label: v })), defaultValue: p?.title, half: true },
    { name: "phone", label: "Cell number", type: "tel", defaultValue: p?.phone, half: true },
    { name: "first_name", label: "First name", required: true, defaultValue: p?.first_name, half: true },
    { name: "last_name", label: "Surname", required: true, defaultValue: p?.last_name, half: true },
    { name: "email", label: "Email (login)", type: "email", required: true, defaultValue: p?.email },
    ...(p ? [] : [{ name: "password", label: "Portal password", type: "password", required: true, help: "8+ characters with a capital letter and a number." } as Field]),
  ];

  return (
    <>
      <PageHeader title="Parents & Guardians" subtitle="Parents see only their own children's published results, attendance and fees.">
        <Filters filters={[]} search={{ name: "q", placeholder: "Search name, email or phone", value: q }} />
        <FormDialog title="Add parent" triggerLabel="Add parent" fields={fields()} action={saveParent} />
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty title="No parents found" /> : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Parent / guardian</th><th>Phone</th><th>Children</th><th>Last sign-in</th><th className="text-right">Action</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><div className="flex items-center gap-3"><Avatar first={p.first_name} last={p.last_name} size={38} photo={avatarUrl(p.id, p.avatar_updated_at)} /><div><p className="font-semibold">{fullName(p, true)}</p><p className="text-xs muted">{p.email}</p></div></div></td>
                    <td className="whitespace-nowrap">{p.phone ?? "-"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {kids.filter((k) => k.parent_user_id === p.id).map((k) => (
                          <span key={k.learner_id} className="chip chip-info">
                            {k.first_name} {k.last_name} · {k.className ?? "-"} <span className="muted">({k.relationship})</span>
                            <form action={async () => { "use server"; await unlinkChild(p.id, k.learner_id); }}><button className="ml-1 hover:text-rose-600" aria-label="Unlink">×</button></form>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-xs muted">{p.last_login ?? "Never"}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <FormDialog trigger="button" triggerLabel="Link child" title={`Link a child to ${p.first_name}`} hidden={{ parent_id: p.id }} action={linkChild} submitLabel="Link"
                          fields={[{ name: "admission_number", label: "Learner admission number", required: true, placeholder: "e.g. 2026-0012" }, { name: "relationship", label: "Relationship", type: "select", options: ["Mother", "Father", "Guardian", "Grandparent", "Foster parent"].map((v) => ({ value: v, label: v })) }]} />
                        <FormDialog trigger="button" triggerLabel="Password" title={`Reset password · ${p.first_name}`} hidden={{ user_id: p.id }} action={resetPassword} submitLabel="Set password"
                          fields={[{ name: "password", label: "New password", type: "password", required: true }]} />
                        <FormDialog trigger="edit" title={`Edit ${p.first_name}`} fields={fields(p)} hidden={{ id: p.id }} action={saveParent} />
                        <DeleteButton action={deleteUser.bind(null, p.id)} label={fullName(p)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(n) => hrefWith("/parents", sp, { page: n })} />
      </Card>
    </>
  );
}
