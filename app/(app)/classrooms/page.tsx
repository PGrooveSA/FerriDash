import Link from "next/link";
import { Users, UserRound, AlertTriangle } from "lucide-react";
import { requireChildcare, classrooms, ratioSettings } from "@/lib/childcare";
import { all } from "@/lib/db";
import { today } from "@/lib/today";
import { AGE_GROUPS, ageGroupLabel, ratioFor } from "@/lib/org";
import { Card, PageHeader, Empty } from "@/components/ui/kit";
import { FormDialog, DeleteButton, type Field } from "@/components/ui/forms";
import { saveClassroom, deleteClassroom, saveRatios } from "@/app/actions/childcare";

export const metadata = { title: "Classrooms" };

export default async function ClassroomsPage() {
  const ctx = await requireChildcare(["school_admin", "teacher"]);
  const rooms = await classrooms(ctx, today());
  const staff = await all<{ id: number; name: string }>(`SELECT t.id, u.first_name || ' ' || u.last_name name FROM teachers t JOIN users u ON u.id = t.user_id
    WHERE t.school_id = ? AND t.status = 'Active' ORDER BY u.first_name, u.last_name`, ctx.schoolId);
  const custom = await ratioSettings(ctx.schoolId);

  const fields = (r?: (typeof rooms)[number]): Field[] => [
    { name: "name", label: "Classroom name", required: true, defaultValue: r?.name, placeholder: "e.g. Butterflies" },
    { name: "age_group", label: "Age group", type: "select", required: true, defaultValue: r?.age_group, options: AGE_GROUPS.map((g) => ({ value: g.id, label: g.label })), half: true },
    { name: "capacity", label: "Capacity (children)", type: "number", defaultValue: r?.capacity, half: true },
    { name: "room", label: "Room or building", defaultValue: r?.room, half: true },
    { name: "class_teacher_id", label: "Lead practitioner", type: "select", defaultValue: r?.lead_id, options: staff.map((s) => ({ value: s.id, label: s.name })), half: true },
    { name: "staff", label: "Other staff in this classroom", type: "checkboxes", options: staff.map((s) => ({ value: s.id, label: s.name })), defaultValues: r?.staff.filter((s) => !s.lead).map((s) => s.id) ?? [],
      emptyText: "Add staff under Staff first." },
  ];

  return (
    <>
      <PageHeader title="Classrooms" subtitle={`${rooms.length} classroom${rooms.length === 1 ? "" : "s"} · staff-to-child ratios use the children checked in right now`}>
        {ctx.isAdmin && <FormDialog title="Ratios: children per staff member" triggerLabel="Ratios" trigger="button" action={saveRatios} submitLabel="Save ratios"
          fields={AGE_GROUPS.map((g) => ({ name: `ratio_${g.id}`, label: g.label, type: "number", defaultValue: ratioFor(g.id, custom), half: true,
            help: `Default ${g.ratio}. Check the norms that apply to your centre.` }))} />}
        {ctx.isAdmin && <FormDialog title="Add a classroom" triggerLabel="Add classroom" fields={fields()} action={saveClassroom} size="lg" />}
      </PageHeader>
      {rooms.length === 0 ? <Card><Empty title="No classrooms yet" hint={ctx.isAdmin ? "Add a classroom for each age group, then put children in them." : "The owner adds the classrooms."} /></Card> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <Card key={r.id} title={r.name} className={r.over ? "ring-2 ring-rose-400" : ""} action={ctx.isAdmin && (
              <div className="flex gap-1">
                <FormDialog trigger="edit" title={`Edit ${r.name}`} fields={fields(r)} hidden={{ id: r.id }} action={saveClassroom} size="lg" />
                <DeleteButton action={deleteClassroom.bind(null, r.id)} label={r.name} />
              </div>
            )}>
              <p className="text-sm muted -mt-3 mb-4">{ageGroupLabel(r.age_group)}{r.room ? ` · ${r.room}` : ""}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="glass-strong rounded-2xl p-3"><p className="text-2xl font-bold">{r.present}</p><p className="text-xs muted">in now</p></div>
                <div className="glass-strong rounded-2xl p-3"><p className="text-2xl font-bold">{r.children}{r.capacity ? <span className="text-sm muted font-normal">/{r.capacity}</span> : null}</p><p className="text-xs muted">enrolled</p></div>
                <div className="glass-strong rounded-2xl p-3"><p className="text-2xl font-bold">1:{r.perStaff}</p><p className="text-xs muted">ratio</p></div>
              </div>
              {r.over ? (
                <p className="mt-3 text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {r.present} children need {r.needed} staff; {r.staff.length} assigned.</p>
              ) : r.capacity && r.children > r.capacity ? (
                <p className="mt-3 text-sm text-butter-600 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Over capacity: {r.children} enrolled for {r.capacity} places.</p>
              ) : null}
              <div className="mt-4">
                <p className="label">Staff</p>
                {r.staff.length === 0 ? <p className="text-sm muted">No staff assigned.</p> : (
                  <ul className="flex flex-wrap gap-1.5">{r.staff.map((s) => (
                    <li key={s.id} className="chip chip-slate"><UserRound className="w-3 h-3" />{s.name}{s.lead && <span className="muted font-normal">· lead</span>}</li>
                  ))}</ul>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Link href={`/children?room=${r.id}`} className="btn btn-ghost btn-sm"><Users className="w-4 h-4" />Children</Link>
                <Link href={`/checkin?room=${r.id}`} className="btn btn-ghost btn-sm">Check-in</Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
