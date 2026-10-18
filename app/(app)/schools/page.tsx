import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { PROVINCES } from "@/lib/format";
import { Card, PageHeader, TableWrap, StatCard } from "@/components/ui/kit";
import { FormDialog, type Field } from "@/components/ui/forms";
import { Building2, Users, MapPin } from "lucide-react";
import { saveSchool, toggleSchool } from "@/app/actions/academics";
import { switchSchool } from "@/app/actions/auth";

export const metadata = { title: "Schools" };

type S = { id: number; name: string; emis_number: string | null; province: string; district: string | null; quintile: number | null; school_type: string; fee_paying: number; address: string | null; phone: string | null; email: string | null; principal: string | null; active: number; learners: number; teachers: number };

export default async function SchoolsPage() {
  const ctx = await requireCtx(["super_admin"]);
  const schools = all<S>(`SELECT s.*, (SELECT COUNT(*) FROM learners l WHERE l.school_id = s.id AND l.status = 'Active') learners, (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id) teachers FROM schools s ORDER BY s.province, s.name`);
  const fields = (s?: S): Field[] => [
    { name: "name", label: "School name", required: true, defaultValue: s?.name },
    { name: "emis_number", label: "EMIS number", defaultValue: s?.emis_number, half: true },
    { name: "province", label: "Province", type: "select", required: true, options: PROVINCES.map((p) => ({ value: p, label: p })), defaultValue: s?.province, half: true },
    { name: "district", label: "District", defaultValue: s?.district, half: true },
    { name: "quintile", label: "Quintile", type: "select", options: [1, 2, 3, 4, 5].map((q) => ({ value: q, label: `Quintile ${q}` })), defaultValue: s?.quintile, half: true },
    { name: "school_type", label: "Type", type: "select", required: true, options: ["Primary", "Secondary", "Combined"].map((v) => ({ value: v, label: v })), defaultValue: s?.school_type, half: true },
    { name: "fee_paying", label: "Fees", type: "select", required: true, options: [{ value: 1, label: "Fee-paying" }, { value: 0, label: "No-fee school" }], defaultValue: s?.fee_paying ?? 1, half: true },
    { name: "principal", label: "Principal", defaultValue: s?.principal, half: true },
    { name: "phone", label: "Phone", type: "tel", defaultValue: s?.phone, half: true },
    { name: "email", label: "Office email", type: "email", defaultValue: s?.email },
    { name: "address", label: "Physical address", defaultValue: s?.address },
    ...(s ? [] : [
      { name: "admin_first_name", label: "School admin first name", half: true } as Field,
      { name: "admin_last_name", label: "School admin surname", half: true } as Field,
      { name: "admin_email", label: "School admin email", type: "email", required: true, half: true } as Field,
      { name: "admin_password", label: "Initial password", type: "password", required: true, half: true } as Field,
    ]),
  ];
  const provinces = new Set(schools.map((s) => s.province)).size;
  return (
    <>
      <PageHeader title="Schools on the platform" subtitle="Each school's data is kept separate. Switch into a school to manage it.">
        <FormDialog title="Register a school" triggerLabel="Add school" fields={fields()} action={saveSchool} size="lg" />
      </PageHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Schools" value={schools.length} icon={Building2} tone="gold" />
        <StatCard label="Active learners" value={schools.reduce((a, s) => a + s.learners, 0)} icon={Users} tone="sky" />
        <StatCard label="Provinces" value={`${provinces} / 9`} icon={MapPin} tone="butter" />
      </div>
      <Card>
        <TableWrap><table className="table">
          <thead><tr><th>School</th><th>EMIS</th><th>Province / district</th><th>Type</th><th>Quintile</th><th>Learners</th><th>Educators</th><th>Status</th><th className="text-right">Action</th></tr></thead>
          <tbody>{schools.map((s) => (
            <tr key={s.id}>
              <td><p className="font-semibold">{s.name}</p><p className="text-xs muted">{s.principal}</p></td>
              <td className="font-mono text-xs">{s.emis_number}</td>
              <td>{s.province}<p className="text-xs muted">{s.district}</p></td>
              <td>{s.school_type}<p className="text-xs muted">{s.fee_paying ? "Fee-paying" : "No-fee"}</p></td>
              <td>{s.quintile ? `Q${s.quintile}` : "-"}</td><td>{s.learners}</td><td>{s.teachers}</td>
              <td><span className={`chip ${s.active ? "chip-green" : "chip-red"}`}>{s.active ? "Active" : "Suspended"}</span></td>
              <td>
                <div className="flex justify-end gap-1.5">
                  <form action={switchSchool}><input type="hidden" name="school_id" value={s.id} /><button className={`btn btn-sm ${s.id === ctx.schoolId ? "btn-primary" : "btn-ghost"}`}>{s.id === ctx.schoolId ? "Current" : "Open"}</button></form>
                  <FormDialog trigger="edit" title={`Edit ${s.name}`} fields={fields(s)} hidden={{ id: s.id }} action={saveSchool} size="lg" />
                  <form action={async () => { "use server"; await toggleSchool(s.id); }}><button className="btn btn-ghost btn-sm">{s.active ? "Suspend" : "Activate"}</button></form>
                </div>
              </td>
            </tr>))}
          </tbody>
        </table></TableWrap>
      </Card>
    </>
  );
}
