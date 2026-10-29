"use server";
import { revalidatePath } from "next/cache";
import { all, audit, get, run, tx } from "@/lib/db";
import { ADMIN, STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { today, addDays } from "@/lib/today";
import { notify, noticeAudienceUsers } from "@/lib/push";
import { randomUUID } from "node:crypto";
import { fileSize, removeFile, signedUploadUrl, storageKey } from "@/lib/storage";
import { MAX_MESSAGE_FILE_BYTES, MESSAGE_FILE_TYPES, fileExt } from "@/lib/uploads";

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

export async function deleteNotice(id: number) {
  return guarded(STAFF, async (ctx) => {
    const n = (await get<{ author_id: number }>("SELECT author_id FROM notices WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Notice not found.");
    if (!ctx.isAdmin && n.author_id !== ctx.user.id) fail("You can only delete your own notices.");
    await run("DELETE FROM notices WHERE id = ?", id);
    revalidatePath("/notices");
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
async function notifyMessage(sender: { id: number; title: string | null; first_name: string; last_name: string }, convId: number) {
  const others = (await all<{ user_id: number }>("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?", convId, sender.id)).map((r) => r.user_id);
  const name = [sender.title, sender.first_name, sender.last_name].filter(Boolean).join(" ");
  notify(others, { title: `New message from ${name}`, body: "Open FerriDash to read and reply.", url: `/messages?c=${convId}` });
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

export async function sendMessage(convId: number, body: string, file?: { key: string; name: string }): Promise<ActionResult> {
  return guarded(undefined, async (ctx) => {
    const text = body.trim();
    if (!text && !file) fail("Type a message first.");
    if (text.length > 4000) fail("Message is too long.");
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
    await run("INSERT INTO messages (conversation_id, sender_id, body, attachment_key, attachment_name, attachment_type, attachment_size) VALUES (?,?,?,?,?,?,?)",
      convId, ctx.user.id, text, ...attachment);
    await run("UPDATE conversation_members SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?", convId, ctx.user.id);
    await notifyMessage(ctx.user, convId);
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
