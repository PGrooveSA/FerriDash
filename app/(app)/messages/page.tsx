import Link from "next/link";
import { Users } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, fullName, ROLE_LABEL } from "@/lib/format";
import { Card, Empty } from "@/components/ui/kit";
import { FormDialog } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { startChat, markRead } from "@/app/actions/content";
import Thread from "./Thread";

export const metadata = { title: "Messages" };

type Conv = { id: number; title: string | null; is_group: number; description: string | null; body: string | null; created_at: string | null; sender: string | null; other_first: string | null; other_last: string | null; other_title: string | null; other_role: string | null; unread: number; members: number };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() ?? "";
  const convs = all<Conv>(`
    SELECT c.id, c.title, c.is_group, c.description, m.body, m.created_at, su.first_name sender,
      o.first_name other_first, o.last_name other_last, o.title other_title, o.role other_role,
      (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.id AND x.sender_id <> ?1 AND x.created_at > COALESCE(me.last_read_at, '')) unread,
      (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) members
    FROM conversations c JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ?1
    LEFT JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE conversation_id = c.id)
    LEFT JOIN users su ON su.id = m.sender_id
    LEFT JOIN users o ON c.is_group = 0 AND o.id = (SELECT user_id FROM conversation_members WHERE conversation_id = c.id AND user_id <> ?1 LIMIT 1)
    ORDER BY COALESCE(m.created_at, c.created_at) DESC`, ctx.user.id)
    .filter((c) => !q || (c.title ?? `${c.other_first} ${c.other_last}`).toLowerCase().includes(q));
  const activeId = convs.some((c) => c.id === Number(sp.c)) ? Number(sp.c) : convs[0]?.id;
  const active = convs.find((c) => c.id === activeId);
  if (active?.unread) await markRead(active.id);

  const messages = activeId ? all<{ id: number; body: string; created_at: string; sender_id: number; first_name: string; last_name: string; title: string | null; role: string }>(`
    SELECT m.id, m.body, m.created_at, m.sender_id, u.first_name, u.last_name, u.title, u.role FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ? ORDER BY m.created_at, m.id LIMIT 300`, activeId) : [];
  const members = activeId ? all<{ id: number; first_name: string; last_name: string; title: string | null; role: string }>("SELECT u.id, u.first_name, u.last_name, u.title, u.role FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY u.last_name", activeId) : [];

  // Who can this user start a chat with?
  const family = ctx.user.role === "learner" || ctx.user.role === "parent";
  const people = all<{ id: number; name: string; role: string }>(`
    SELECT id, COALESCE(title || ' ', '') || first_name || ' ' || last_name name, role FROM users
    WHERE school_id = ? AND id <> ? AND active = 1 AND role IN (${family ? "'school_admin','teacher'" : "'school_admin','teacher','parent'"}) ORDER BY role, last_name LIMIT 500`, ctx.schoolId, ctx.user.id);
  const name = (c: Conv) => c.is_group ? c.title ?? "Group" : c.other_first ? fullName({ title: c.other_title, first_name: c.other_first, last_name: c.other_last! }, true) : "Conversation";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] 2xl:grid-cols-[22rem_1fr_20rem] gap-0 glass overflow-hidden !rounded-[1.75rem] min-h-[70vh]">
      <aside className="border-r border-line flex flex-col max-h-[78vh]">
        <div className="p-4 flex gap-2 border-b border-line">
          <form className="flex-1"><input name="q" defaultValue={q} placeholder="Search" className="input !rounded-full" aria-label="Search conversations" /></form>
          <FormDialog title="New message" triggerLabel="New" action={startChat} submitLabel="Send"
            fields={[{ name: "user_id", label: "To", type: "select", required: true, options: people.map((p) => ({ value: p.id, label: `${p.name} · ${ROLE_LABEL[p.role]}` })) }, { name: "body", label: "Message", type: "textarea", required: true }]} />
        </div>
        <ul className="overflow-y-auto flex-1">
          {convs.length === 0 && <li className="p-6 text-sm muted">No conversations yet.</li>}
          {convs.map((c) => (
            <li key={c.id}>
              <Link href={`/messages?c=${c.id}`} className={`flex gap-3 px-4 py-3.5 border-b border-line ${c.id === activeId ? "bg-lilac-100/50 dark:bg-lilac-500/10" : "hover:bg-white/40 dark:hover:bg-white/5"}`}>
                {c.is_group ? <span className="w-11 h-11 rounded-full grid place-items-center bg-gradient-to-br from-brand-300 to-lilac-400 text-white shrink-0"><Users className="w-5 h-5" /></span> : <Avatar first={c.other_first ?? "?"} last={c.other_last ?? ""} size={44} />}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><p className="font-semibold truncate">{name(c)}</p><span className="text-[0.7rem] muted shrink-0">{c.created_at ? fmtDate(c.created_at, { day: "numeric", month: "short" }) : ""}</span></div>
                  <div className="flex gap-2 items-center"><p className="text-xs muted line-clamp-2 flex-1">{c.is_group && c.sender ? <b>{c.sender}: </b> : null}{c.body ?? "No messages yet"}</p>{c.unread > 0 && <span className="w-5 h-5 text-[0.65rem] rounded-full grid place-items-center bg-lilac-500 text-white shrink-0">{c.unread}</span>}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex flex-col max-h-[78vh] bg-lilac-100/20 dark:bg-transparent">
        {active ? (
          <>
            <header className="px-5 py-4 border-b border-line flex items-center gap-3">
              {active.is_group ? <span className="w-11 h-11 rounded-full grid place-items-center bg-gradient-to-br from-brand-300 to-lilac-400 text-white"><Users className="w-5 h-5" /></span> : <Avatar first={active.other_first ?? "?"} last={active.other_last ?? ""} size={44} />}
              <div><p className="font-semibold">{name(active)}</p><p className="text-xs muted">{active.is_group ? `${active.members} members` : ROLE_LABEL[active.other_role ?? ""] ?? ""}</p></div>
            </header>
            <Thread key={active.id} convId={active.id} meId={ctx.user.id} isGroup={!!active.is_group} messages={messages} />
          </>
        ) : <div className="grid place-items-center flex-1"><Empty title="Select or start a conversation" /></div>}
      </section>

      <aside className="hidden 2xl:block border-l border-line p-5 overflow-y-auto max-h-[78vh]">
        {active && (
          <>
            <p className="font-semibold mb-4">{active.is_group ? "Group info" : "Contact info"}</p>
            <div className="text-center">
              {active.is_group ? <span className="w-24 h-24 mx-auto rounded-full grid place-items-center bg-gradient-to-br from-brand-300 via-lilac-400 to-butter-300 text-white"><Users className="w-10 h-10" /></span> : <div className="inline-block"><Avatar first={active.other_first ?? "?"} last={active.other_last ?? ""} size={96} /></div>}
              <p className="font-semibold mt-3">{name(active)}</p>
              <p className="text-xs muted">{active.is_group ? `Group · ${active.members} members` : ROLE_LABEL[active.other_role ?? ""]}</p>
            </div>
            {active.description && <><p className="text-sm font-semibold mt-6 mb-1">Description</p><p className="text-xs muted">{active.description}</p></>}
            <p className="text-sm font-semibold mt-6 mb-3">Members</p>
            <ul className="space-y-3">{members.map((m) => (
              <li key={m.id} className="flex items-center gap-3"><Avatar first={m.first_name} last={m.last_name} size={34} /><div><p className="text-sm font-medium">{fullName(m, true)}</p><p className="text-xs muted">{ROLE_LABEL[m.role]}</p></div></li>
            ))}</ul>
          </>
        )}
      </aside>
    </div>
  );
}
