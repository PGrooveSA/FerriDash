import Link from "next/link";
import { ShieldCheck, ShieldOff, Phone, HeartPulse, Users, Camera, Stethoscope } from "lucide-react";
import { requireChildcare, childFor, allergiesOf, collectors } from "@/lib/childcare";
import { all, get } from "@/lib/db";
import { fmtDate, zar } from "@/lib/format";
import { today } from "@/lib/today";
import { ageGroupLabel } from "@/lib/org";
import { Card, PageHeader, Empty } from "@/components/ui/kit";
import { FormDialog, DeleteButton, ConfirmButton, type Field } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import LeaveButton from "@/components/LeaveButton";
import { feesOn } from "@/lib/fees";
import { leftLabel } from "@/lib/leavers";
import { AllergyChips, ageText, todayStatus } from "@/components/childcare";
import { saveHealth, addAllergy, deleteAllergy, saveContact, deleteContact, setConsent, setFeePlan } from "@/app/actions/childcare";

export const metadata = { title: "Child profile" };

type Health = { conditions: string | null; medication: string | null; dietary: string | null; doctor_name: string | null; doctor_phone: string | null; medical_aid: string | null; medical_aid_number: string | null; updated_at: string; by: string | null };
type Contact = { id: number; name: string; relationship: string | null; phone: string | null; id_last_digits: string | null; can_collect: number; emergency: number };

