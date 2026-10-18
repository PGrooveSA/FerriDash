"use server";
import { revalidatePath } from "next/cache";
import { audit, get, run, tx } from "@/lib/db";
import { ADMIN, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";

export async function recordPayment(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const invoiceId = num(f, "invoice_id"), amount = num(f, "amount");
    const inv = get<{ total: number; paid: number }>(`SELECT tuition + activities + other total, (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = i.id) paid FROM invoices i WHERE id = ? AND school_id = ?`, invoiceId, ctx.schoolId) ?? fail("Invoice not found.");
    if (!amount || amount <= 0) fail("Enter an amount greater than R0.");
    if (amount > inv.total - inv.paid + 0.01) fail(`The outstanding balance is only R${(inv.total - inv.paid).toFixed(2)}.`);
    const r = run("INSERT INTO payments (school_id, invoice_id, amount, paid_on, method, reference, recorded_by) VALUES (?,?,?,?,?,?,?)", ctx.schoolId, invoiceId, amount, str(f, "paid_on"), str(f, "method") || "EFT", opt(f, "reference"), ctx.user.id);
    audit(ctx.schoolId, ctx.user.id, "payment", "invoice", invoiceId, `R${amount}`);
    revalidatePath("/finance", "layout");
    return { ok: true, message: `Receipt #${r.id} recorded.` };
  });
}

export async function deletePayment(id: number) {
  return guarded(ADMIN, (ctx) => {
    run("DELETE FROM payments WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    audit(ctx.schoolId, ctx.user.id, "delete", "payment", id);
    revalidatePath("/finance", "layout");
  });
}

export async function saveFeeStructure(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const grade = num(f, "grade");
    if (grade == null) fail("Choose a grade.");
    run(`INSERT INTO fee_structures (school_id, year, grade, tuition, activities, other) VALUES (?,?,?,?,?,?)
         ON CONFLICT(school_id, year, grade) DO UPDATE SET tuition = excluded.tuition, activities = excluded.activities, other = excluded.other`,
      ctx.schoolId, ctx.school.current_year, grade, num(f, "tuition") ?? 0, num(f, "activities") ?? 0, num(f, "other") ?? 0);
    revalidatePath("/finance/fees");
  });
}

/** Creates the annual invoice for every active learner that doesn't have one yet. */
export async function generateInvoices() {
  return guarded(ADMIN, (ctx) => {
    if (!ctx.school.fee_paying) fail("This is a no-fee school.");
    const year = ctx.school.current_year;
    const r = tx(() => run(`INSERT INTO invoices (school_id, learner_id, year, description, tuition, activities, other, due_date)
      SELECT l.school_id, l.id, fs.year, fs.year || ' school fees - Grade ' || c.grade, fs.tuition, fs.activities, fs.other, fs.year || '-11-30'
      FROM learners l JOIN classes c ON c.id = l.class_id JOIN fee_structures fs ON fs.school_id = l.school_id AND fs.grade = c.grade AND fs.year = ?
      WHERE l.school_id = ? AND l.status = 'Active' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.learner_id = l.id AND i.year = ?)`, year, ctx.schoolId, year));
    audit(ctx.schoolId, ctx.user.id, "generate_invoices", "invoice", null, String(r.changes));
    revalidatePath("/finance", "layout");
    return { ok: true, message: `${r.changes} invoice(s) created.` };
  });
}

export async function saveExpense(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "id"), amount = num(f, "amount");
    if (!amount || amount <= 0) fail("Enter an amount greater than R0.");
    const vals = [opt(f, "reference"), str(f, "category"), str(f, "description"), opt(f, "quantity"), amount, str(f, "paid_on"), opt(f, "supplier")];
    if (id) run("UPDATE expenses SET reference=?, category=?, description=?, quantity=?, amount=?, paid_on=?, supplier=? WHERE id = ? AND school_id = ?", ...vals, id, ctx.schoolId);
    else run("INSERT INTO expenses (reference, category, description, quantity, amount, paid_on, supplier, school_id) VALUES (?,?,?,?,?,?,?,?)", ...vals, ctx.schoolId);
    audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "expense", id);
    revalidatePath("/finance/expenses");
  });
}

export async function deleteExpense(id: number) {
  return guarded(ADMIN, (ctx) => {
    run("DELETE FROM expenses WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    audit(ctx.schoolId, ctx.user.id, "delete", "expense", id);
    revalidatePath("/finance/expenses");
  });
}
