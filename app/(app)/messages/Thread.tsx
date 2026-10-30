"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, FileText, MoreVertical, Paperclip, Pencil, Send, Trash2, X } from "lucide-react";
import { deleteMessage, editMessage, prepareAttachment, sendMessage } from "@/app/actions/content";
import Avatar from "@/components/ui/Avatar";
import PersonLink from "@/components/ProfileCard";
import { useT } from "@/components/I18nProvider";
import RichEditor, { type Mentionable, type RichEditorHandle } from "./RichEditor";
import { avatarUrl } from "@/lib/format";
import { MAX_MESSAGE_FILE_BYTES, MESSAGE_FILE_TYPES, fileExt, fmtBytes } from "@/lib/uploads";

type M = {
  id: number; html: string; created_at: string; sender_id: number; first_name: string; last_name: string; title: string | null; role: string; avatar_updated_at: string | null;
  attachment_name: string | null; attachment_type: string | null; attachment_size: number | null; edited_at: string | null;
};

/** Senders can edit a message's text for this long (the server enforces it too). */
const EDIT_WINDOW_MS = 5 * 60_000;
const sentAt = (m: M) => new Date(m.created_at.replace(" ", "T") + "Z").getTime();
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
  const [menu, setMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<M | null>(null);
  // Re-render every 15 s so Edit disappears once a message is older than 5 minutes.
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(i); }, []);
  const canEdit = (m: M) => m.sender_id === meId && !!m.html && Date.now() - sentAt(m) < EDIT_WINDOW_MS;

  const startEdit = (m: M) => {
    setMenu(null);
    setFile(null);
    setError(null);
    setEditing(m);
    // The stored message is wrapped in <div class="rt">; the editor takes what is inside it.
    const wrap = document.createElement("div");
    wrap.innerHTML = m.html;
    editor.current?.setHtml((wrap.firstElementChild as HTMLElement | null)?.innerHTML ?? m.html);
  };
  const cancelEdit = () => { setEditing(null); editor.current?.clear(); };
  const remove = (m: M) => {
    setMenu(null);
    if (!confirm(t("Delete this message for everyone?"))) return;
    start(async () => {
      const r = await deleteMessage(m.id);
      if (r.error) setError(r.error); else { if (editing?.id === m.id) cancelEdit(); router.refresh(); }
    });
  };

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
    if (editing) {
      const body = editor.current?.html() ?? "";
      start(async () => {
        const r = await editMessage(editing.id, body);
        if (r.error) setError(r.error); else { cancelEdit(); setError(null); router.refresh(); }
      });
      return;
    }
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
                <p className={`text-[0.65rem] mt-1 text-right ${mine ? "text-white/75" : "muted"}`}>{m.edited_at && <span className="italic">{t("edited")} · </span>}{new Date(sentAt(m)).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              {mine && (
                <div className="relative self-center">
                  <button type="button" onClick={() => setMenu(menu === m.id ? null : m.id)} className="w-7 h-7 grid place-items-center rounded-full muted hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("Message options")} aria-expanded={menu === m.id}><MoreVertical className="w-4 h-4" /></button>
                  {menu === m.id && (
                    <div className="absolute right-0 bottom-full mb-1 z-20 glass-solid !rounded-2xl p-1 shadow-xl min-w-[9rem]">
                      {canEdit(m) && <button type="button" onClick={() => startEdit(m)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-black/5 dark:hover:bg-white/10"><Pencil className="w-3.5 h-3.5" />{t("Edit")}</button>}
                      <button type="button" onClick={() => remove(m)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" />{t("Delete")}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {editing && (
        <div className="px-4 pt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Pencil className="w-4 h-4 text-brand-500 shrink-0" /><span className="font-medium">{t("Editing message")}</span>
          <span className="muted text-xs">{t("You can edit for 5 minutes after sending.")}</span>
          <button type="button" onClick={cancelEdit} className="ml-auto btn btn-ghost btn-sm">{t("Cancel")}</button>
        </div>
      )}
      {file && (
        <div className="px-4 pt-3 flex">
          <span className="chip chip-slate !py-1.5 max-w-full"><Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{file.name}</span><span className="muted shrink-0">{fmtBytes(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} aria-label={t("Remove attachment")} className="shrink-0"><X className="w-3.5 h-3.5" /></button></span>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-4 border-t border-line flex gap-2 items-end">
        <input ref={picker} type="file" accept={ACCEPT} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        <button type="button" onClick={() => picker.current?.click()} disabled={pending || !!editing} className="icon-btn !w-11 !h-11 shrink-0" aria-label={t("Attach a document or picture (up to 5 MB)")} title={t("Attach a document or picture (up to 5 MB)")}><Paperclip className="w-4 h-4" /></button>
        <RichEditor ref={editor} placeholder={file ? t("Add a message (optional)") : t("Type your message · @ to mention")} mentionables={mentionables} onEnter={send} disabled={pending} />
        <button disabled={pending} className="icon-btn !w-11 !h-11 shrink-0 !bg-gradient-to-br from-brand-500 to-charcoal-500 text-white disabled:opacity-50" aria-label={editing ? t("Save") : pending && file ? t("Uploading…") : t("Send")}>{editing ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}</button>
      </form>
      {pending && file && <p className="text-xs muted px-4 pb-3">{t("Uploading {name}…", { name: file.name })}</p>}
      {error && <p className="text-sm text-rose-600 px-4 pb-3">{error}</p>}
    </>
  );
}
