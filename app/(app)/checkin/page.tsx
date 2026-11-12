import Link from "next/link";
import { LogIn, LogOut, AlarmClock } from "lucide-react";
import { requireChildcare, allergiesOf, myRooms } from "@/lib/childcare";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { nowTime, today } from "@/lib/today";
import { Card, PageHeader, Empty, StatCard } from "@/components/ui/kit";
import { FormDialog, ConfirmButton, Filters, type Field } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { AllergyChips } from "@/components/childcare";
import { checkIn, checkOut, undoCheck } from "@/app/actions/childcare";

export const metadata = { title: "Check-in" };

type Kid = { id: number; first_name: string; last_name: string; className: string | null; in_at: string | null; dropped_by: string | null; out_at: string | null; collected_by: string | null; unauthorised: number };

export default async function CheckinPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireChildcare(["school_admin", "teacher"]);
  const sp = await searchParams, t = today(), now = nowTime();
  const rooms = await all<{ id: number; name: string }>("SELECT id, name FROM classes WHERE school_id = ? AND year = ? ORDER BY name", ctx.schoolId, ctx.school.current_year);
  // A practitioner starts on their own classroom; anyone can switch to another or to all.
  const mine = await myRooms(ctx);
  const room = sp.room === "all" ? 0 : Number(sp.room) || (mine[0] ?? 0);
  const kids = await all<Kid>(`
    SELECT l.id, l.first_name, l.last_name, c.name className, k.in_at, k.dropped_by, k.out_at, k.collected_by, COALESCE(k.unauthorised, 0) unauthorised
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id LEFT JOIN checkins k ON k.learner_id = l.id AND k.date = ?3
    WHERE l.school_id = ?1 AND l.status = 'Active' AND (?2 = 0 OR l.class_id = ?2) ORDER BY l.first_name, l.last_name`, ctx.schoolId, room, t);
  const ids = kids.map((k) => k.id), list = ids.length ? ids.join(",") : "0";
  const allergies = await allergiesOf(ids);
  // Everyone who may drop off or collect each child, in two queries for the whole board.
  const parents = await all<{ learner_id: number; id: number; name: string; relationship: string }>(`SELECT g.learner_id, u.id, u.first_name || ' ' || u.last_name name, g.relationship
    FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE u.active = 1 AND g.learner_id IN (${list})`);
  const contacts = await all<{ learner_id: number; id: number; name: string; relationship: string | null; id_last_digits: string | null }>(
    `SELECT learner_id, id, name, relationship, id_last_digits FROM child_contacts WHERE can_collect = 1 AND learner_id IN (${list}) ORDER BY name`);

  const people = (k: Kid) => [
    ...parents.filter((p) => p.learner_id === k.id).map((p) => ({ value: `parent:${p.id}`, label: `${p.name} (${p.relationship})` })),
    ...contacts.filter((c) => c.learner_id === k.id).map((c) => ({ value: `contact:${c.id}`, label: `${c.name}${c.relationship ? ` (${c.relationship})` : ""}${c.id_last_digits ? ` · ID …${c.id_last_digits}` : ""}` })),
  ];
  const inFields = (k: Kid): Field[] => [
    { name: "dropped_by", label: "Dropped off by", type: "select", required: true, options: [...people(k), { value: "other", label: "Someone else" }], defaultValue: people(k)[0]?.value ?? "other" },
    { name: "dropped_other", label: "Their name", showIf: { field: "dropped_by", value: "other" } },
    { name: "note", label: "Note from the parent (optional)", placeholder: "e.g. Slept badly, has a cough" },
  ];
  const outFields = (k: Kid): Field[] => [
    { name: "collected_by", label: "Collected by", type: "select", required: true, options: [...people(k), { value: "other", label: "Someone NOT on the list" }], defaultValue: people(k)[0]?.value ?? "other",
      help: "Only the people on the list may collect. Check their ID if you don't know them." },
    { name: "collected_other", label: "Their full name", showIf: { field: "collected_by", value: "other" } },
    { name: "confirm_other", label: "Did a parent confirm this person may collect?", type: "select", options: [{ value: "", label: "Choose..." }, { value: "1", label: "Yes, I checked with a parent" }],
      showIf: { field: "collected_by", value: "other" }, help: "The parents and the owner are alerted straight away." },
    { name: "note", label: "Note for the parent (optional)", placeholder: "e.g. Ate well, had a long nap" },
  ];

  const closes = ctx.school.closes_at;
  const late = closes && now > closes ? kids.filter((k) => k.in_at && !k.out_at) : [];
  const groups = [
    { title: "Not arrived", rows: kids.filter((k) => !k.in_at) },
    { title: "In now", rows: kids.filter((k) => k.in_at && !k.out_at) },
    { title: "Gone home", rows: kids.filter((k) => k.out_at) },
  ];

  return (
    <>
      <PageHeader title="Check-in" subtitle={`${fmtDate(t)} · ${now}${ctx.school.opens_at && closes ? ` · open ${ctx.school.opens_at}–${closes}` : ""}`}>
        <Filters filters={[{ name: "room", label: "Classroom", value: room || "all", options: [{ value: "all", label: "All classrooms" }, ...rooms.map((r) => ({ value: r.id, label: r.name }))] }]} />
      </PageHeader>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {groups.map((g, i) => <StatCard key={g.title} label={g.title} value={g.rows.length} tone={(["charcoal", "green", "sky"] as const)[i]} />)}
      </div>
      {late.length > 0 && (
        <div className="glass p-4 mb-6 border-2 !border-butter-300 flex items-start gap-3">
          <AlarmClock className="w-5 h-5 text-butter-600 shrink-0 mt-0.5" />
          <p className="text-sm"><b>Still here after closing ({closes}):</b> {late.map((k) => k.first_name).join(", ")}. Phone their parents.</p>
        </div>
      )}
      {kids.length === 0 ? <Card><Empty title="No children in this classroom" hint={rooms.length ? undefined : "Add classrooms and children first."} /></Card> : (
        <div className="space-y-6">
          {groups.filter((g) => g.rows.length).map((g) => (
            <section key={g.title}>
              <h2 className="text-sm font-semibold muted mb-2 uppercase tracking-wide">{g.title} · {g.rows.length}</h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {g.rows.map((k) => (
                  <div key={k.id} className={`glass p-4 flex flex-col gap-3 ${k.unauthorised ? "ring-2 ring-rose-400" : ""}`}>
                    <div className="flex items-center gap-3">
                      <Avatar first={k.first_name} last={k.last_name} size={44} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/children/${k.id}`} className="font-semibold text-lg leading-tight hover:underline">{k.first_name} {k.last_name}</Link>
                        <p className="text-xs muted">{room ? "" : `${k.className ?? "No classroom"} · `}{k.out_at ? `In ${k.in_at}, home ${k.out_at} with ${k.collected_by}` : k.in_at ? `In since ${k.in_at} · ${k.dropped_by}` : "Not here yet"}</p>
                      </div>
                    </div>
                    <AllergyChips allergies={allergies.filter((a) => a.learner_id === k.id)} compact />
                    {k.unauthorised ? <p className="text-xs text-rose-600 font-medium">Collected by someone not on the list. The parents were alerted.</p> : null}
                    <div className="flex flex-wrap gap-2 mt-auto">
                      {!k.in_at || k.out_at ? (
                        <FormDialog trigger="button" triggerLabel={k.out_at ? "Back again" : "Check in"} title={`Check in · ${k.first_name}`} hidden={{ learner_id: k.id }} action={checkIn} submitLabel="Check in" fields={inFields(k)} />
                      ) : (
                        <FormDialog trigger="button" triggerLabel="Check out" title={`Check out · ${k.first_name}`} hidden={{ learner_id: k.id }} action={checkOut} submitLabel="Check out" fields={outFields(k)} />
                      )}
                      {ctx.isAdmin && k.in_at && <ConfirmButton action={undoCheck.bind(null, k.id, k.out_at ? "out" : "in")} label="Undo"
                        confirmText={k.out_at ? `Undo ${k.first_name}'s check-out? They show as still in.` : `Undo ${k.first_name}'s check-in? Today's attendance mark is removed too.`} />}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="text-xs muted mt-6 flex items-center gap-1.5"><LogIn className="w-3.5 h-3.5" />Parents get a phone notification when their child arrives<LogOut className="w-3.5 h-3.5 ml-2" />and when they go home.</p>
    </>
  );
}
