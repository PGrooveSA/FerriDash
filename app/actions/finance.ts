"use server";
import { revalidatePath } from "next/cache";
import { audit, run } from "@/lib/db";
import { ADMIN, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { MAX_EXPENSE_DOC_BYTES, isPdf } from "@/lib/uploads";
import { putFile, removeFile, storageKey } from "@/lib/storage";

export async function saveExpense(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id"), amount = num(f, "amount");
    if (!amount || amount <= 0) fail("Enter an amount greater than R0.");
    // Optional supporting document: PDF only (checked by content, not just the name), up to 4 MB.
    const file = f.get("document");
    let pdf: Uint8Array | null = null, pdfName: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_EXPENSE_DOC_BYTES) fail("That PDF is too large. Please upload a file under 4 MB.");
      pdf = new Uint8Array(await file.arrayBuffer());
      if (!/\.pdf$/i.test(file.name) || !isPdf(pdf)) fail("Only PDF documents can be uploaded.");
      pdfName = file.name.replace(/[^\w.\- ()]/g, "_").slice(-120);
    }
    const vals = [opt(f, "reference"), str(f, "category"), str(f, "description"), opt(f, "quantity"), amount, str(f, "paid_on"), opt(f, "supplier")];
    let expenseId = id;
    if (id) {
      if (!(await run("UPDATE expenses SET reference=?, category=?, description=?, quantity=?, amount=?, paid_on=?, supplier=? WHERE id = ? AND school_id = ?", ...vals, id, ctx.schoolId)).changes) fail("Expense not found.");
    }
    else expenseId = (await run("INSERT INTO expenses (reference, category, description, quantity, amount, paid_on, supplier, school_id) VALUES (?,?,?,?,?,?,?,?)", ...vals, ctx.schoolId)).id;
    if (pdf && expenseId) {
      await putFile(storageKey.expenseDoc(expenseId), pdf, "application/pdf");
      await run("UPDATE expenses SET document_name = ? WHERE id = ?", pdfName, expenseId);
    }
    if (id && str(f, "remove_document") === "1" && !pdf) {
      await removeFile(storageKey.expenseDoc(id));
      await run("UPDATE expenses SET document_name = NULL WHERE id = ?", id);
    }
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "expense", expenseId, pdfName ? `document: ${pdfName}` : undefined);
    revalidatePath("/finance/expenses");
  });
}

export async function deleteExpense(id: number) {
  return guarded(ADMIN, async (ctx) => {
    if ((await run("DELETE FROM expenses WHERE id = ? AND school_id = ?", id, ctx.schoolId)).changes) await removeFile(storageKey.expenseDoc(id));
    await audit(ctx.schoolId, ctx.user.id, "delete", "expense", id);
    revalidatePath("/finance/expenses");
  });
}
