import Link from "next/link";
import { CalendarClock, FileText } from "lucide-react";
import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today, addDays } from "@/lib/today";
import { visibleAssignments, markAssignmentsSeen, type Assignment } from "@/lib/assignments";
import { Card, Empty, PageHeader, hrefWith } from "@/components/ui/kit";
import { DeleteButton, Filters, FormDialog, type Field } from "@/components/ui/forms";
import { tFor, type T } from "@/lib/i18n";
import { saveAssignment, deleteAssignment, deleteOldAssignments } from "@/app/actions/assignments";

export const metadata = { title: "Assignments" };

/** "Due today", "Due in 3 days", "Overdue by 2 days" and the chip colour to go with it. */
function dueLabel(due: string, t: string, tr: T): { text: string; tone: string } {
  const days = Math.round((Date.parse(due) - Date.parse(t)) / 86_400_000);
  if (days < 0) return { text: tr("Was due {date}", { date: fmtDate(due, { day: "numeric", month: "short" }) }), tone: "chip-slate" };
  if (days === 0) return { text: tr("Due today"), tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" };
  if (days === 1) return { text: tr("Due tomorrow"), tone: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-100" };
  return { text: tr("Due in {n} days", { n: days }), tone: days <= 7 ? "bg-gold-100 text-gold-700 dark:bg-gold-500/20 dark:text-gold-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100" };
}

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const tr = tFor(ctx.user);
  const sp = await searchParams;
  const t = today();
  const staff = ctx.isAdmin || ctx.user.role === "teacher";
  const past = sp.show === "past";
  if (!staff) await markAssignmentsSeen(ctx.user.id);

  // Class subjects this staff member can set work for (current year).
  const teachable = staff ? await all<{ id: number; class_id: number; label: string }>(`
    SELECT cs.id, c.id class_id, c.name || ' · ' || s.name label FROM class_subjects cs JOIN classes c ON c.id = cs.class_id JOIN subjects s ON s.id = cs.subject_id
    WHERE cs.school_id = ? AND c.year = ? ${ctx.isAdmin ? "" : "AND (cs.teacher_id = ? OR c.class_teacher_id = ?)"} ORDER BY c.grade, c.name, s.name`,
    ctx.schoolId, ctx.school.current_year, ...(ctx.isAdmin ? [] : [ctx.teacherId ?? -1, ctx.teacherId ?? -1])) : [];
  // Parents: whose class is it (a family can have children in several classes).
  const kids = ctx.user.role === "parent" ? await (async () => {
    const ids = (await ownLearnerIds(ctx)) ?? [];
    return ids.length ? all<{ first_name: string; class_id: number }>(`SELECT first_name, class_id FROM learners WHERE id IN (${ids.map(() => "?").join(",")}) AND status = 'Active'`, ...ids) : [];
  })() : [];
  const childNames = (classId: number) => kids.filter((k) => k.class_id === classId).map((k) => k.first_name).join(" & ");

  const classes = [...new Map(teachable.map((c) => [c.class_id, c.label.split(" · ")[0]])).entries()];
  const classFilter = Number(sp.class) || null;
  const rows = (await visibleAssignments(ctx, past ? { to: addDays(t, -1) } : { from: t }))
    .filter((a) => !classFilter || a.class_id === classFilter);
  if (past) rows.reverse(); // most recent first

  const fields = (a?: Assignment): Field[] => [
    { name: "class_subject_id", label: "Class and subject", type: "select", required: true, defaultValue: a?.class_subject_id, options: teachable.map((c) => ({ value: c.id, label: c.label })) },
    { name: "title", label: "Title", required: true, defaultValue: a?.title, placeholder: "e.g. Photosynthesis worksheet" },
    { name: "due_date", label: "Due date", type: "date", required: true, defaultValue: a?.due_date ?? addDays(t, 7), half: true },
    { name: "document", label: a?.document_name ? "Replace PDF" : "Attach a PDF (optional)", type: "file", accept: ".pdf,application/pdf", maxMb: 4, half: true },
    ...(a?.document_name ? [{ name: "remove_document", label: "Current PDF", type: "select", options: [{ value: "0", label: "Keep it" }, { value: "1", label: "Remove it" }], defaultValue: "0", half: true } as Field] : []),
    { name: "instructions", label: "Instructions", type: "textarea", defaultValue: a?.instructions, placeholder: "What learners must do, pages, how to submit…" },
  ];

  return (
    <>
      <PageHeader title={tr("Assignments")} subtitle={staff ? tr("Set work for your classes. Learners and parents are notified and see the due date on their calendar.") : tr("Work set by your teachers, with due dates. Due dates also appear on your calendar.")}>
        <div className="flex rounded-full p-1 bg-white/40 dark:bg-white/5 border border-line">
          {[["Upcoming", null], ["Past", "past"]].map(([label, v]) => (
            <Link key={label} href={hrefWith("/assignments", sp, { show: v })} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${(v === "past") === past ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white shadow" : ""}`}>{tr(label ?? "")}</Link>
          ))}
        </div>
        {staff && classes.length > 1 && <Filters filters={[{ name: "class", label: "Class", value: classFilter, allLabel: "All classes", options: classes.map(([id, name]) => ({ value: id, label: tr("Class {name}", { name }) })) }]} />}
        {ctx.isAdmin && <FormDialog trigger="button" title="Delete old assignments" triggerLabel="Delete old…" submitLabel="Delete assignments" action={deleteOldAssignments}
          fields={[{ name: "before", label: "Delete every assignment due before", type: "date", required: true, defaultValue: addDays(t, -90), help: "Their PDFs are deleted too. This can't be undone. Assignments due on or after this date are kept." }]} />}
        {staff && teachable.length > 0 && <FormDialog title="New assignment" triggerLabel="New assignment" fields={fields()} action={saveAssignment} submitLabel="Set assignment" />}
      </PageHeader>

      {staff && teachable.length === 0 && <Card className="mb-6"><p className="text-sm muted">{tr("You aren't linked to any class or subject this year yet. The school admin can assign you under Classes & Subjects.")}</p></Card>}

      {rows.length === 0 ? (
        <Card><Empty title={past ? tr("No past assignments") : tr("No upcoming assignments")} hint={staff ? (past ? undefined : tr("Use New assignment to set work for a class.")) : tr("New assignments from teachers will show here, and you'll get a notification.")} /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((a) => {
            const due = dueLabel(a.due_date, t, tr), mine = ctx.isAdmin || a.created_by === ctx.user.id || teachable.some((c) => c.id === a.class_subject_id);
            return (
              <article key={a.id} className="glass p-5 flex flex-col gap-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-xs font-semibold text-brand-600 dark:text-brand-300 uppercase tracking-wide">{a.subject} · {tr("Class {name}", { name: a.class_name })}{childNames(a.class_id) ? ` · ${childNames(a.class_id)}` : ""}</p>
                    <h2 className="text-lg font-semibold mt-0.5"><Link href={`/assignments/${a.id}`} className="hover:underline">{a.title}</Link></h2>
                  </div>
                  <span className={`chip ${due.tone}`}><CalendarClock className="w-3 h-3" />{due.text}</span>
                </div>
                {a.instructions && <p className="text-sm whitespace-pre-line">{a.instructions}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                  {a.document_name && (
                    <Link href={`/assignments/${a.id}`} className="flex items-center gap-2 rounded-2xl px-3 py-2 bg-black/5 hover:bg-black/10 dark:bg-white/10 text-sm font-medium max-w-full">
                      <FileText className="w-4 h-4 shrink-0 text-rose-600" /><span className="truncate">{a.document_name}</span>
                    </Link>
                  )}
                  <span className="text-xs muted ml-auto">{tr("Due {date}", { date: fmtDate(a.due_date, { weekday: "long", day: "numeric", month: "long" }) })}{a.author ? ` · ${tr("set by {name}", { name: a.author })}` : ""}</span>
                </div>
                {staff && mine && (
                  <div className="flex gap-1.5">
                    <FormDialog trigger="edit" title="Edit assignment" fields={fields(a)} hidden={{ id: a.id }} action={saveAssignment} />
                    {ctx.isAdmin && <DeleteButton action={deleteAssignment.bind(null, a.id)} label={a.title} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
