import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, PartyPopper } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today } from "@/lib/today";
import { saHolidays, type Holiday } from "@/lib/holidays";
import { visibleAssignments } from "@/lib/assignments";
import { Card, PageHeader } from "@/components/ui/kit";
import { FormDialog, DeleteButton, type Field } from "@/components/ui/forms";
import { catTone, cardTone } from "@/components/widgets";
import { saveEvent, deleteEvent } from "@/app/actions/content";

export const metadata = { title: "Calendar" };
type E = { id: number; title: string; date: string; start_time: string | null; end_time: string | null; category: string; audience: string | null; description: string | null };
const CATS = [{ value: "school", label: "School event" }, { value: "academic", label: "Academic / exams" }, { value: "sport", label: "Sport & culture" }, { value: "meeting", label: "Meeting" }, { value: "holiday", label: "Public holiday" }];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const pad = (n: number) => String(n).padStart(2, "0");
const monthHref = (y: number, m: number, d?: string) => `/calendar?m=${y}-${pad(m)}${d ? `&d=${d}` : ""}`;
const yearHref = (y: number) => `/calendar?view=year&y=${y}`;
const shiftMonth = (y: number, m: number, by: number) => { const i = y * 12 + (m - 1) + by; return [Math.floor(i / 12), (i % 12) + 1] as const; };

