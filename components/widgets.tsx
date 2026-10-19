import Link from "next/link";
import { all } from "@/lib/db";
import { fmtDate, fullName, avatarUrl } from "@/lib/format";
import { today, MONTHS } from "@/lib/today";
import Avatar from "./ui/Avatar";

const CAT_TONE: Record<string, string> = {
  academic: "bg-brand-100/80 border-brand-400 dark:bg-brand-500/15", sport: "bg-rose-100/70 border-rose-400 dark:bg-rose-500/15",
  meeting: "bg-butter-100/80 border-butter-500 dark:bg-butter-500/15", school: "bg-gold-100/80 border-gold-500 dark:bg-gold-500/15",
  holiday: "bg-emerald-100/70 border-emerald-500 dark:bg-emerald-500/15",
};
export const catTone = (c: string) => CAT_TONE[c] ?? CAT_TONE.school;

export function MiniCalendar({ schoolId }: { schoolId: number }) {
  const t = today();
  const [y, m] = t.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startPad = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const eventDays = new Set(all<{ date: string }>("SELECT DISTINCT date FROM events WHERE school_id = ? AND date LIKE ?", schoolId, `${y}-${String(m).padStart(2, "0")}-%`).map((e) => Number(e.date.slice(8))));
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold">{MONTHS[m - 1]} {y}</p>
        <Link href="/calendar" className="text-xs muted hover:text-[var(--ink)]">Open calendar</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="muted py-1">{d}</span>)}
        {cells.map((d, i) => (
          <span key={i} className={`relative py-1.5 rounded-xl text-sm ${d === Number(t.slice(8)) ? "bg-gradient-to-br from-brand-300 to-gold-300 text-slate-900 font-bold" : ""}`}>
            {d}
            {d && eventDays.has(d) && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold-500" />}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Agenda({ schoolId, limit = 4 }: { schoolId: number; limit?: number }) {
  const events = all<{ id: number; title: string; date: string; start_time: string | null; category: string; audience: string | null }>(
    "SELECT * FROM events WHERE school_id = ? AND date >= ? ORDER BY date, start_time LIMIT ?", schoolId, today(), limit);
  if (!events.length) return <p className="text-sm muted">No upcoming events.</p>;
  return (
    <ul className="space-y-2.5">
      {events.map((e) => (
        <li key={e.id} className="rounded-2xl px-4 py-3 bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10">
          <p className="text-xs muted">{fmtDate(e.date, { weekday: "short", day: "numeric", month: "short" })}{e.start_time ? ` · ${e.start_time}` : ""}{e.audience ? ` · ${e.audience}` : ""}</p>
          <p className="font-semibold text-sm mt-0.5">{e.title}</p>
        </li>
      ))}
    </ul>
  );
}

export function RecentMessages({ userId, limit = 4 }: { userId: number; limit?: number }) {
  // For direct chats, show the other person rather than the last sender.
  const rows = all<{ conversation_id: number; body: string; created_at: string; first_name: string; last_name: string; title: string | null; conv_title: string | null; is_group: number; uid: number; av: string | null }>(`
    SELECT m.conversation_id, m.body, m.created_at, c.title AS conv_title, c.is_group,
      COALESCE(o.id, u.id) uid, COALESCE(o.avatar_updated_at, u.avatar_updated_at) av,
      COALESCE(o.first_name, u.first_name) first_name, COALESCE(o.last_name, u.last_name) last_name, COALESCE(o.title, u.title) title
    FROM messages m JOIN users u ON u.id = m.sender_id JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN users o ON c.is_group = 0 AND o.id = (SELECT user_id FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id <> ?1 LIMIT 1)
    WHERE m.id IN (SELECT MAX(id) FROM messages WHERE conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?1) GROUP BY conversation_id)
    ORDER BY m.created_at DESC LIMIT ?2`, userId, limit);
  if (!rows.length) return <p className="text-sm muted">No messages yet.</p>;
  return (
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
              <p className="text-xs muted line-clamp-2">{r.is_group ? `${r.first_name}: ` : ""}{r.body}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NoticeList({ schoolId, audiences, limit = 4 }: { schoolId: number; audiences: string[]; limit?: number }) {
  const rows = all<{ id: number; title: string; body: string; created_at: string; views: number; tags: string | null }>(
    `SELECT id, title, body, created_at, views, tags FROM notices WHERE school_id = ? AND audience IN (${audiences.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT ?`, schoolId, ...audiences, limit);
  return (
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
  );
}