const CONSENTS = [
  { kind: "photos" as const, icon: Camera, title: "Photos and videos", text: "The centre may take photos and videos of this child and share them with the child's own parents in FerriDash." },
  { kind: "medical" as const, icon: Stethoscope, title: "Emergency medical treatment", text: "If a parent can't be reached in an emergency, the centre may get medical treatment for this child." },
];

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireChildcare(["school_admin", "teacher", "parent"]);
  const id = Number((await params).id);
  const c = await childFor(ctx, id);
  if (!c) return <Card><Empty title="Child not found" /></Card>;
  const t = today();
  // The owner and the child's own parents keep these details up to date; practitioners can read them.
  const canEdit = ctx.isAdmin || ctx.user.role === "parent";
  const allergies = await allergiesOf([c.id]);
  const health = await get<Health>("SELECT h.*, u.first_name || ' ' || u.last_name by FROM child_health h LEFT JOIN users u ON u.id = h.updated_by WHERE h.learner_id = ?", c.id);
  const contacts = await all<Contact>("SELECT id, name, relationship, phone, id_last_digits, can_collect, emergency FROM child_contacts WHERE learner_id = ? ORDER BY emergency DESC, name", c.id);
  const { parents } = await collectors(c.id);
  const consents = await all<{ kind: string; given: number; recorded_at: string; by: string | null; role: string | null }>(
    "SELECT k.kind, k.given, k.recorded_at, u.first_name || ' ' || u.last_name by, u.role FROM child_consents k LEFT JOIN users u ON u.id = k.recorded_by WHERE k.learner_id = ?", c.id);
  const days = await all<{ date: string; in_at: string; dropped_by: string | null; out_at: string | null; collected_by: string | null; unauthorised: number; in_note: string | null; out_note: string | null }>(
    "SELECT date, in_at, dropped_by, out_at, collected_by, unauthorised, in_note, out_note FROM checkins WHERE learner_id = ? ORDER BY date DESC LIMIT 14", c.id);
  const room = c.class_id ? await get<{ age_group: string | null }>("SELECT age_group FROM classes WHERE id = ?", c.class_id) : null;
  const plans = ctx.isAdmin ? await all<{ id: number; name: string; monthly: number }>("SELECT id, name, monthly FROM fee_plans WHERE school_id = ? ORDER BY monthly DESC", ctx.schoolId) : [];
  const st = todayStatus(days[0]?.date === t ? days[0] : { in_at: null, out_at: null });

  const contactFields = (k?: Contact): Field[] => [
    { name: "name", label: "Full name", required: true, defaultValue: k?.name, half: true },
    { name: "relationship", label: "Relationship to the child", defaultValue: k?.relationship, placeholder: "e.g. Grandmother, driver", half: true },
    { name: "phone", label: "Cell number", type: "tel", defaultValue: k?.phone, half: true },
    { name: "id_last_digits", label: "Last digits of their ID number", defaultValue: k?.id_last_digits, half: true, help: "3 to 6 digits, for staff to check at the gate." },
    { name: "can_collect", label: "May collect the child", type: "select", required: true, options: [{ value: 1, label: "Yes" }, { value: 0, label: "No" }], defaultValue: k?.can_collect ?? 1, half: true },
    { name: "emergency", label: "Emergency contact", type: "select", required: true, options: [{ value: 1, label: "Yes" }, { value: 0, label: "No" }], defaultValue: k?.emergency ?? 1, half: true },
  ];
  const healthFields: Field[] = [
    { name: "conditions", label: "Medical conditions", type: "textarea", defaultValue: health?.conditions, placeholder: "e.g. Asthma, epilepsy" },
    { name: "medication", label: "Regular medication", type: "textarea", defaultValue: health?.medication, placeholder: "Name, dose and when it is given" },
    { name: "dietary", label: "Dietary needs", defaultValue: health?.dietary, placeholder: "e.g. Halaal, vegetarian, no pork, lactose-free" },
    { name: "doctor_name", label: "Doctor", defaultValue: health?.doctor_name, half: true },
    { name: "doctor_phone", label: "Doctor's number", type: "tel", defaultValue: health?.doctor_phone, half: true },
    { name: "medical_aid", label: "Medical aid", defaultValue: health?.medical_aid, half: true },
    { name: "medical_aid_number", label: "Medical aid number", defaultValue: health?.medical_aid_number, half: true },
  ];
  const severe = allergies.filter((a) => a.severity === "Severe");

  return (
    <>
      <PageHeader title={`${c.first_name} ${c.last_name}`} subtitle={`${ageText(c.date_of_birth, t)} · ${c.className ?? "No classroom yet"}${room?.age_group ? ` (${ageGroupLabel(room.age_group)})` : ""} · ${c.admission_number}`}>
        {c.status === "Active" ? <span className={`chip ${st.tone}`}>{st.label}</span> : <span className="chip chip-slate">{leftLabel(c.status, true)}</span>}
        {ctx.isAdmin && c.status === "Active" && <LeaveButton id={c.id} name={c.first_name} childcare fees={feesOn(ctx.school)} />}
        {ctx.user.role !== "parent" && <Link href={`/checkin${c.class_id ? `?room=${c.class_id}` : ""}`} className="btn btn-ghost">Check-in board</Link>}
        <Link href="/children" className="btn btn-ghost">All children</Link>
      </PageHeader>

      {severe.length > 0 && (
        <div className="glass p-4 mb-6 border-2 !border-rose-400 bg-rose-50/60 dark:bg-rose-500/10">
          <p className="font-semibold text-rose-700 dark:text-rose-300">Severe allergy: {severe.map((a) => a.allergen).join(", ")}</p>
          {severe.map((a) => (a.reaction || a.action_plan) && <p key={a.id} className="text-sm mt-1"><b>{a.allergen}:</b> {a.reaction && `${a.reaction}. `}{a.action_plan && <>What to do: {a.action_plan}</>}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title={<span className="flex items-center gap-2"><HeartPulse className="w-5 h-5 text-rose-500" />Allergies</span>} action={canEdit && (
          <FormDialog title={`Add an allergy · ${c.first_name}`} triggerLabel="Add allergy" action={addAllergy} hidden={{ learner_id: c.id }} fields={[
            { name: "allergen", label: "Allergic to", required: true, placeholder: "e.g. Peanuts, eggs, bee stings, penicillin" },
            { name: "severity", label: "How serious", type: "select", required: true, options: [{ value: "Mild", label: "Mild" }, { value: "Moderate", label: "Moderate" }, { value: "Severe", label: "Severe (life-threatening)" }] },
            { name: "reaction", label: "What happens", placeholder: "e.g. Swelling, hives, trouble breathing" },
            { name: "action_plan", label: "What staff must do", type: "textarea", placeholder: "e.g. Give the EpiPen in her bag, then call 10177 and the parents" },
          ]} />
        )}>
          {allergies.length === 0 ? <p className="text-sm muted">No allergies recorded.</p> : (
            <ul className="divide-line">{allergies.map((a) => (
              <li key={a.id} className="py-2.5 flex items-start gap-3">
                <div className="flex-1"><AllergyChips allergies={[a]} /> <span className="text-xs muted">{a.severity}</span>
                  {a.reaction && <p className="text-sm mt-1">{a.reaction}</p>}{a.action_plan && <p className="text-sm muted">What to do: {a.action_plan}</p>}</div>
                {canEdit && <DeleteButton action={deleteAllergy.bind(null, a.id)} label={`the ${a.allergen} allergy`} />}
              </li>
            ))}</ul>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Stethoscope className="w-5 h-5 text-sky-500" />Health</span>} action={canEdit && (
          <FormDialog trigger="edit" title={`Health details · ${c.first_name}`} action={saveHealth} hidden={{ learner_id: c.id }} fields={healthFields} size="lg" />
        )}>
          {!health ? <p className="text-sm muted">No health details yet.{canEdit ? " Use the edit button to add them." : ""}</p> : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {([["Medical conditions", health.conditions], ["Regular medication", health.medication], ["Dietary needs", health.dietary],
                ["Doctor", [health.doctor_name, health.doctor_phone].filter(Boolean).join(" · ")], ["Medical aid", [health.medical_aid, health.medical_aid_number].filter(Boolean).join(" · ")]] as const).map(([k, v]) => (
                <div key={k}><dt className="label !mb-0">{k}</dt><dd className="whitespace-pre-line">{v || <span className="muted">-</span>}</dd></div>
              ))}
              <p className="text-xs muted sm:col-span-2">Updated {fmtDate(health.updated_at.slice(0, 10))}{health.by ? ` by ${health.by}` : ""}.</p>
            </dl>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Users className="w-5 h-5 text-emerald-500" />Who may collect {c.first_name}</span>} action={canEdit && (
          <FormDialog title={`Add a person · ${c.first_name}`} triggerLabel="Add person" action={saveContact} hidden={{ learner_id: c.id }} fields={contactFields()} size="lg" />
        )}>
          <ul className="divide-line">
            {parents.map((p) => (
              <li key={`p${p.id}`} className="py-2.5 flex items-center gap-3">
                <Avatar first={p.name.split(" ")[0]} last={p.name.split(" ").slice(-1)[0]} size={34} />
                <div className="flex-1"><p className="font-medium">{p.name} <span className="text-xs muted">· {p.relationship}</span></p><p className="text-xs muted">Parent with a FerriDash account{p.phone ? ` · ${p.phone}` : ""}</p></div>
                <span className="chip chip-green">May collect</span>
              </li>
            ))}
            {contacts.map((k) => (
              <li key={k.id} className="py-2.5 flex items-center gap-3">
                <Avatar first={k.name.split(" ")[0]} last={k.name.split(" ").slice(-1)[0]} size={34} />
                <div className="flex-1 min-w-0"><p className="font-medium">{k.name}{k.relationship && <span className="text-xs muted"> · {k.relationship}</span>}</p>
                  <p className="text-xs muted flex flex-wrap gap-x-3">{k.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{k.phone}</span>}{k.id_last_digits && <span>ID ends …{k.id_last_digits}</span>}</p></div>
                <div className="flex flex-col items-end gap-1">
                  {k.can_collect ? <span className="chip chip-green">May collect</span> : <span className="chip chip-slate">Can't collect</span>}
                  {k.emergency ? <span className="chip chip-butter">Emergency</span> : null}
                </div>
                {canEdit && <div className="flex gap-1">
                  <FormDialog trigger="edit" title={`Edit ${k.name}`} action={saveContact} hidden={{ learner_id: c.id, id: k.id }} fields={contactFields(k)} size="lg" />
                  <DeleteButton action={deleteContact.bind(null, k.id)} label={k.name} />
                </div>}
              </li>
            ))}
            {parents.length + contacts.length === 0 && <li className="py-2 text-sm muted">Nobody yet. Link a parent, and add others who may fetch {c.first_name}.</li>}
          </ul>
          {contacts.filter((k) => k.emergency).length + parents.length < 2 && <p className="text-xs text-butter-600 mt-3">Add at least two people the centre can call in an emergency.</p>}
        </Card>

        <Card title="Consent">
          <ul className="space-y-3">
            {CONSENTS.map((k) => {
              const row = consents.find((x) => x.kind === k.kind);
              const Icon = k.icon;
              return (
                <li key={k.kind} className="flex items-start gap-3">
                  <span className="icon-btn !w-10 !h-10 shrink-0"><Icon className="w-5 h-5" /></span>
                  <div className="flex-1">
                    <p className="font-medium flex items-center gap-2">{k.title}
                      {row?.given ? <span className="chip chip-green"><ShieldCheck className="w-3 h-3" />Given</span> : row ? <span className="chip chip-red"><ShieldOff className="w-3 h-3" />Not given</span> : <span className="chip chip-slate">Not asked yet</span>}</p>
                    <p className="text-sm muted">{k.text}</p>
                    {row && <p className="text-xs muted mt-0.5">Recorded {fmtDate(row.recorded_at.slice(0, 10))}{row.by ? ` by ${row.by}${row.role === "school_admin" ? " (from the parent)" : ""}` : ""}.</p>}
                  </div>
                  {canEdit && <ConfirmButton action={setConsent.bind(null, c.id, k.kind, !row?.given)} label={row?.given ? "Withdraw" : "Give consent"}
                    confirmText={row?.given ? `Withdraw consent for ${k.title.toLowerCase()} for ${c.first_name}?` : ctx.isAdmin ? `Record that a parent gave consent for ${k.title.toLowerCase()} for ${c.first_name}?` : `Give consent for ${k.title.toLowerCase()} for ${c.first_name}? ${k.text}`} />}
                </li>
              );
            })}
          </ul>
        </Card>

        {ctx.isAdmin && (
          <Card title="Fees" action={<Link href={`/finance/statement?learner=${c.id}`} className="btn btn-ghost btn-sm">Statement</Link>}>
            <form action={async (fd: FormData) => { "use server"; await setFeePlan({}, fd); }} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="learner_id" value={c.id} />
              <div className="flex-1 min-w-[12rem]"><label className="label" htmlFor="fee-plan">Fee plan</label>
                <select id="fee-plan" name="fee_plan_id" defaultValue={c.fee_plan_id ?? ""} className="input">
                  <option value="">No plan</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({zar(p.monthly, true)}/month)</option>)}
                </select></div>
              <button className="btn btn-primary">Save</button>
            </form>
            <p className="text-xs muted mt-2">{plans.length ? "A new plan is billed from the current month once invoices have been generated." : "Add fee plans under Finance → Fees Collection."}</p>
          </Card>
        )}

        <Card title="Last two weeks" className={ctx.isAdmin ? "" : "xl:col-span-2"}>
          {days.length === 0 ? <p className="text-sm muted">No check-ins yet.</p> : (
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Day</th><th>In</th><th>Dropped off by</th><th>Out</th><th>Collected by</th></tr></thead>
              <tbody>{days.map((d) => (
                <tr key={d.date}>
                  <td className="whitespace-nowrap">{fmtDate(d.date)}</td>
                  <td>{d.in_at}</td>
                  <td className="text-sm">{d.dropped_by}{d.in_note && <p className="text-xs muted">{d.in_note}</p>}</td>
                  <td>{d.out_at ?? <span className="muted">-</span>}</td>
                  <td className="text-sm">{d.collected_by ?? ""}{d.unauthorised ? <span className="chip chip-red ml-1">Not on the list</span> : null}{d.out_note && <p className="text-xs muted">{d.out_note}</p>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
