"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Paperclip, Send, X } from "lucide-react";
import { prepareAttachment, sendMessage } from "@/app/actions/content";
import Avatar from "@/components/ui/Avatar";
import PersonLink from "@/components/ProfileCard";
import { useT } from "@/components/I18nProvider";
import RichEditor, { type Mentionable, type RichEditorHandle } from "./RichEditor";
import { avatarUrl } from "@/lib/format";
import { MAX_MESSAGE_FILE_BYTES, MESSAGE_FILE_TYPES, fileExt, fmtBytes } from "@/lib/uploads";

type M = {
  id: number; html: string; created_at: string; sender_id: number; first_name: string; last_name: string; title: string | null; role: string; avatar_updated_at: string | null;
  attachment_name: string | null; attachment_type: string | null; attachment_size: number | null;
};
const ROLE_TONE: Record<string, string> = { school_admin: "text-brand-600", teacher: "text-gold-500", parent: "text-butter-500", learner: "text-emerald-600", super_admin: "text-rose-500" };
const ACCEPT = Object.keys(MESSAGE_FILE_TYPES).map((e) => "." + e).join(",");

export default function Thread({ convId, meId, isGroup, messages, mentionables }: { convId: number; meId: number; isGroup: boolean; messages: M[]; mentionables: Mentionable[] }) {
  const editor = useRef<RichEditorHandle>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();
  const end = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  // Opening a chat marks it read on the server; refresh once so the top bar's unread dot updates straight away.
  useEffect(() => { router.refresh(); }, [convId, router]);
  // Poll for new messages every 5 seconds while the chat is open.
  useEffect(() => { const t = setInterval(() => router.refresh(), 5000); return () => clearInterval(t); }, [router]);

  const choose = (f: File | undefined) => {
    if (picker.current) picker.current.value = "";
    if (!f) return;
    if (!MESSAGE_FILE_TYPES[fileExt(f.name)]) { setError(t("Attach a picture (JPG, PNG, WebP or GIF) or a document (PDF, Word, Excel, PowerPoint, text or CSV).")); return; }
    if (f.size > MAX_MESSAGE_FILE_BYTES) { setError(t("\"{name}\" is {size}. Files must be 5 MB or smaller.", { name: f.name, size: fmtBytes(f.size) })); return; }
    setError(null);
    setFile(f);
  };

  const send = () => {
    const empty = editor.current?.isEmpty() ?? true;
    if (empty && !file) return;
    const body = empty ? "" : editor.current!.html();
    start(async () => {
      let attached: { key: string; name: string } | undefined;
      if (file) {
        const prep = await prepareAttachment(convId, file.name, file.size);
        if (prep.error || !prep.key || !prep.url) { setError(prep.error ?? t("Could not attach the file.")); return; }
        // The same form the storage service expects; the file goes there directly, not through the app server.
        const fd = new FormData();
        fd.append("cacheControl", "3600");
        fd.append("", new File([file], file.name, { type: MESSAGE_FILE_TYPES[fileExt(file.name)] }));
        const up = await fetch(prep.url, { method: "PUT", body: fd }).catch(() => null);
        if (!up?.ok) { setError(t("The file could not be uploaded. Check your connection and try again.")); return; }
        attached = { key: prep.key, name: file.name };
      }
      const r = await sendMessage(convId, body, attached);
      if (r.error) setError(r.error); else { editor.current?.clear(); setFile(null); setError(null); router.refresh(); }
    });
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && <p className="text-sm muted text-center mt-10">{t("Say hello")} 👋</p>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const href = `/api/message-file/${m.id}`;
          return (
            <div key={m.id} className={`flex gap-3 items-end ${mine ? "flex-row-reverse" : ""}`}>
              <PersonLink userId={m.sender_id}><Avatar first={m.first_name} last={m.last_name} size={32} photo={avatarUrl(m.sender_id, m.avatar_updated_at)} /></PersonLink>
              <div className={`max-w-[75%] rounded-3xl px-4 py-3 shadow-sm ${mine ? "bg-gradient-to-br from-brand-500 to-charcoal-500 text-white rounded-br-md" : "glass-solid !rounded-3xl rounded-bl-md"}`}>
                {isGroup && !mine && <PersonLink userId={m.sender_id} className={`block text-xs font-semibold mb-1 hover:underline ${ROLE_TONE[m.role] ?? ""}`}>{m.title ? `${m.title} ` : ""}{m.first_name} {m.last_name}</PersonLink>}
                {m.attachment_name && (m.attachment_type?.startsWith("image/") ? (
                  <a href={href} target="_blank" rel="noopener" className="block mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={href} alt={m.attachment_name} loading="lazy" className="rounded-2xl max-h-64 max-w-full object-contain bg-black/5" />
                  </a>
                ) : (
                  <a href={href} className={`flex items-center gap-3 rounded-2xl px-3 py-2 mb-1 ${mine ? "bg-white/15 hover:bg-white/25" : "bg-black/5 hover:bg-black/10 dark:bg-white/10"}`}>
                    <FileText className="w-6 h-6 shrink-0" />
                    <span className="min-w-0"><span className="block text-sm font-medium truncate">{m.attachment_name}</span><span className={`block text-xs ${mine ? "text-white/75" : "muted"}`}>{fmtBytes(m.attachment_size ?? 0)} · {fileExt(m.attachment_name).toUpperCase()}</span></span>
                    <Download className="w-4 h-4 shrink-0 ml-auto" />
                  </a>
                ))}
                {m.html && <div className={`rt text-sm break-words ${mine ? "rt-mine" : ""}`} dangerouslySetInnerHTML={{ __html: m.html }} />}
                <p className={`text-[0.65rem] mt-1 text-right ${mine ? "text-white/75" : "muted"}`}>{new Date(m.created_at.replace(" ", "T") + "Z").toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {file && (
        <div className="px-4 pt-3 flex">
          <span className="chip chip-slate !py-1.5 max-w-full"><Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{file.name}</span><span className="muted shrink-0">{fmtBytes(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} aria-label={t("Remove attachment")} className="shrink-0"><X className="w-3.5 h-3.5" /></button></span>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-4 border-t border-line flex gap-2 items-end">
        <input ref={picker} type="file" accept={ACCEPT} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        <button type="button" onClick={() => picker.current?.click()} disabled={pending} className="icon-btn !w-11 !h-11 shrink-0" aria-label={t("Attach a document or picture (up to 5 MB)")} title={t("Attach a document or picture (up to 5 MB)")}><Paperclip className="w-4 h-4" /></button>
        <RichEditor ref={editor} placeholder={file ? t("Add a message (optional)") : t("Type your message · @ to mention")} mentionables={mentionables} onEnter={send} disabled={pending} />
        <button disabled={pending} className="icon-btn !w-11 !h-11 shrink-0 !bg-gradient-to-br from-brand-500 to-charcoal-500 text-white disabled:opacity-50" aria-label={pending && file ? t("Uploading…") : t("Send")}><Send className="w-4 h-4" /></button>
      </form>
      {pending && file && <p className="text-xs muted px-4 pb-3">{t("Uploading {name}…", { name: file.name })}</p>}
      {error && <p className="text-sm text-rose-600 px-4 pb-3">{error}</p>}
    </>
  );
}
