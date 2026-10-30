import Link from "next/link";
import { all, get } from "@/lib/db";
import { fmtDate, fullName, avatarUrl } from "@/lib/format";
import { today } from "@/lib/today";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
import Avatar from "./ui/Avatar";
import type { Ctx } from "@/lib/auth";
import { visibleAssignments } from "@/lib/assignments";
import { messageText } from "@/lib/richtext";
import { makeT, type T } from "@/lib/i18n";
import { scheduleOn, slotName, upcomingExtras, type Slot } from "@/lib/timetable";
import { Card } from "./ui/kit";

/** How a dashboard summary is framed: a heading inside a card, its own card, or bare. */
type Frame = { heading?: string; card?: { title: string; action?: React.ReactNode } };
function Framed({ heading, card, children }: Frame & { children: React.ReactNode }) {
  if (card) return <Card title={card.title} action={card.action}>{children}</Card>;
  return <>{heading && <h3 className="font-semibold mt-6 mb-3">{heading}</h3>}{children}</>;
}

const EN = makeT({});

/** Calendar categories as solid colour labels (no edge stripe); each colour is distinct at a glance. */
const CAT_TONE: Record<string, string> = {
  school: "bg-gold-300 text-slate-900 dark:bg-gold-500/70 dark:text-white",
  academic: "bg-brand-300 text-slate-900 dark:bg-brand-500/70 dark:text-white",
  sport: "bg-rose-300 text-slate-900 dark:bg-rose-500/70 dark:text-white",
  meeting: "bg-violet-300 text-slate-900 dark:bg-violet-500/70 dark:text-white",
  holiday: "bg-emerald-300 text-slate-900 dark:bg-emerald-500/70 dark:text-white",
  assignment: "bg-sky-300 text-slate-900 dark:bg-sky-500/70 dark:text-white",
};
export const catTone = (c: string) => CAT_TONE[c] ?? CAT_TONE.school;

/** Soft, plain card colours that rotate card by card (no coloured edge). */
const CARD_TONES = [
  "bg-sky-100/80 border-sky-200/80 dark:bg-sky-500/15 dark:border-sky-400/20",
  "bg-emerald-100/80 border-emerald-200/80 dark:bg-emerald-500/15 dark:border-emerald-400/20",
  "bg-gold-100/90 border-gold-200/80 dark:bg-gold-500/15 dark:border-gold-400/20",
  "bg-brand-100/80 border-brand-200/80 dark:bg-brand-500/15 dark:border-brand-400/20",
  "bg-charcoal-100/90 border-charcoal-200/80 dark:bg-charcoal-400/15 dark:border-charcoal-300/20",
];
export const cardTone = (i: number) => CARD_TONES[i % CARD_TONES.length];

