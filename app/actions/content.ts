"use server";
import { revalidatePath } from "next/cache";
import { all, audit, get, run, tx } from "@/lib/db";
import { ADMIN, STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { today, addDays } from "@/lib/today";
import { notify, noticeAudienceUsers } from "@/lib/push";
import { randomUUID } from "node:crypto";
import { fileSize, removeFile, signedUploadUrl, storageKey } from "@/lib/storage";
import { MAX_MESSAGE_FILE_BYTES, MESSAGE_FILE_TYPES, fileExt } from "@/lib/uploads";
import { cleanMessageHtml, dropMentions, mentionIds, messageText } from "@/lib/richtext";

// ---------------- Notices ----------------
export async function saveNotice(_: ActionResult, f: FormData) {
  return guarded(STAFF, async (ctx) => {
    const id = num(f, "id");
    const vals = [str(f, "title"), str(f, "body"), str(f, "audience") || "all", opt(f, "tags")];
    if (!vals[0] || !vals[1]) fail("Title and message are required.");
    if (id) {
      const n = (await get<{ author_id: number }>("SELECT author_id FROM notices WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Notice not found.");
      if (!ctx.isAdmin && n.author_id !== ctx.user.id) fail("You can only edit your own notices.");
      await run("UPDATE notices SET title=?, body=?, audience=?, tags=? WHERE id = ?", ...vals, id);
    } else {
      await run("INSERT INTO notices (title, body, audience, tags, school_id, author_id) VALUES (?,?,?,?,?,?)", ...vals, ctx.schoolId, ctx.user.id);
      notify(await noticeAudienceUsers(ctx.schoolId, vals[2]!, ctx.user.id), { title: vals[0]!, body: vals[1]!.replace(/\s+/g, " "), url: "/notices" });
    }
    revalidatePath("/notices");
  });
}

/** Only school admins delete notices. */
export async function deleteNotice(id: number) {
  return guarded(ADMIN, async (ctx) => {
    if (!(await run("DELETE FROM notices WHERE id = ? AND school_id = ?", id, ctx.schoolId)).changes) fail("Notice not found.");
    await audit(ctx.schoolId, ctx.user.id, "delete", "notice", id);
    revalidatePath("/notices");
  });
}

/** School admins clear out notices posted before a date (frees space in the database). */
export async function deleteOldNotices(_: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const before = str(f, "before");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) fail("Choose a date.");
    const r = await run("DELETE FROM notices WHERE school_id = ? AND created_at < ?", ctx.schoolId, before);
    await audit(ctx.schoolId, ctx.user.id, "delete_old", "notice", null, `${r.changes} posted before ${before}`);
    revalidatePath("/notices");
    return { ok: true, message: r.changes ? `${r.changes} notice${r.changes === 1 ? "" : "s"} deleted.` : "No notices were posted before that date." };
  });
}

// ---------------- Events ----------------
export async function saveEvent(_: ActionResult, f: FormData) {
  return guarded(STAFF, async (ctx) => {
    const id = num(f, "id");
    const vals = [str(f, "title"), str(f, "date"), opt(f, "start_time"), opt(f, "end_time"), str(f, "category") || "school", opt(f, "audience"), opt(f, "description")];
    if (!vals[0] || !vals[1]) fail("Title and date are required.");
    if (id) await run("UPDATE events SET title=?, date=?, start_time=?, end_time=?, category=?, audience=?, description=? WHERE id = ? AND school_id = ?", ...vals, id, ctx.schoolId);
    else await run("INSERT INTO events (title, date, start_time, end_time, category, audience, description, school_id) VALUES (?,?,?,?,?,?,?,?)", ...vals, ctx.schoolId);
    revalidatePath("/calendar");
  });
}

export async function deleteEvent(id: number) {
  return guarded(STAFF, async (ctx) => {
    await run("DELETE FROM events WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    revalidatePath("/calendar");
  });
}

// ---------------- Library ----------------
export async function saveBook(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const vals = [str(f, "code"), str(f, "title"), opt(f, "author"), opt(f, "subject"), opt(f, "grades"), num(f, "publish_year"), num(f, "copies") ?? 1];
    if (id) await run("UPDATE books SET code=?, title=?, author=?, subject=?, grades=?, publish_year=?, copies=? WHERE id = ? AND school_id = ?", ...vals, id, ctx.schoolId);
    else await run("INSERT INTO books (code, title, author, subject, grades, publish_year, copies, school_id) VALUES (?,?,?,?,?,?,?,?)", ...vals, ctx.schoolId);
    revalidatePath("/library");
  });
}