/** Day numbers for a month grid, padded with nulls so weeks start on Sunday. */
function monthCells(y: number, m: number) {
  const cells: (number | null)[] = [...Array(new Date(Date.UTC(y, m - 1, 1)).getUTCDay()).fill(null), ...Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const t = today();
  const yearView = sp.view === "year";
  // Month view (default: this month), or year view; any year from 1900 to 2200.
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? sp.m! : t.slice(0, 7);
  const y = yearView ? Math.min(2200, Math.max(1900, Number(sp.y) || Number(t.slice(0, 4)))) : Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const span = yearView ? `${y}-%` : `${ym}-%`;
  const events = await all<E>("SELECT * FROM events WHERE school_id = ? AND date LIKE ? ORDER BY date, start_time", ctx.schoolId, span);
  // Due dates of assignments this person is involved in (admins: only ones they set, so the calendar stays readable).
  const assignments = await visibleAssignments(ctx, yearView ? { from: `${y}-01-01`, to: `${y}-12-31`, ownOnly: true } : { from: `${ym}-01`, to: `${ym}-31`, ownOnly: true });
  const holidays = saHolidays(y);
  const holidayOn = new Map<string, Holiday>(holidays.map((h) => [h.date, h]));
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") && sp.d!.startsWith(ym) ? sp.d! : t.startsWith(ym) ? t : `${ym}-01`;
  const dayEvents = events.filter((e) => e.date === selected);
  const dayAssignments = assignments.filter((a) => a.due_date === selected);
  const staff = ctx.isAdmin || ctx.user.role === "teacher";
  const nextHoliday = holidays.find((h) => h.date >= t);

  const fields = (e?: E): Field[] => [
    { name: "title", label: "Event", required: true, defaultValue: e?.title },
    { name: "date", label: "Date", type: "date", required: true, defaultValue: e?.date ?? selected, half: true },
    { name: "category", label: "Category", type: "select", required: true, options: CATS, defaultValue: e?.category ?? "school", half: true },
    { name: "start_time", label: "Starts", type: "time", defaultValue: e?.start_time, half: true },
    { name: "end_time", label: "Ends", type: "time", defaultValue: e?.end_time, half: true },
    { name: "audience", label: "Audience", defaultValue: e?.audience, placeholder: "e.g. All, Grade 12, Staff", half: true },
    { name: "description", label: "Details", type: "textarea", defaultValue: e?.description },
  ];

  const [py, pm] = shiftMonth(y, m, -1), [ny, nm] = shiftMonth(y, m, 1);
  const nav = yearView
    ? { prev: yearHref(y - 1), next: yearHref(y + 1), prevLabel: "Previous year", nextLabel: "Next year", title: String(y), today: yearHref(Number(t.slice(0, 4))) }
    : { prev: monthHref(py, pm), next: monthHref(ny, nm), prevLabel: "Previous month", nextLabel: "Next month", title: `${MONTH_NAMES[m - 1]} ${y}`, today: "/calendar" };
  const tab = (active: boolean) => `px-4 py-1.5 rounded-full text-sm font-semibold transition ${active ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white shadow" : "hover:bg-white/50 dark:hover:bg-white/10"}`;

  return (
    <>
      <PageHeader title="School calendar" subtitle="Term dates, examinations, meetings, sport and public holidays.">
        {staff && <FormDialog title="Add event" triggerLabel="Add event" fields={fields()} action={saveEvent} />}
      </PageHeader>
      <div className={`grid grid-cols-1 gap-6 ${yearView ? "" : "xl:grid-cols-[1fr_22rem]"}`}>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              {!yearView && <Link href={monthHref(y - 1, m)} className="icon-btn max-sm:!hidden" aria-label="Same month, previous year" title="Previous year"><ChevronsLeft className="w-4 h-4" /></Link>}
              <Link href={nav.prev} className="icon-btn" aria-label={nav.prevLabel} title={nav.prevLabel}><ChevronLeft className="w-4 h-4" /></Link>
              <h2 className="text-lg sm:text-xl font-semibold min-w-[9rem] sm:min-w-[10.5rem] text-center">{nav.title}</h2>
              <Link href={nav.next} className="icon-btn" aria-label={nav.nextLabel} title={nav.nextLabel}><ChevronRight className="w-4 h-4" /></Link>
              {!yearView && <Link href={monthHref(y + 1, m)} className="icon-btn max-sm:!hidden" aria-label="Same month, next year" title="Next year"><ChevronsRight className="w-4 h-4" /></Link>}
            </div>
            <div className="flex items-center gap-2">
              <Link href={nav.today} className="btn btn-ghost btn-sm">Today</Link>
              <div className="flex rounded-full p-1 bg-white/40 dark:bg-white/5 border border-line" role="tablist" aria-label="Calendar view">
                <Link href={monthHref(y, yearView ? (y === Number(t.slice(0, 4)) ? Number(t.slice(5, 7)) : 1) : m)} role="tab" aria-selected={!yearView} className={tab(!yearView)}>Month</Link>
                <Link href={yearHref(y)} role="tab" aria-selected={yearView} className={tab(yearView)}>Year</Link>
              </div>
            </div>
          </div>

          {yearView ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
              {MONTH_NAMES.map((name, i) => {
                const mm = i + 1, prefix = `${y}-${pad(mm)}`, count = events.filter((e) => e.date.startsWith(prefix)).length;
                return (
                  <div key={name} className="rounded-2xl border border-line p-3 bg-white/30 dark:bg-white/[0.03]">
                    <Link href={monthHref(y, mm)} className="flex justify-between items-baseline mb-2 hover:underline">
                      <span className="font-semibold">{name}</span>
                      {count > 0 && <span className="text-xs muted">{count} event{count === 1 ? "" : "s"}</span>}
                    </Link>
                    <div className="grid grid-cols-7 text-center text-[0.68rem] gap-y-0.5">
                      {WEEKDAYS.map((d) => <span key={d} className="muted font-semibold py-1">{d[0]}</span>)}
                      {monthCells(y, mm).map((d, k) => {
                        if (!d) return <span key={k} />;
                        const date = `${prefix}-${pad(d)}`, hol = holidayOn.get(date), has = events.some((e) => e.date === date) || assignments.some((a) => a.due_date === date);
                        return (
                          <Link key={k} href={monthHref(y, mm, date)} title={hol?.name}
                            className={`relative mx-auto w-7 h-7 grid place-items-center rounded-full text-xs ${date === t ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white font-semibold" : hol ? "bg-emerald-200/80 text-emerald-900 font-semibold dark:bg-emerald-500/30 dark:text-emerald-100" : "hover:bg-white/60 dark:hover:bg-white/10"}`}>
                            {d}
                            {has && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-brand-500" />}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-7 rounded-2xl overflow-hidden border border-line">
              {WEEKDAYS.map((d) => <div key={d} className="px-2 sm:px-3 py-3 text-xs font-semibold bg-brand-100/60 dark:bg-brand-500/10">{d}</div>)}
              {monthCells(y, m).map((d, i) => {
                const date = d ? `${ym}-${pad(d)}` : "";
                const evs = events.filter((e) => e.date === date), hol = holidayOn.get(date);
                const items = [...(hol ? [{ key: "h", title: hol.name, cat: "holiday" }] : []),
                  ...assignments.filter((a) => a.due_date === date).map((a) => ({ key: `a${a.id}`, title: `Due: ${a.subject} – ${a.title}`, cat: "assignment" })),
                  ...evs.map((e) => ({ key: String(e.id), title: e.title, cat: e.category }))];
                return (
                  <Link key={i} href={d ? monthHref(y, m, date) : "#"} className={`min-h-[5.5rem] sm:min-h-[7rem] p-1.5 sm:p-2 border-t border-l border-line first:border-l-0 [&:nth-child(7n+1)]:border-l-0 ${!d ? "pointer-events-none bg-slate-500/5" : date === selected ? "bg-gold-100/50 dark:bg-gold-500/10" : hol ? "bg-emerald-50/70 dark:bg-emerald-500/[0.06] hover:bg-emerald-100/60" : "hover:bg-white/40 dark:hover:bg-white/5"}`}>
                    {d && (
                      <>
                        <span className={`text-sm font-semibold inline-grid place-items-center w-7 h-7 rounded-full ${date === t ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white" : ""}`}>{pad(d)}</span>
                        <div className="space-y-1 mt-1">
                          {items.slice(0, 2).map((e) => <div key={e.key} className={`text-[0.68rem] sm:text-xs truncate rounded-md border-l-[3px] px-1.5 py-0.5 ${catTone(e.cat)}`}>{e.title}</div>)}
                          {items.length > 2 && <div className="text-[0.65rem] muted">{items.length - 2} more</div>}
                        </div>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-4 text-xs">{[...CATS, ...(ctx.isAdmin && !assignments.length ? [] : [{ value: "assignment", label: "Assignment due" }])].map((c) => <span key={c.value} className={`rounded-md border-l-[3px] px-2 py-0.5 ${catTone(c.value)}`}>{c.label}</span>)}</div>
        </Card>

        {!yearView && (
          <div className="space-y-6">
            <Card title={fmtDate(selected, { weekday: "long", day: "numeric", month: "long" })}>
              {holidayOn.get(selected) && <p className={`text-sm font-semibold rounded-xl border-l-[3px] px-3 py-2 mb-3 ${catTone("holiday")}`}>Public holiday: {holidayOn.get(selected)!.name}</p>}
              {dayAssignments.map((a) => (
                <Link key={a.id} href="/assignments" className={`block rounded-xl border-l-[3px] px-3 py-2 mb-3 hover:underline ${catTone("assignment")}`}>
                  <span className="block text-xs font-semibold uppercase tracking-wide">Assignment due · {a.subject} · Class {a.class_name}</span>
                  <span className="block text-sm font-semibold">{a.title}</span>
                </Link>
              ))}
              {dayEvents.length === 0 ? (dayAssignments.length || holidayOn.get(selected) ? null : <p className="text-sm muted">Nothing scheduled.</p>) : (
                <ul className="space-y-3">{dayEvents.map((e, i) => (
                  <li key={e.id} className={`rounded-2xl p-4 border ${cardTone(i)}`}>
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold">{e.title}</p>
                      {e.start_time && <span className="text-xs muted flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{e.start_time}{e.end_time ? `–${e.end_time}` : ""}</span>}
                    </div>
                    {e.audience && <p className="text-xs muted">{e.audience}</p>}
                    {e.description && <p className="text-sm mt-1">{e.description}</p>}
                    {staff && <div className="flex gap-1.5 mt-2"><FormDialog trigger="edit" title="Edit event" fields={fields(e)} hidden={{ id: e.id }} action={saveEvent} /><DeleteButton action={deleteEvent.bind(null, e.id)} label={e.title} /></div>}
                  </li>))}
                </ul>
              )}
            </Card>
            {assignments.length > 0 && (
              <Card title={`Assignments due this month (${assignments.length})`}>
                <ul className="space-y-2 text-sm">{assignments.map((a) => (
                  <li key={a.id}><Link href={monthHref(y, m, a.due_date)} className="flex gap-3 hover:underline"><span className="muted w-12 shrink-0">{fmtDate(a.due_date, { day: "numeric", month: "short" })}</span><span><b>{a.subject}</b> – {a.title}</span></Link></li>
                ))}</ul>
              </Card>
            )}
            <Card title={`This month (${events.length})`}>
              {events.length === 0 ? <p className="text-sm muted">No events this month.</p> : (
                <ul className="space-y-2 text-sm">{events.map((e) => (
                  <li key={e.id}><Link href={monthHref(y, m, e.date)} className="flex gap-3 hover:underline"><span className="muted w-12 shrink-0">{fmtDate(e.date, { day: "numeric", month: "short" })}</span>{e.title}</Link></li>
                ))}</ul>
              )}
            </Card>
          </div>
        )}
      </div>

      <Card className="mt-6" title={<>South African public holidays {y} <span className="text-sm font-normal muted">· {holidays.length} days; a holiday on a Sunday moves to the Monday</span></>}>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
          {holidays.map((h) => {
            const past = h.date < t, next = h.date === nextHoliday?.date;
            return (
              <li key={h.date}>
                <Link href={monthHref(y, Number(h.date.slice(5, 7)), h.date)} className={`flex items-center gap-3 py-2.5 border-b border-line hover:underline ${past ? "opacity-55" : ""}`}>
                  <span className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 leading-none text-center ${next ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white" : "bg-emerald-100/80 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100"}`}>
                    <span><span className="block text-base font-bold">{Number(h.date.slice(8, 10))}</span><span className="block text-[0.6rem] font-semibold uppercase">{MONTH_NAMES[Number(h.date.slice(5, 7)) - 1].slice(0, 3)}</span></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{h.name}</span>
                    <span className="block text-xs muted">{fmtDate(h.date, { weekday: "long" })}{h.observed ? " · day off for a Sunday holiday" : ""}</span>
                  </span>
                  {next && <span className="chip chip-slate shrink-0"><PartyPopper className="w-3 h-3" />Next</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-xs muted mt-3">Special public holidays declared by the President (such as election days) can be added as events in the &ldquo;Public holiday&rdquo; category.</p>
      </Card>
    </>
  );
}