/** This month at a glance: school events (gold dots) and, given a learner or parent, their assignment due dates (blue). */
export async function MiniCalendar({ schoolId, ctx, tr = EN }: { schoolId: number; ctx?: Ctx; tr?: T }) {
  const t = today();
  const [y, m] = t.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startPad = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const eventDays = new Set((await all<{ date: string }>("SELECT DISTINCT date FROM events WHERE school_id = ? AND date LIKE ?", schoolId, `${y}-${String(m).padStart(2, "0")}-%`)).map((e) => Number(e.date.slice(8))));
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  const dueDays = new Set(ctx ? (await visibleAssignments(ctx, { from: `${ym}-01`, to: `${ym}-31` })).map((a) => Number(a.due_date.slice(8))) : []);
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold">{tr(MONTH_NAMES[m - 1])} {y}</p>
        <Link href="/calendar" className="text-xs muted hover:text-[var(--ink)]">{tr("Open calendar")}</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="muted py-1">{tr(d)}</span>)}
        {cells.map((d, i) => (
          <span key={i} className={`relative py-1.5 rounded-xl text-sm ${d === Number(t.slice(8)) ? "bg-gradient-to-br from-brand-300 to-gold-300 text-slate-900 font-bold" : ""}`}>
            {d}
            {d && (eventDays.has(d) || dueDays.has(d)) && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                {eventDays.has(d) && <span className="w-1 h-1 rounded-full bg-gold-500" />}
                {dueDays.has(d) && <span className="w-1 h-1 rounded-full bg-sky-500" title={tr("Assignment due")} />}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Upcoming assignments for a learner or parent (their classes), soonest first; new ones since they last looked are marked. */
/** Nothing at all when no work is due, so the dashboard doesn't show an empty section. */
export async function AssignmentsDue({ ctx, limit = 4, tr = EN, ...frame }: { ctx: Ctx; limit?: number; tr?: T } & Frame) {
  const t = today();
  const all_ = await visibleAssignments(ctx, { from: t });
  const seen = (await get<{ s: string | null }>("SELECT assignments_seen_at s FROM users WHERE id = ?", ctx.user.id))?.s ?? "";
  if (!all_.length) return null;
  return (
    <Framed {...frame}>
      <ul className="space-y-2.5">
        {all_.slice(0, limit).map((a) => {
          const days = Math.round((Date.parse(a.due_date) - Date.parse(t)) / 86_400_000);
          return (
            <li key={a.id}>
              <Link href={`/assignments/${a.id}`} className={`block rounded-2xl px-4 py-3 ${catTone("assignment")} hover:brightness-95`}>
                <p className="text-xs opacity-80 flex justify-between gap-2">
                  <span>{a.subject} · {tr("Class {name}", { name: a.class_name })}</span>
                  <span className={`shrink-0 font-semibold ${days <= 1 ? "text-rose-700 dark:text-rose-100" : ""}`}>{days === 0 ? tr("Due today") : days === 1 ? tr("Due tomorrow") : tr("Due {date}", { date: fmtDate(a.due_date, { weekday: "short", day: "numeric", month: "short" }) })}</span>
                </p>
                <p className="font-semibold text-sm mt-0.5">{a.title}{a.created_at > seen && <span className="ml-2 align-middle text-[0.65rem] font-bold uppercase rounded-full px-1.5 py-0.5 bg-rose-500 text-white">{tr("New")}</span>}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      {all_.length > limit && <Link href="/assignments" className="block text-xs muted mt-2 hover:text-[var(--ink)]">{tr("{n} more due · see all assignments", { n: all_.length - limit })}</Link>}
    </Framed>
  );
}

export async function Agenda({ schoolId, limit = 4, tr = EN, ...frame }: { schoolId: number; limit?: number; tr?: T } & Frame) {
  const events = await all<{ id: number; title: string; date: string; start_time: string | null; category: string; audience: string | null }>(
      "SELECT * FROM events WHERE school_id = ? AND date >= ? ORDER BY date, start_time LIMIT ?", schoolId, today(), limit);
  if (!events.length) return null;
  return (
    <Framed {...frame}>
    <ul className="space-y-2.5">
      {events.map((e, i) => (
        <li key={e.id} className={`rounded-2xl px-4 py-3 border ${cardTone(i)}`}>
          <p className="text-xs muted">{fmtDate(e.date, { weekday: "short", day: "numeric", month: "short" })}{e.start_time ? ` · ${e.start_time}` : ""}{e.audience ? ` · ${e.audience}` : ""}</p>
          <p className="font-semibold text-sm mt-0.5">{e.title}</p>
        </li>
      ))}
    </ul>
    </Framed>
  );
}

export async function RecentMessages({ userId, limit = 4, tr = EN, ...frame }: { userId: number; limit?: number; tr?: T } & Frame) {
  // For direct chats, show the other person rather than the last sender.
  const rows = await all<{ conversation_id: number; body: string; created_at: string; first_name: string; last_name: string; title: string | null; conv_title: string | null; is_group: number; uid: number; av: string | null }>(`
    SELECT m.conversation_id, COALESCE(NULLIF(m.body, ''), '📎 ' || m.attachment_name) body, m.created_at, c.title AS conv_title, c.is_group,
      COALESCE(o.id, u.id) uid, COALESCE(o.avatar_updated_at, u.avatar_updated_at) av,
      COALESCE(o.first_name, u.first_name) first_name, COALESCE(o.last_name, u.last_name) last_name, COALESCE(o.title, u.title) title
    FROM messages m JOIN users u ON u.id = m.sender_id JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN users o ON c.is_group = 0 AND o.id = (SELECT user_id FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id <> ?1 LIMIT 1)
    WHERE m.id IN (SELECT MAX(id) FROM messages WHERE conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?1) GROUP BY conversation_id)
    ORDER BY m.created_at DESC LIMIT ?2`, userId, limit);
  if (!rows.length) return null;
  return (
    <Framed {...frame}>
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.conversation_id}>
          <Link href={`/messages?c=${r.conversation_id}`} className="flex gap-3 group">
            <Avatar first={r.first_name} last={r.last_name} size={40} photo={avatarUrl(r.uid, r.av)} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <p className="font-semibold text-sm truncate group-hover:underline">{r.is_group ? r.conv_title : fullName(r, true)}</p>
                <span className="text-[0.7rem] muted shrink-0">{fmtDate(r.created_at, { day: "numeric", month: "short" })}</span>
              </div>
              <p className="text-xs muted line-clamp-2">{r.is_group ? `${r.first_name}: ` : ""}{messageText(r.body)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
    </Framed>
  );
}

export async function NoticeList({ schoolId, audiences, limit = 4, tr = EN, ...frame }: { schoolId: number; audiences: string[]; limit?: number; tr?: T } & Frame) {
  const rows = await all<{ id: number; title: string; body: string; created_at: string; views: number; tags: string | null }>(
      `SELECT id, title, body, created_at, views, tags FROM notices WHERE school_id = ? AND audience IN (${audiences.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT ?`, schoolId, ...audiences, limit);
  if (!rows.length) return null;
  return (
    <Framed {...frame}>
    <ul className="divide-line">
      {rows.map((n) => (
        <li key={n.id} className="py-3 first:pt-0">
          <Link href={`/notices?id=${n.id}`} className="block group">
            <div className="flex justify-between gap-2">
              <p className="font-semibold text-sm group-hover:underline">{n.title}</p>
              <span className="chip chip-info shrink-0">{fmtDate(n.created_at, { day: "numeric", month: "short" })}</span>
            </div>
            <p className="text-xs muted line-clamp-2 mt-1">{n.body}</p>
          </Link>
        </li>
      ))}
    </ul>
    </Framed>
  );
}

/** Today's lessons for these classes (learners and parents), with extra classes coming up in the next two weeks. */
export async function ClassesToday({ classIds, slots, tr = EN, showClass = false, extras = true, ...frame }: { classIds: number[]; slots?: Slot[]; tr?: T; showClass?: boolean; extras?: boolean } & Frame) {
  const t = today();
  const list = slots ?? (await scheduleOn(classIds, t));
  const later = extras ? await upcomingExtras(classIds) : [];
  const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const row = (s: Slot, date?: string) => {
    const live = !date && s.start_time <= now && now < s.end_time, done = !date && s.end_time <= now;
    return (
      <li key={`${s.id}-${date ?? ""}`} className={`flex gap-3 rounded-2xl px-3 py-2.5 border ${live ? "bg-emerald-100/70 border-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-400/30" : "border-line"} ${done ? "opacity-60" : ""}`}>
        <span className="text-xs font-semibold w-[5.5rem] shrink-0 pt-0.5">{date ? <span className="block muted font-normal">{fmtDate(date, { weekday: "short", day: "numeric", month: "short" })}</span> : null}{s.start_time}–{s.end_time}</span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm">{slotName(s)}{s.date && !date ? <span className="ml-2 align-middle text-[0.65rem] font-bold uppercase rounded-full px-1.5 py-0.5 bg-gold-300 text-slate-900">{tr("Extra")}</span> : null}{live && <span className="ml-2 align-middle text-[0.65rem] font-bold uppercase rounded-full px-1.5 py-0.5 bg-emerald-500 text-white">{tr("Now")}</span>}</span>
          <span className="block text-xs muted">{[showClass ? tr("Class {name}", { name: s.class_name }) : null, s.teacher, s.room].filter(Boolean).join(" · ")}</span>
        </span>
      </li>
    );
  };
  if (!list.length && !later.length) return null;
  return (
    <Framed {...frame}>
      {list.length ? <ul className="space-y-2">{list.map((s) => row(s))}</ul> : <p className="text-sm muted">{tr("No classes today.")}</p>}
      {later.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide muted mt-4 mb-2">{tr("Extra classes coming up")}</p>
          <ul className="space-y-2">{later.slice(0, 4).map((s) => row(s, s.date!))}</ul>
        </>
      )}
    </Framed>
  );
}
