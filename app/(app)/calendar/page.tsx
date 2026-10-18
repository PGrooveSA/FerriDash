import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today, MONTHS } from "@/lib/today";
import { Card, PageHeader } from "@/components/ui/kit";
import { FormDialog, DeleteButton, type Field } from "@/components/ui/forms";
import { catTone } from "@/components/widgets";
import { saveEvent, deleteEvent } from "@/app/actions/content";

export const metadata = { title: "Calendar" };
type E = { id: number; title: string; date: string; start_time: string | null; end_time: string | null; category: string; audience: string | null; description: string | null };
const CATS = [{ value: "school", label: "School event" }, { value: "academic", label: "Academic / exams" }, { value: "sport", label: "Sport & culture" }, { value: "meeting", label: "Meeting" }, { value: "holiday", label: "Public holiday" }];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const t = today();
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : t.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const events = all<E>("SELECT * FROM events WHERE school_id = ? AND date LIKE ? ORDER BY date, start_time", ctx.schoolId, `${ym}-%`);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : t.startsWith(ym) ? t : `${ym}-01`;
  const dayEvents = all<E>("SELECT * FROM events WHERE school_id = ? AND date = ? ORDER BY start_time", ctx.schoolId, selected);
  const staff = ctx.isAdmin || ctx.user.role === "teacher";

  const startPad = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const fields = (e?: E): Field[] => [
    { name: "title", label: "Event", required: true, defaultValue: e?.title },
    { name: "date", label: "Date", type: "date", required: true, defaultValue: e?.date ?? selected, half: true },
    { name: "category", label: "Category", type: "select", required: true, options: CATS, defaultValue: e?.category ?? "school", half: true },
    { name: "start_time", label: "Starts", type: "time", defaultValue: e?.start_time, half: true },
    { name: "end_time", label: "Ends", type: "time", defaultValue: e?.end_time, half: true },
    { name: "audience", label: "Audience", defaultValue: e?.audience, placeholder: "e.g. All, Grade 12, Staff", half: true },
    { name: "description", label: "Details", type: "textarea", defaultValue: e?.description },
  ];

  return (
    <>
      <PageHeader title="School calendar" subtitle="Term dates, examinations, meetings, sport and public holidays.">
        {staff && <FormDialog title="Add event" triggerLabel="Add event" fields={fields()} action={saveEvent} />}
      </PageHeader>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <Link href={`/calendar?m=${prev}`} className="icon-btn" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></Link>
            <h2 className="text-xl font-semibold">{MONTHS[m - 1]} {y}</h2>
            <div className="flex gap-2"><Link href="/calendar" className="btn btn-ghost btn-sm">Today</Link><Link href={`/calendar?m=${next}`} className="icon-btn" aria-label="Next month"><ChevronRight className="w-4 h-4" /></Link></div>
          </div>
          <div className="grid grid-cols-7 rounded-2xl overflow-hidden border border-line">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <div key={d} className="px-2 sm:px-3 py-3 text-xs font-semibold bg-brand-100/60 dark:bg-brand-500/10">{d}</div>)}
            {cells.map((d, i) => {
              const date = d ? `${ym}-${String(d).padStart(2, "0")}` : "";
              const evs = events.filter((e) => e.date === date);
              return (
                <Link key={i} href={d ? `/calendar?m=${ym}&d=${date}` : "#"} className={`min-h-[5.5rem] sm:min-h-[7rem] p-1.5 sm:p-2 border-t border-l border-line first:border-l-0 [&:nth-child(7n+1)]:border-l-0 ${!d ? "pointer-events-none bg-slate-500/5" : date === selected ? "bg-lilac-100/50 dark:bg-lilac-500/10" : "hover:bg-white/40 dark:hover:bg-white/5"}`}>
                  {d && (
                    <>
                      <span className={`text-sm font-semibold inline-grid place-items-center w-7 h-7 rounded-full ${date === t ? "bg-gradient-to-br from-brand-400 to-lilac-500 text-white" : ""}`}>{String(d).padStart(2, "0")}</span>
                      <div className="space-y-1 mt-1">
                        {evs.slice(0, 2).map((e) => <div key={e.id} className={`text-[0.68rem] sm:text-xs truncate rounded-md border-l-[3px] px-1.5 py-0.5 ${catTone(e.category)}`}>{e.title}</div>)}
                        {evs.length > 2 && <div className="text-[0.65rem] muted">{evs.length - 2} more</div>}
                      </div>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-xs">{CATS.map((c) => <span key={c.value} className={`rounded-md border-l-[3px] px-2 py-0.5 ${catTone(c.value)}`}>{c.label}</span>)}</div>
        </Card>
        <div className="space-y-6">
          <Card title={fmtDate(selected, { weekday: "long", day: "numeric", month: "long" })}>
            {dayEvents.length === 0 ? <p className="text-sm muted">Nothing scheduled.</p> : (
              <ul className="space-y-3">{dayEvents.map((e) => (
                <li key={e.id} className={`rounded-2xl border-l-4 p-4 ${catTone(e.category)}`}>
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
          <Card title={`This month (${events.length})`}>
            <ul className="space-y-2 text-sm">{events.map((e) => (
              <li key={e.id}><Link href={`/calendar?m=${ym}&d=${e.date}`} className="flex gap-3 hover:underline"><span className="muted w-12 shrink-0">{fmtDate(e.date, { day: "numeric", month: "short" })}</span>{e.title}</Link></li>
            ))}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
