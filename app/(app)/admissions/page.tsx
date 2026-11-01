import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, gradeLabel } from "@/lib/format";
import { publicBase } from "@/lib/fees";
import { Card, PageHeader, Empty, StatusChip, StatCard } from "@/components/ui/kit";
import { FormDialog, Filters, DeleteButton, CsvButton } from "@/components/ui/forms";
import { saveAdmissionsSettings, updateApplication, enrolApplicant, deleteApplication } from "@/app/actions/admissions";
import { Inbox, CheckCircle2, Hourglass, UserPlus } from "lucide-react";
import CopyLink from "./CopyLink";

export const metadata = { title: "Admissions" };

type A = { id: number; reference: string; year: number; grade: number; first_name: string; last_name: string; id_number: string | null; date_of_birth: string | null; gender: string | null;
  home_language: string | null; previous_school: string | null; parent_first_name: string; parent_last_name: string; parent_email: string; parent_phone: string; relationship: string | null;
  address: string | null; notes: string | null; status: string; admin_note: string | null; learner_id: number | null; created_at: string };

/** The next admission number after the newest one (same prefix, number plus one). */
function nextAdmission(last: string | undefined) {
  const m = last?.match(/^(.*?)(\d+)$/);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") : "";
}

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const s = ctx.school;
  const years = (await all<{ year: number }>("SELECT DISTINCT year FROM applications WHERE school_id = ? ORDER BY year DESC", ctx.schoolId)).map((r) => r.year);
  const year = Number(sp.year) || s.admissions_year || years[0] || s.current_year + 1;
  const status = sp.status ?? "", grade = sp.grade ?? "";
  const rows = await all<A>(`SELECT * FROM applications WHERE school_id = ?1 AND year = ?2 AND (?3 = '' OR status = ?3) AND (?4 = '' OR grade::text = ?4) ORDER BY created_at DESC`, ctx.schoolId, year, status, grade);
  const counts = await all<{ status: string; n: number }>("SELECT status, COUNT(*) n FROM applications WHERE school_id = ? AND year = ? GROUP BY status", ctx.schoolId, year);
  const n = (st: string[]) => counts.filter((c) => st.includes(c.status)).reduce((a, c) => a + c.n, 0);
  const classes = await all<{ id: number; name: string; grade: number; year: number }>("SELECT id, name, grade, year FROM classes WHERE school_id = ? AND year >= ? ORDER BY year DESC, grade, name", ctx.schoolId, s.current_year);
  const lastAdmission = (await get<{ admission_number: string }>("SELECT admission_number FROM learners WHERE school_id = ? ORDER BY id DESC LIMIT 1", ctx.schoolId))?.admission_number;
  let suggested = nextAdmission(lastAdmission);
  const link = s.admissions_code ? `${await publicBase()}/apply/${s.admissions_code}` : null;

  const csv = [["Reference", "Status", "Grade", "Child", "Date of birth", "ID number", "Gender", "Home language", "Previous school", "Parent", "Relationship", "Email", "Cell", "Address", "Notes", "Submitted"],
    ...rows.map((a) => [a.reference, a.status, gradeLabel(a.grade), `${a.first_name} ${a.last_name}`, a.date_of_birth, a.id_number, a.gender, a.home_language, a.previous_school, `${a.parent_first_name} ${a.parent_last_name}`, a.relationship, a.parent_email, a.parent_phone, a.address, a.notes, a.created_at.slice(0, 10)])];

  return (
    <>
      <PageHeader title="Admissions" subtitle={`Online applications for ${year}`}>
        <Filters filters={[
          ...(years.length > 1 ? [{ name: "year", label: "Year", value: year, options: years.map((y) => ({ value: y, label: String(y) })) }] : []),
          { name: "status", label: "Status", value: status, allLabel: "All statuses", options: ["Submitted", "Reviewing", "Accepted", "Waitlisted", "Declined", "Enrolled", "Withdrawn"].map((v) => ({ value: v, label: v })) },
          { name: "grade", label: "Grade", value: grade, allLabel: "All grades", options: Array.from({ length: 13 }, (_, g) => ({ value: String(g), label: gradeLabel(g) })) },
        ]} />
        <CsvButton filename={`applications-${year}.csv`} rows={csv} />
        <FormDialog trigger="button" triggerLabel="Admissions settings" title="Online applications" action={saveAdmissionsSettings} fields={[
          { name: "admissions_open", label: "Applications", type: "select", required: true, defaultValue: s.admissions_open ? 1 : 0, options: [{ value: 1, label: "Open: parents can apply online" }, { value: 0, label: "Closed" }], half: true },
          { name: "admissions_year", label: "For the school year", type: "select", required: true, defaultValue: s.admissions_year ?? s.current_year + 1, options: [s.current_year, s.current_year + 1, s.current_year + 2].map((y) => ({ value: y, label: String(y) })), half: true },
          { name: "admissions_info", label: "Information for parents (shown on the form)", type: "textarea", defaultValue: s.admissions_info, placeholder: "Closing date, documents to bring (birth certificate, report, proof of address), application fee, open days…" },
        ]} />
      </PageHeader>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`chip ${s.admissions_open ? "chip-green" : "chip-slate"}`}>{s.admissions_open ? `Open for ${s.admissions_year ?? s.current_year + 1}` : "Closed"}</span>
          {link ? <CopyLink url={link} /> : <p className="text-sm muted">Open applications under Admissions settings to get your school&apos;s application link to share on your website, social media and WhatsApp.</p>}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="New" value={n(["Submitted"])} icon={Inbox} tone="sky" />
        <StatCard label="Reviewing / waiting list" value={n(["Reviewing", "Waitlisted"])} icon={Hourglass} tone="gold" />
        <StatCard label="Accepted" value={n(["Accepted"])} icon={CheckCircle2} tone="green" />
        <StatCard label="Enrolled" value={n(["Enrolled"])} icon={UserPlus} tone="orange" />
      </div>

      <Card>
        {rows.length === 0 ? <Empty title="No applications" hint={s.admissions_open ? "Share the application link with parents." : undefined} /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Child</th><th>Grade</th><th>Parent</th><th>Submitted</th><th>Status</th><th className="text-right">Action</th></tr></thead>
              <tbody>{rows.map((a) => {
                const admission = suggested;
                if (a.status !== "Enrolled" && suggested) suggested = nextAdmission(suggested);
                return (
                  <tr key={a.id}>
                    <td className="min-w-[12rem]">
                      <p className="font-semibold">{a.first_name} {a.last_name}</p>
                      <p className="text-xs muted">{a.reference} · born {fmtDate(a.date_of_birth)}{a.gender ? ` · ${a.gender}` : ""}{a.previous_school ? ` · from ${a.previous_school}` : ""}</p>
                      {a.notes && <p className="text-xs mt-1 max-w-sm">{a.notes}</p>}
                      {a.admin_note && <p className="text-xs mt-1 text-sky-700 dark:text-sky-300">Note: {a.admin_note}</p>}
                    </td>
                    <td className="whitespace-nowrap">{gradeLabel(a.grade)}</td>
                    <td className="text-sm"><p>{a.parent_first_name} {a.parent_last_name} <span className="muted">({a.relationship ?? "Parent"})</span></p><p className="text-xs muted"><a href={`mailto:${a.parent_email}`} className="underline">{a.parent_email}</a> · <a href={`tel:${a.parent_phone}`}>{a.parent_phone}</a></p></td>
                    <td className="whitespace-nowrap text-sm">{fmtDate(a.created_at.slice(0, 10))}</td>
                    <td><StatusChip status={a.status} /></td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {a.status === "Enrolled" ? (a.learner_id && <Link href={`/learners/${a.learner_id}`} className="btn btn-ghost btn-sm">Learner</Link>) : <>
                          <FormDialog trigger="button" triggerLabel="Update" title={`Application · ${a.first_name} ${a.last_name}`} hidden={{ id: a.id }} action={updateApplication} fields={[
                            { name: "status", label: "Status", type: "select", required: true, defaultValue: a.status, options: ["Submitted", "Reviewing", "Accepted", "Waitlisted", "Declined", "Withdrawn"].map((v) => ({ value: v, label: v })) },
                            { name: "admin_note", label: "Note (for the school only)", type: "textarea", defaultValue: a.admin_note, placeholder: "Interview date, documents received…" },
                          ]} />
                          <FormDialog trigger="button" triggerLabel="Enrol" title={`Enrol ${a.first_name} ${a.last_name}`} hidden={{ id: a.id }} action={enrolApplicant} submitLabel="Enrol learner" fields={[
                            { name: "admission_number", label: "Admission number", required: true, defaultValue: admission, half: true },
                            { name: "class_id", label: "Class", type: "select", options: classes.filter((c) => c.grade === a.grade).map((c) => ({ value: c.id, label: `${c.name} (${c.year})` })), half: true, help: "Optional: place them later under Learners." },
                            { name: "parent_email", label: "Parent's email (their FerriDash login)", type: "email", required: true, defaultValue: a.parent_email, help: "Change it if this address is already used by another account. An existing parent account at your school is linked instead of creating a new one." },
                            { name: "parent_password", label: "Parent's password", type: "password", help: "Only used when this parent doesn't have an account yet. 8+ characters with a capital letter and a number; leave empty to set it later." },
                          ]} />
                        </>}
                        <DeleteButton action={deleteApplication.bind(null, a.id)} label={`the application for ${a.first_name} ${a.last_name}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
