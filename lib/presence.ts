import { run } from "./db";
import type { T } from "./i18n/core";

// Who is online: every open FerriDash page checks in about every 30 seconds (the top bar's unread counts),
// which records the time in users.last_seen_at. Someone seen in the last two minutes counts as online.
const ONLINE_MS = 2 * 60_000;
const TZ = "Africa/Johannesburg";

/** Records that this user is active now (at most once a minute, to keep database writes down). */
export async function touchLastSeen(userId: number) {
  const cutoff = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace("T", " ");
  await run("UPDATE users SET last_seen_at = datetime('now') WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)", userId, cutoff);
}

const parse = (s: string) => new Date(s.replace(" ", "T") + "Z");

export function isOnline(lastSeen: string | null | undefined): boolean {
  return !!lastSeen && Date.now() - parse(lastSeen).getTime() < ONLINE_MS;
}

/** "Online", "Last seen today at 14:05", "Last seen yesterday at 09:30" or "Last seen 27 Oct at 14:05" (SA time). */
export function presenceLabel(lastSeen: string | null | undefined, tr: T): string | null {
  if (!lastSeen) return null;
  if (isOnline(lastSeen)) return tr("Online");
  const seen = parse(lastSeen);
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const time = seen.toLocaleTimeString("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const now = new Date();
  if (day(seen) === day(now)) return tr("Last seen today at {time}", { time });
  if (day(seen) === day(new Date(now.getTime() - 86_400_000))) return tr("Last seen yesterday at {time}", { time });
  const sameYear = seen.toLocaleDateString("en-ZA", { timeZone: TZ, year: "numeric" }) === now.toLocaleDateString("en-ZA", { timeZone: TZ, year: "numeric" });
  const date = seen.toLocaleDateString("en-ZA", { timeZone: TZ, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  return tr("Last seen {date} at {time}", { date, time });
}
