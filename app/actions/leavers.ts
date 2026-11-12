"use server";
import { revalidatePath } from "next/cache";
import { audit, get, run, tx } from "@/lib/db";
import { ADMIN, fail, guarded, isDate, opt, str, type ActionResult } from "@/lib/action-utils";
import { syncFamilyLogins } from "@/lib/leavers";
import { billLearners, billingSchedule, feesOn } from "@/lib/fees";
import { isChildcare } from "@/lib/org";
import { today } from "@/lib/today";

const refresh = () => { for (const p of ["/learners", "/children", "/past", "/parents", "/dashboard", "/checkin"]) revalidatePath(p, "layout"); revalidatePath("/finance", "layout"); };

/**
 * A learner or child leaves: their record stays (marks, attendance, statements), their status says why, their
 * login and (once no child of theirs is left) their parents' logins are switched off. Unpaid fees falling due
 * after they leave can be cancelled.
 */
export async function markLeft(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = Number(f.get("learner_id"));
    const l = (await get<{ first_name: string; status: string }>("SELECT first_name, status FROM learners WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Not found.");
    if (l.status !== "Active") fail(`${l.first_name} has already left.`);
    const status = str(f, "status");
    if (!["Transferred", "Withdrawn", "Graduated"].includes(status)) fail("Choose why they are leaving.");
    const on = str(f, "left_on") || today();
    if (!isDate(on)) fail("Enter the last day as a date.");
    let cancelled = 0;
    await tx(async () => {
      await run("UPDATE learners SET status = ?, left_on = ?, left_reason = ? WHERE id = ?", status, on, opt(f, "left_reason"), id);
      // Fees due after the last day that nothing has been paid on yet.
      if (feesOn(ctx.school) && str(f, "cancel_fees") !== "0") {
        cancelled = (await run("DELETE FROM invoices WHERE learner_id = ? AND due_date > ? AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = invoices.id)", id, on)).changes;
      }
    });
    await syncFamilyLogins([id]);
    await audit(ctx.schoolId, ctx.user.id, "left", isChildcare(ctx.school) ? "child" : "learner", id, `${status} on ${on}${cancelled ? `, ${cancelled} future invoice(s) cancelled` : ""}`);
    refresh();
    return { ok: true, message: `${l.first_name} is now under Past ${isChildcare(ctx.school) ? "children" : "learners"}.${cancelled ? ` ${cancelled} unpaid future invoice${cancelled === 1 ? "" : "s"} cancelled.` : ""}` };
  });
}

/** Someone who left comes back: Active again, logins back on, and billed from the current instalment. */
export async function readmit(id: number): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const l = (await get<{ first_name: string; status: string }>("SELECT first_name, status FROM learners WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Not found.");
    if (l.status === "Active") fail(`${l.first_name} is already a current ${isChildcare(ctx.school) ? "child" : "learner"}.`);
    await run("UPDATE learners SET status = 'Active', left_on = NULL, left_reason = NULL WHERE id = ?", id);
    await syncFamilyLogins([id]);
    // Fees from the current instalment on, including any cancelled when they left.
    const schedule = feesOn(ctx.school) ? await billingSchedule(ctx.schoolId, ctx.school.current_year) : null;
    if (schedule) await billLearners(ctx.schoolId, ctx.school.current_year, schedule, { learnerIds: [id], fromNow: true, topUp: true });
    await audit(ctx.schoolId, ctx.user.id, "readmit", isChildcare(ctx.school) ? "child" : "learner", id);
    refresh();
  });
}