export async function deleteBook(id: number) {
  return guarded(ADMIN, async (ctx) => {
    await run("DELETE FROM books WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    revalidatePath("/library");
  });
}

export async function issueBook(_: ActionResult, f: FormData) {
  return guarded(STAFF, async (ctx) => {
    const bookId = num(f, "book_id");
    const book = (await get<{ copies: number; out: number }>("SELECT copies, (SELECT COUNT(*) FROM book_loans WHERE book_id = b.id AND returned_on IS NULL) out FROM books b WHERE id = ? AND school_id = ?", bookId, ctx.schoolId)) ?? fail("Book not found.");
    if (book.out >= book.copies) fail("All copies are checked out.");
    const learner = (await get<{ id: number }>("SELECT id FROM learners WHERE school_id = ? AND admission_number = ? AND status = 'Active'", ctx.schoolId, str(f, "admission_number"))) ?? fail("No active learner with that admission number.");
    const days = num(f, "days") ?? 14;
    await run("INSERT INTO book_loans (school_id, book_id, learner_id, borrowed_on, due_on) VALUES (?,?,?,?,?)", ctx.schoolId, bookId, learner.id, today(), addDays(today(), days));
    await audit(ctx.schoolId, ctx.user.id, "issue", "book", bookId);
    revalidatePath("/library");
  });
}

export async function returnBook(loanId: number) {
  return guarded(STAFF, async (ctx) => {
    await run("UPDATE book_loans SET returned_on = ? WHERE id = ? AND school_id = ?", today(), loanId, ctx.schoolId);
    revalidatePath("/library");
  });
}

// ---------------- Messages ----------------
async function member(convId: number, userId: number) {
  return !!(await get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", convId, userId));
}

/** Tells the other people in the chat. The text itself stays out of the notification (lock screens). */
async function notifyMessage(sender: { id: number; title: string | null; first_name: string; last_name: string }, convId: number, mentioned: number[] = []) {
  const others = (await all<{ user_id: number }>("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?", convId, sender.id))
    .map((r) => r.user_id).filter((id) => !mentioned.includes(id));
  const name = [sender.title, sender.first_name, sender.last_name].filter(Boolean).join(" ");
  notify(others, { title: `New message from ${name}`, body: "Open FerriDash to read and reply.", url: `/messages?c=${convId}` });
  if (mentioned.length) notify(mentioned, { title: `${name} mentioned you`, body: "Tap to open the chat and reply.", url: `/messages?c=${convId}` });
}

/**
 * People mentioned with @ in a message. Who may be mentioned follows the same rule as starting a chat (learners
 * and parents: school staff only), plus anyone already in the chat. Someone new joins the chat so they can read
 * and reply; a one-to-one chat then becomes a group.
 */
async function addMentioned(ctx: { schoolId: number; user: { id: number; role: string } }, convId: number, html: string): Promise<{ html: string; ids: number[] }> {
  const asked = mentionIds(html).filter((id) => id !== ctx.user.id);
  if (!asked.length) return { html, ids: [] };
  const family = ctx.user.role === "learner" || ctx.user.role === "parent";
  const ok = await all<{ id: number; role: string; member: number }>(`SELECT u.id, u.role, (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = u.id) member FROM users u
    WHERE u.id IN (${asked.map(() => "?").join(",")}) AND u.school_id = ? AND u.active = 1`, convId, ...asked, ctx.schoolId);
  const allowed = ok.filter((u) => u.member > 0 || !family || !["learner", "parent"].includes(u.role)).map((u) => u.id);
  return { html: dropMentions(html, asked.filter((id) => !allowed.includes(id))), ids: allowed };
}

/**
 * Step 1 of attaching a file: checks its name and size, then says where the browser should upload it. In
 * production that is storage itself, because files up to 5 MB are too big to pass through the app server.
 */
export async function prepareAttachment(convId: number, name: string, size: number): Promise<ActionResult & { key?: string; url?: string }> {
  let key = "", url = "";
  const r = await guarded(undefined, async (ctx) => {
    if (!(await member(convId, ctx.user.id))) fail("You are not part of this conversation.");
    const ext = fileExt(name);
    if (!MESSAGE_FILE_TYPES[ext]) fail("Attach a picture (JPG, PNG, WebP or GIF) or a document (PDF, Word, Excel, PowerPoint, text or CSV).");
    if (!(size > 0)) fail("That file is empty.");
    if (size > MAX_MESSAGE_FILE_BYTES) fail("Files must be 5 MB or smaller.");
    key = storageKey.messageFile(convId, randomUUID(), ext);
    url = (await signedUploadUrl(key)) ?? `/api/message-file/upload?key=${encodeURIComponent(key)}`;
  });
  return r.error ? r : { key, url };
}

const MESSAGE_KEY = /^messages\/(\d+)\/[0-9a-f-]{36}\.([a-z0-9]+)$/;

/** `body` is the formatted message from the chat editor (HTML; cleaned here). */
export async function sendMessage(convId: number, body: string, file?: { key: string; name: string }): Promise<ActionResult> {
  return guarded(undefined, async (ctx) => {
    let html = cleanMessageHtml(body);
    const text = messageText(html);
    if (!text && !file) fail("Type a message first.");
    if (text.length > 4000 || html.length > 60_000) fail("Message is too long.");
    if (!(await member(convId, ctx.user.id))) fail("You are not part of this conversation.");
    let attachment: [string, string, string, number] | [null, null, null, null] = [null, null, null, null];
    if (file) {
      // Only a file uploaded for this chat (step 1), present in storage, and within the limit.
      const m = MESSAGE_KEY.exec(file.key);
      if (!m || Number(m[1]) !== convId || !MESSAGE_FILE_TYPES[m[2]]) fail("That attachment is not valid.");
      const size = (await fileSize(file.key)) ?? fail("The file did not finish uploading. Please try again.");
      if (size > MAX_MESSAGE_FILE_BYTES) { await removeFile(file.key); fail("Files must be 5 MB or smaller."); }
      const name = file.name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f"]/g, "").slice(-120) || `attachment.${m[2]}`;
      attachment = [file.key, name, MESSAGE_FILE_TYPES[m[2]], size];
    }
    const mentioned = await addMentioned(ctx, convId, html);
    html = mentioned.html;
    await tx(async () => {
      await run("INSERT INTO messages (conversation_id, sender_id, body, attachment_key, attachment_name, attachment_type, attachment_size) VALUES (?,?,?,?,?,?,?)",
        convId, ctx.user.id, text ? html : "", ...attachment);
      let joined = 0;
      for (const id of mentioned.ids) joined += (await run("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", convId, id)).changes;
      if (joined) {
        // Three or more people: name the group after them.
        const names = (await all<{ first_name: string }>("SELECT u.first_name FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY u.first_name", convId)).map((u) => u.first_name);
        await run("UPDATE conversations SET is_group = 1, title = COALESCE(title, ?) WHERE id = ? AND is_group = 0", names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0], convId);
      }
      await run("UPDATE conversation_members SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?", convId, ctx.user.id);
    });
    await notifyMessage(ctx.user, convId, mentioned.ids);
  });
}

/** Opens (or reuses) a one-to-one chat. Learners may only message staff; parents may message staff. */
export async function startChat(_: ActionResult, f: FormData): Promise<ActionResult> {
  const res = await guarded(undefined, async (ctx) => {
    const otherId = num(f, "user_id");
    const other = (await get<{ role: string }>("SELECT role FROM users WHERE id = ? AND school_id = ? AND active = 1", otherId, ctx.schoolId)) ?? fail("Person not found.");
    const family = ["learner", "parent"];
    if (family.includes(ctx.user.role) && family.includes(other.role)) fail("Learners and parents can message school staff only.");
    const existing = await get<{ id: number }>(`SELECT c.id FROM conversations c WHERE c.is_group = 0 AND c.school_id = ?
      AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
      AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)`, ctx.schoolId, ctx.user.id, otherId);
    const id = existing?.id ?? (await tx(async () => {
          const c = (await run("INSERT INTO conversations (school_id, is_group) VALUES (?, 0)", ctx.schoolId)).id;
          await run("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?), (?,?)", c, ctx.user.id, c, otherId);
          return c;
        }));
    const first = str(f, "body");
    if (first) {
      await run("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)", id, ctx.user.id, first);
      await notifyMessage(ctx.user, id);
    }
    return { ok: true, message: String(id) };
  });
  revalidatePath("/messages");
  return res;
}

export async function markRead(convId: number) {
  return guarded(undefined, async (ctx) => {
    await run("UPDATE conversation_members SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?", convId, ctx.user.id);
  });
}
