"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendMessage } from "@/app/actions/content";
import Avatar from "@/components/ui/Avatar";
import { avatarUrl } from "@/lib/format";

type M = { id: number; body: string; created_at: string; sender_id: number; first_name: string; last_name: string; title: string | null; role: string; avatar_updated_at: string | null };
const ROLE_TONE: Record<string, string> = { school_admin: "text-brand-600", teacher: "text-gold-500", parent: "text-butter-500", learner: "text-emerald-600", super_admin: "text-rose-500" };

export default function Thread({ convId, meId, isGroup, messages }: { convId: number; meId: number; isGroup: boolean; messages: M[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  // Opening a chat marks it read on the server; refresh once so the top bar's unread dot updates straight away.
  useEffect(() => { router.refresh(); }, [convId, router]);
  // Poll for new messages every 5 seconds while the chat is open (works fully offline on the LAN).
  useEffect(() => { const t = setInterval(() => router.refresh(), 5000); return () => clearInterval(t); }, [router]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    start(async () => {
      const r = await sendMessage(convId, body);
      if (r.error) setError(r.error); else { setText(""); setError(null); router.refresh(); }
    });
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && <p className="text-sm muted text-center mt-10">Say hello 👋</p>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex gap-3 items-end ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar first={m.first_name} last={m.last_name} size={32} photo={avatarUrl(m.sender_id, m.avatar_updated_at)} />
              <div className={`max-w-[75%] rounded-3xl px-4 py-3 shadow-sm ${mine ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white rounded-br-md" : "glass-solid !rounded-3xl rounded-bl-md"}`}>
                {isGroup && !mine && <p className={`text-xs font-semibold mb-1 ${ROLE_TONE[m.role] ?? ""}`}>{m.title ? `${m.title} ` : ""}{m.first_name} {m.last_name}</p>}
                <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[0.65rem] mt-1 text-right ${mine ? "text-white/75" : "muted"}`}>{new Date(m.created_at.replace(" ", "T") + "Z").toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-4 border-t border-line flex gap-2 items-end">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Type your message" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="input !rounded-3xl resize-none max-h-32" />
        <button disabled={pending || !text.trim()} className="icon-btn !w-11 !h-11 !bg-gradient-to-br from-brand-500 to-charcoal-500 text-white disabled:opacity-50" aria-label="Send"><Send className="w-4 h-4" /></button>
      </form>
      {error && <p className="text-sm text-rose-600 px-4 pb-3">{error}</p>}
    </>
  );
}
