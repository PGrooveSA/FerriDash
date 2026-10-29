"use server";
import { revalidatePath } from "next/cache";
import { all, audit, get, run } from "@/lib/db";
import { ADMIN, STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { canTeach } from "@/lib/assignments";
import type { Ctx } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { notify, familyOf } from "@/lib/push";
import { putFile, removeFile, storageKey } from "@/lib/storage";
import { MAX_ASSIGNMENT_DOC_BYTES, isPdf } from "@/lib/uploads";

/** The assignment, if this staff member may change it (admins: any in the school; educators: their own, or for a class they teach). */
async function editable(ctx: Ctx, id: number) {
  const a = (await get<{ class_subject_id: number; created_by: number | null }>("SELECT class_subject_id, created_by FROM assignments WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Assignment not found.");
  if (!ctx.isAdmin && a.created_by !== ctx.user.id && !(await canTeach(ctx, a.class_subject_id))) fail("You can only change assignments for classes you teach.");
  return a;
}

export async function saveAssignment(_: ActionResult, f: FormData): Promise<ActionResult> {
  const res = await guarded(STAFF, async (ctx) => {
    const id = num(f, "id"), csId = num(f, "class_subject_id");
    const title = str(f, "title"), due = str(f, "due_date"), instructions = opt(f, "instructions");
    if (!csId || !title) fail("Choose the class and subject, and give the assignment a title.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) fail("Choose a due date.");
    if (title.length > 200 || (instructions?.length ?? 0) > 4000) fail("The title or instructions are too long.");
    if (!(await canTeach(ctx, csId))) fail("You can only set assignments for classes you teach.");
    if (id) await editable(ctx, id);

    // Optional PDF: checked by content, not just the name.
    const file = f.get("document");
    let pdf: Uint8Array | null = null, pdfName: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_ASSIGNMENT_DOC_BYTES) fail("That PDF is too large. Please upload a file under 4 MB.");
      pdf = new Uint8Array(await file.arrayBuffer());
      if (!/\.pdf$/i.test(file.name) || !isPdf(pdf)) fail("Only PDF documents can be attached.");
      pdfName = file.name.replace(/[^\w.\- ()]/g, "_").slice(-120);
    }

    let assignmentId = id;
    if (id) await run("UPDATE assignments SET class_subject_id = ?, title = ?, instructions = ?, due_date = ? WHERE id = ?", csId, title, instructions, due, id);
    else assignmentId = (await run("INSERT INTO assignments (school_id, class_subject_id, title, instructions, due_date, created_by) VALUES (?,?,?,?,?,?)", ctx.schoolId, csId, title, instructions, due, ctx.user.id)).id;
    if (pdf && assignmentId) {
      await putFile(storageKey.assignmentDoc(assignmentId), pdf, "application/pdf");
      await run("UPDATE assignments SET document_name = ? WHERE id = ?", pdfName, assignmentId);
    } else if (id && str(f, "remove_document") === "1") {
      await removeFile(storageKey.assignmentDoc(id));
      await run("UPDATE assignments SET document_name = NULL WHERE id = ?", id);
    }
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "assignment", assignmentId, title);

    // A new assignment goes to the class's learners and their parents (phones; the top bar shows a dot too).
    if (!id) {
      const cs = (await get<{ class_id: number; subject: string }>("SELECT cs.class_id, s.name subject FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id WHERE cs.id = ?", csId))!;
      const learners = (await all<{ id: number }>("SELECT id FROM learners WHERE class_id = ? AND status = 'Active'", cs.class_id)).map((l) => l.id);
      notify(await familyOf(learners), { title: `New assignment: ${cs.subject}`, body: `${title}. Due ${fmtDate(due, { weekday: "short", day: "numeric", month: "short" })}.`, url: "/assignments" });
    }
    revalidatePath("/assignments");
    revalidatePath("/calendar");
  });
  return res.error ? res : { ok: true, message: num(f, "id") ? "Assignment updated." : "Assignment set. Learners and parents have been notified." };
}

/** Only school admins delete assignments. */
export async function deleteAssignment(id: number): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    if (!(await run("DELETE FROM assignments WHERE id = ? AND school_id = ?", id, ctx.schoolId)).changes) fail("Assignment not found.");
    await removeFile(storageKey.assignmentDoc(id));
    await audit(ctx.schoolId, ctx.user.id, "delete", "assignment", id);
    revalidatePath("/assignments");
    revalidatePath("/calendar");
  });
}

/** School admins clear out assignments that were due before a date, with their PDFs (frees space). */
export async function deleteOldAssignments(_: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const before = str(f, "before");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) fail("Choose a date.");
    const old = await all<{ id: number; document_name: string | null }>("SELECT id, document_name FROM assignments WHERE school_id = ? AND due_date < ?", ctx.schoolId, before);
    if (old.length) await run(`DELETE FROM assignments WHERE id IN (${old.map(() => "?").join(",")})`, ...old.map((a) => a.id));
    for (const a of old) if (a.document_name) await removeFile(storageKey.assignmentDoc(a.id));
    await audit(ctx.schoolId, ctx.user.id, "delete_old", "assignment", null, `${old.length} due before ${before}`);
    revalidatePath("/assignments");
    revalidatePath("/calendar");
    return { ok: true, message: old.length ? `${old.length} assignment${old.length === 1 ? "" : "s"} deleted.` : "No assignments were due before that date." };
  });
}
