"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, MessageSquare } from "lucide-react";

type Counts = { notices: number; messages: number };

const Dot = () => <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />;

/**
 * Messages and notices icons with unread dots.
 * The top bar lives in the shared layout, which Next.js does not re-render between pages,
 * so counts are re-fetched on every navigation, when the window regains focus, and every 30s.
 */
export default function Indicators({ initial }: { initial: Counts }) {
  const [counts, setCounts] = useState(initial);
  const path = usePathname();
  const search = useSearchParams().toString();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/unread", { cache: "no-store" });
      if (r.ok) setCounts(await r.json());
    } catch { /* offline or server restarting: keep the last known counts */ }
  }, []);

  useEffect(() => { refresh(); }, [path, search, refresh]);
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); window.removeEventListener("focus", refresh); };
  }, [refresh]);

  // While reading the notice board everything on it counts as read.
  const notices = path.startsWith("/notices") ? 0 : counts.notices;
  const messages = counts.messages;
  const plural = (n: number, w: string) => `${n} unread ${w}${n === 1 ? "" : "s"}`;

  return (
    <>
      <Link href="/messages" className="icon-btn relative" aria-label={messages ? `Messages, ${messages} unread` : "Messages"} title={messages ? plural(messages, "message") : "Messages"}>
        <MessageSquare className="w-[1.1rem] h-[1.1rem]" />
        {messages > 0 && <Dot />}
      </Link>
      <Link href="/notices" className="icon-btn relative" aria-label={notices ? `Notices, ${notices} unread` : "Notices"} title={notices ? plural(notices, "notice") : "Notices"}>
        <Bell className="w-[1.1rem] h-[1.1rem]" />
        {notices > 0 && <Dot />}
      </Link>
    </>
  );
}
