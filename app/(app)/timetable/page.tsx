import { CalendarPlus, Clock, MapPin, User } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today } from "@/lib/today";
import { tFor } from "@/lib/i18n";
import { familyClassIds } from "@/lib/assignments";
import { DAYS, classTimetable, managedClasses, slotName, weekday, type Slot } from "@/lib/timetable";
import { Card, Empty, PageHeader } from "@/components/ui/kit";
import { DeleteButton, Filters, FormDialog, type Field } from "@/components/ui/forms";
import { saveSlot, deleteSlot } from "@/app/actions/timetable";

export const metadata = { title: "Timetable" };

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const tr = tFor(ctx.user);
  const sp = await searchParams;
  const staff = ctx.isAdmin || ctx.user.role === "teacher";
  const t = today();

  // The classes this user can look at: staff the ones they manage, families their children's.
  const classes = staff ? await managedClasses(ctx) : await (async () => {
    const ids = await familyClassIds(ctx);
    return ids.length ? all<{ id: number; name: string; grade: number }>(`SELECT id, name, grade FROM classes WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY grade, name`, ...ids) : [];
  })();
  const classId = classes.find((c) => c.id === Number(sp.class))?.id ?? classes[0]?.id;
  const current = classes.find((c) => c.id === classId);
  const { weekly, extra } = classId ? await classTimetable(classId) : { weekly: [], extra: [] };
  const subjects = staff && classId ? await all<{ id: number; name: string }>(
    "SELECT cs.id, s.name FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.class_id = ? ORDER BY s.name", classId) : [];

  // Monday to Friday always; weekend days only when something is scheduled on them.
  const days = DAYS.map((name, i) => ({ name, n: i + 1 })).filter((d) => d.n <= 5 || weekly.some((s) => s.day_of_week === d.n));
  const todayN = weekday(t);

  const fields = (s?: Slot): Field[] => [
    { name: "lesson", label: "Subject", type: "select", required: true, defaultValue: s ? (s.class_subject_id ? `cs:${s.class_subject_id}` : `c:${s.class_id}`) : undefined,
      options: [...subjects.map((x) => ({ value: `cs:${x.id}`, label: x.name })), { value: `c:${classId}`, label: "Other activity (name it below)" }] },
    { name: "title", label: "Name or topic", defaultValue: s?.title, placeholder: "e.g. Assembly, or Revision: fractions", half: true },
    { name: "room", label: "Room or venue", defaultValue: s?.room, placeholder: "e.g. Room 12, Science lab", half: true },
    { name: "repeat", label: "When", type: "select", required: true, defaultValue: s?.date ? "once" : "weekly", half: true,
      options: [{ value: "weekly", label: "Every week" }, { value: "once", label: "Once, on a date (extra class)" }] },
    { name: "day_of_week", label: "Day (every week)", type: "select", defaultValue: s?.day_of_week ?? undefined, half: true, options: DAYS.map((d, i) => ({ value: i + 1, label: d })) },
    { name: "date", label: "Date (extra class)", type: "date", defaultValue: s?.date ?? undefined, half: true },
    { name: "start_time", label: "Starts", type: "time", required: true, defaultValue: s?.start_time, half: true },
    { name: "end_time", label: "Ends", type: "time", required: true, defaultValue: s?.end_time, half: true },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: s?.notes, placeholder: "Anything learners should bring or know (optional)" },
  ];

  const slotCard = (s: Slot, withDate = false) => (
    <div key={s.id} className="rounded-2xl px-3 py-2.5 bg-white/60 dark:bg-white/5 border border-line">
      <p className="text-xs font-semibold text-brand-600 dark:text-brand-300 flex items-center gap-1"><Clock className="w-3 h-3" />{withDate && s.date ? `${fmtDate(s.date, { weekday: "short", day: "numeric", month: "short" })} · ` : ""}{s.start_time}–{s.end_time}</p>
      <p className="font-semibold text-sm mt-0.5">{slotName(s)}</p>
      {(s.teacher || s.room) && <p className="text-xs muted mt-0.5 flex flex-wrap gap-x-3">{s.teacher && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{s.teacher}</span>}{s.room && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{s.room}</span>}</p>}
      {s.notes && <p className="text-xs mt-1 whitespace-pre-line">{s.notes}</p>}
      {staff && <div className="flex gap-1.5 mt-2"><FormDialog trigger="edit" title="Edit lesson" fields={fields(s)} hidden={{ id: s.id }} action={saveSlot} size="lg" /><DeleteButton action={deleteSlot.bind(null, s.id)} label={slotName(s)} /></div>}
    </div>
  );

  return (
    <>
      <PageHeader title={tr("Timetable")} subtitle={current ? `${tr("Class {name}", { name: current.name })} · ${staff ? tr("Weekly lessons and extra classes. Learners and parents see them on their dashboard.") : tr("Your weekly lessons and extra classes.")}` : undefined}>
        {classes.length > 1 && <Filters filters={[{ name: "class", label: "Class", value: classId, options: classes.map((c) => ({ value: c.id, label: tr("Class {name}", { name: c.name }) })) }]} />}
        {staff && classId && <FormDialog title="Add lesson" triggerLabel="Add lesson" fields={fields()} action={saveSlot} submitLabel="Save" size="lg" />}
      </PageHeader>

      {!classId ? (
        <Card><Empty title={staff ? tr("No classes to schedule") : tr("No class yet")} hint={staff ? tr("You can schedule the classes you teach or register. The school admin links you to them under Classes & Subjects.") : tr("Ask the school office to place your child in a class.")} /></Card>
      ) : (
        <>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${days.length > 5 ? "xl:grid-cols-7" : "xl:grid-cols-5"}`}>
            {days.map((d) => {
              const list = weekly.filter((s) => s.day_of_week === d.n);
              return (
                <Card key={d.n} className={d.n === todayN ? "ring-2 ring-gold-300" : ""} title={<span className="flex items-center gap-2">{tr(d.name)}{d.n === todayN && <span className="chip chip-gold">{tr("Today")}</span>}</span>}>
                  {list.length ? <div className="space-y-2">{list.map((s) => slotCard(s))}</div> : <p className="text-sm muted">{tr("No lessons.")}</p>}
                </Card>
              );
            })}
          </div>
          <Card className="mt-6" title={<span className="flex items-center gap-2"><CalendarPlus className="w-4 h-4" />{tr("Extra classes")}</span>}>
            {extra.length ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{extra.map((s) => slotCard(s, true))}</div>
              : <p className="text-sm muted">{staff ? tr("No extra classes coming up. Use Add lesson and choose “Once, on a date”.") : tr("No extra classes coming up.")}</p>}
          </Card>
        </>
      )}
    </>
  );
}
