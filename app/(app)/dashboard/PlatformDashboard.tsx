import { Building2, Users, GraduationCap, MapPin, Ban } from "lucide-react";
import type { Ctx } from "@/lib/auth";
import { all } from "@/lib/db";
import { PROVINCES, fmtDate } from "@/lib/format";
import { Card, PageHeader, TableWrap, StatCard, Empty } from "@/components/ui/kit";
import { FormDialog, ConfirmButton, Filters, type Field } from "@/components/ui/forms";
import { saveSchool, toggleSchool, resetSchoolAdminPassword, addSchoolAdmin } from "@/app/actions/academics";

type S = {
  id: number; name: string; emis_number: string | null; province: string; district: string | null; quintile: number | null; school_type: string;
  fee_paying: number; address: string | null; phone: string | null; email: string | null; principal: string | null; active: number; created_at: string;
  learners: number; teachers: number; last_login: string | null;
};
type Admin = { id: number; school_id: number; name: string; email: string; last_login: string | null };

/** The platform admin's home page: every school on the installation, and nothing inside them. */
export default function PlatformDashboard({ ctx, sp }: { ctx: Ctx; sp: Record<string, string> }) {
  void ctx;
  const q = sp.q?.trim().toLowerCase() ?? "", province = sp.province ?? "", status = sp.status ?? "";
  const all_ = all<S>(`SELECT s.*,
      (SELECT COUNT(*) FROM learners l WHERE l.school_id = s.id AND l.status = 'Active') learners,
      (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'Active') teachers,
      (SELECT MAX(last_login) FROM users u WHERE u.school_id = s.id) last_login
    FROM schools s ORDER BY s.name`);
  const schools = all_.filter((s) =>
    (!q || [s.name, s.emis_number, s.principal, s.district].some((v) => v?.toLowerCase().includes(q))) &&
    (!province || s.province === province) &&
    (!status || (status === "active" ? s.active : !s.active)));
  const admins = all<Admin>("SELECT id, school_id, first_name || ' ' || last_name name, email, last_login FROM users WHERE role = 'school_admin' ORDER BY first_name");
  const adminsOf = (id: number) => admins.filter((a) => a.school_id === id);

  const fields = (s?: S): Field[] => [
    { name: "name", label: "School name", required: true, defaultValue: s?.name },
    { name: "emis_number", label: "EMIS number", defaultValue: s?.emis_number, half: true },
    { name: "province", label: "Province", type: "select", required: true, options: PROVINCES.map((p) => ({ value: p, label: p })), defaultValue: s?.province, half: true },
    { name: "district", label: "District", defaultValue: s?.district, half: true },
    { name: "quintile", label: "Quintile", type: "select", options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `Quintile ${n}` })), defaultValue: s?.quintile, half: true },
    { name: "school_type", label: "Type", type: "select", required: true, options: ["Primary", "Secondary", "Combined"].map((v) => ({ value: v, label: v })), defaultValue: s?.school_type, half: true },
    { name: "fee_paying", label: "Fees", type: "select", required: true, options: [{ value: 1, label: "Fee-paying" }, { value: 0, label: "No-fee school" }], defaultValue: s?.fee_paying ?? 1, half: true },
    { name: "principal", label: "Principal", defaultValue: s?.principal, half: true },
    { name: "phone", label: "Phone", type: "tel", defaultValue: s?.phone, half: true },
    { name: "email", label: "Office email", type: "email", defaultValue: s?.email },
    { name: "address", label: "Physical address", defaultValue: s?.address },
    ...(s ? [] : [
      { name: "admin_first_name", label: "School admin first name", half: true } as Field,
      { name: "admin_last_name", label: "School admin surname", half: true } as Field,
      { name: "admin_email", label: "School admin email (login)", type: "email", required: true, half: true } as Field,
      { name: "admin_password", label: "Initial password", type: "password", required: true, half: true, help: "8+ characters with a capital letter and a number." } as Field,
    ]),
  ];

  const active = all_.filter((s) => s.active);
  return (
    <>
      <PageHeader title="Schools on the platform" subtitle="Register, edit and suspend schools. Each school runs itself through its own school admins.">
        <Filters
          filters={[
            { name: "province", label: "Province", value: province, allLabel: "All provinces", options: PROVINCES.map((p) => ({ value: p, label: p })) },
            { name: "status", label: "Status", value: status, allLabel: "All statuses", options: [{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }] },
          ]}
          search={{ name: "q", placeholder: "Search name, EMIS or principal", value: sp.q ?? "" }} />
        <FormDialog title="Register a school" triggerLabel="Add school" fields={fields()} action={saveSchool} size="lg" />
      </PageHeader>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Schools" value={all_.length} icon={Building2} tone="orange" hint={`${active.length} active · ${all_.length - active.length} suspended`} />
        <StatCard label="Active learners" value={active.reduce((a, s) => a + s.learners, 0).toLocaleString("en-ZA")} icon={Users} tone="sky" />
        <StatCard label="Educators" value={active.reduce((a, s) => a + s.teachers, 0).toLocaleString("en-ZA")} icon={GraduationCap} tone="green" />
        <StatCard label="Provinces" value={`${new Set(all_.map((s) => s.province)).size} / 9`} icon={MapPin} tone="gold" hint={`${all_.filter((s) => s.fee_paying).length} fee-paying · ${all_.filter((s) => !s.fee_paying).length} no-fee`} />
      </div>

      <Card>
        {schools.length === 0 ? <Empty title="No schools match" hint="Change the filters, or add a school." /> : (
          <TableWrap><table className="table">
            <thead><tr><th>School</th><th>Province · type</th><th>People</th><th>School admins</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>{schools.map((s) => {
              const sa = adminsOf(s.id);
              return (
                <tr key={s.id} className={s.active ? "" : "opacity-70"}>
                  <td className="min-w-[11rem]"><p className="font-semibold">{s.name}</p><p className="text-xs muted">EMIS {s.emis_number ?? "-"}{s.principal ? ` · ${s.principal}` : ""}</p></td>
                  <td className="whitespace-nowrap">{s.province}<p className="text-xs muted">{s.school_type} · {s.fee_paying ? "Fee-paying" : "No-fee"}{s.quintile ? ` · Q${s.quintile}` : ""}</p></td>
                  <td className="whitespace-nowrap text-sm">{s.learners.toLocaleString("en-ZA")} learner{s.learners === 1 ? "" : "s"}<p className="text-xs muted">{s.teachers} educator{s.teachers === 1 ? "" : "s"}</p></td>
                  <td className="text-xs">{sa.length ? sa.map((a) => <p key={a.id}>{a.email}</p>) : <span className="text-rose-600">None</span>}
                    <p className="muted mt-0.5">Last sign-in: {s.last_login ? fmtDate(s.last_login.slice(0, 10)) : "never"}</p></td>
                  <td><span className={`chip ${s.active ? "chip-green" : "chip-red"}`}>{s.active ? "Active" : <><Ban className="w-3 h-3" />Suspended</>}</span></td>
                  <td>
                    <div className="flex justify-end items-center gap-1.5">
                      <FormDialog trigger="edit" title={`Edit ${s.name}`} fields={fields(s)} hidden={{ id: s.id }} action={saveSchool} size="lg" />
                      <FormDialog trigger="button" triggerLabel="Admins" title={`School admins · ${s.name}`} hidden={{ school_id: s.id }} action={addSchoolAdmin} submitLabel="Add admin" fields={[
                        { name: "first_name", label: "First name", required: true, half: true },
                        { name: "last_name", label: "Surname", required: true, half: true },
                        { name: "email", label: "Email (login)", type: "email", required: true, half: true },
                        { name: "phone", label: "Cell number", type: "tel", half: true },
                        { name: "password", label: "Initial password", type: "password", required: true, help: `Adds another admin for this school. Current: ${sa.map((a) => a.name).join(", ") || "none"}.` },
                      ]} />
                      {sa.length > 0 && (
                        <FormDialog trigger="button" triggerLabel="Password" title={`Reset a school admin's password · ${s.name}`} action={resetSchoolAdminPassword} submitLabel="Set password" fields={[
                          { name: "user_id", label: "School admin", type: "select", required: true, options: sa.map((a) => ({ value: a.id, label: `${a.name} (${a.email})` })) },
                          { name: "password", label: "New password", type: "password", required: true, help: "8+ characters with a capital letter and a number. Share it privately." },
                        ]} />
                      )}
                      <ConfirmButton action={toggleSchool.bind(null, s.id)} label={s.active ? "Suspend" : "Activate"}
                        confirmText={s.active ? `Suspend ${s.name}? Nobody at this school can sign in until you activate it again. Its data is kept.` : `Activate ${s.name}? Its users can sign in again.`} />
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></TableWrap>
        )}
      </Card>
    </>
  );
}
