"use server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ownLearnerIds } from "@/lib/auth";
import { all, audit, get, run, tx } from "@/lib/db";
import { ADMIN, emailField, fail, guarded, isDate, limit, num, opt, str, type ActionResult } from "@/lib/action-utils";
import { ROLE_LABEL, gradeLabel, parseSaId } from "@/lib/format";
import { notify } from "@/lib/push";
import { clientIp, overLimit } from "@/lib/rate-limit";
import { securityEvent } from "@/lib/security-log";
import { today } from "@/lib/today";
import { autoBill } from "@/lib/fees";

const STATUSES = ["Submitted", "Reviewing", "Accepted", "Waitlisted", "Declined", "Withdrawn"];
const strongEnough = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p);
const tempPassword = () => "Sk-" + randomBytes(6).toString("base64url") + "9A";
const schoolAdmins = async (schoolId: number) => (await all<{ id: number }>("SELECT id FROM users WHERE school_id = ? AND role = 'school_admin' AND active = 1", schoolId)).map((r) => r.id);

// ---------------- Admissions settings (school admin) ----------------
export async function saveAdmissionsSettings(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const open = str(f, "admissions_open") === "1";
    const year = num(f, "admissions_year") ?? ctx.school.current_year + 1;
    if (year < ctx.school.current_year || year > ctx.school.current_year + 2) fail(`Accept applications for ${ctx.school.current_year}, ${ctx.school.current_year + 1} or ${ctx.school.current_year + 2}.`);
    const info = opt(f, "admissions_info");
    if (info && info.length > 2000) fail("Keep the information for parents under 2 000 characters.");
    // The public form's address: a random code, made once and kept (so links already shared keep working).
    const code = ctx.school.admissions_code ?? randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();
    await run("UPDATE schools SET admissions_open = ?, admissions_year = ?, admissions_info = ?, admissions_code = ? WHERE id = ?", open, year, info, code, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "update", "admissions", null, `${open ? "open" : "closed"} for ${year}`);
    revalidatePath("/admissions");
    return { ok: true, message: open ? `Applications for ${year} are open.` : "Applications are closed." };
  });
}

// ---------------- The public application form ----------------
export async function submitApplication(code: string, _: ActionResult & { reference?: string }, f: FormData): Promise<ActionResult & { reference?: string }> {
  try {
    const school = await get<{ id: number; admissions_open: number; admissions_year: number | null; current_year: number; active: number }>(
      "SELECT id, admissions_open, admissions_year, current_year, active FROM schools WHERE admissions_code = ?", code);
    if (!school || !school.active || !school.admissions_open) fail("This school is not accepting applications online at the moment.");
    const ip = await clientIp();
    // A hidden field people never see: anything typed in it is a bot.
    if (str(f, "website")) { await securityEvent("application_spam", { school: school.id }); return { ok: true, reference: "-" }; }
    if (await overLimit({ key: `apply:${ip}`, max: 8, windowSec: 3600, blockSec: 3600 })) fail("Too many applications from this connection. Please try again later.");
    const first = str(f, "first_name"), last = str(f, "last_name"), pFirst = str(f, "parent_first_name"), pLast = str(f, "parent_last_name");
    if (!first || !last) fail("Enter the child's first name and surname.");
    if (!pFirst || !pLast) fail("Enter your first name and surname.");
    const grade = num(f, "grade");
    if (grade == null || grade < 0 || grade > 12) fail("Choose the grade applied for.");
    const idNumber = opt(f, "id_number");
    if (idNumber && !parseSaId(idNumber).valid) fail("The child's ID number is not a valid South African ID number. Leave it empty if they don't have one.");
    const dob = opt(f, "date_of_birth") ?? (idNumber ? parseSaId(idNumber).dob ?? null : null);
    if (!dob || !isDate(dob) || dob > today()) fail("Enter the child's date of birth.");
    const email = emailField(f, "parent_email");
    const phone = str(f, "parent_phone").replace(/[^\d+]/g, "");
    if (!/^(\+27|0)\d{9}$/.test(phone)) fail("Enter a South African cell number, e.g. 082 123 4567.");
    if (str(f, "consent") !== "1") fail("Please confirm that the information is correct and that the school may use it to process the application.");
    const year = school.admissions_year ?? school.current_year + 1;
    if (await get("SELECT id FROM applications WHERE school_id = ? AND year = ? AND lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND lower(parent_email) = ? AND status NOT IN ('Withdrawn','Declined')", school.id, year, first, last, email))
      fail("An application for this child is already with the school. The school will contact you.");
    const reference = `APP-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const gender = ["Male", "Female"].includes(str(f, "gender")) ? str(f, "gender") : (idNumber ? parseSaId(idNumber).gender ?? null : null);
    await run(`INSERT INTO applications (school_id, reference, year, grade, first_name, last_name, id_number, date_of_birth, gender, home_language, previous_school,
        parent_title, parent_first_name, parent_last_name, parent_email, parent_phone, relationship, address, notes, ip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      school.id, reference, year, grade, first, last, idNumber, dob, gender, opt(f, "home_language"), opt(f, "previous_school"),
      opt(f, "parent_title"), pFirst, pLast, email, phone, opt(f, "relationship") ?? "Parent", opt(f, "address"), opt(f, "notes"), ip);
    notify(await schoolAdmins(school.id), { title: "New application", body: `${first} ${last} for ${gradeLabel(grade)} in ${year}.`, url: "/admissions" });
    return { ok: true, reference };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("!")) return { error: msg.slice(1) };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}

// ---------------- Working through applications (school admin) ----------------
export async function updateApplication(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id"), status = str(f, "status");
    if (!STATUSES.includes(status)) fail("Choose a status.");
    const r = await run("UPDATE applications SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ? AND status <> 'Enrolled'", status, opt(f, "admin_note"), id, ctx.schoolId);
    if (!r.changes) fail("Application not found, or the child is already enrolled.");
    await audit(ctx.schoolId, ctx.user.id, "update", "application", id, status);
    revalidatePath("/admissions");
  });
}

export async function deleteApplication(id: number) {
  return guarded(ADMIN, async (ctx) => {
    await run("DELETE FROM applications WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "delete", "application", id);
    revalidatePath("/admissions");
  });
}

/** Turns an accepted application into a learner (in a class) and links or creates the parent's account. */
export async function enrolApplicant(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const a = (await get<{ id: number; first_name: string; last_name: string; id_number: string | null; date_of_birth: string | null; gender: string | null; home_language: string | null; address: string | null;
      parent_title: string | null; parent_first_name: string; parent_last_name: string; parent_email: string; parent_phone: string; relationship: string | null; status: string }>(
      "SELECT * FROM applications WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Application not found.");
    if (a.status === "Enrolled") fail("This child is already enrolled.");
    const admission = str(f, "admission_number");
    if (!admission) fail("Enter the new learner's admission number.");
    const classId = num(f, "class_id");
    if (classId && !(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", classId, ctx.schoolId))) fail("Choose a valid class.");
    const pw = str(f, "parent_password");
    if (pw && !strongEnough(pw)) fail("The parent's password needs 8+ characters, a capital letter and a number.");
    // The admin may correct the parent's email here (e.g. it is already used by another account).
    const email = (str(f, "parent_email") ? emailField(f, "parent_email") : a.parent_email).toLowerCase();
    const existing = await get<{ id: number; role: string; school_id: number | null; name: string; active: number }>(
      "SELECT id, role, school_id, COALESCE(title || ' ', '') || first_name || ' ' || last_name name, active FROM users WHERE lower(email) = ?", email);
    if (existing && (existing.role !== "parent" || existing.school_id !== ctx.schoolId)) {
      // Who has it: named when they are at this school; someone at another school stays private (POPIA).
      const who = existing.school_id === ctx.schoolId
        ? `${ROLE_LABEL[existing.role]?.toLowerCase() ?? existing.role} ${existing.name} at your school${existing.active ? "" : " (inactive account)"}`
        : existing.role === "super_admin" ? "a FerriDash platform account" : "an account at another school on FerriDash";
      fail(`${email} is already used by ${who}, so it can't be this parent's login. Enter another email address for the parent above (or the email of their existing parent account at your school).`);
    }
    let created = false, learnerId = 0;
    await tx(async () => {
      learnerId = (await run("INSERT INTO learners (first_name, last_name, admission_number, id_number, gender, date_of_birth, class_id, home_language, address, status, school_id, enrolled_on) VALUES (?,?,?,?,?,?,?,?,?,'Active',?,date('now'))",
        a.first_name, a.last_name, admission, a.id_number, a.gender, a.date_of_birth, classId, a.home_language, a.address, ctx.schoolId)).id;
      let parent = existing ? { id: existing.id } : undefined;
      if (!parent) {
        parent = { id: (await run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)",
          ctx.schoolId, "parent", a.parent_title, a.parent_first_name, a.parent_last_name, email, a.parent_phone, bcrypt.hashSync(pw || tempPassword(), 10))).id };
        created = true;
      }
      await run("INSERT INTO guardian_links (parent_user_id, learner_id, relationship) VALUES (?,?,?) ON CONFLICT (parent_user_id, learner_id) DO NOTHING", parent.id, learnerId, a.relationship || "Parent");
      await run("UPDATE applications SET status = 'Enrolled', learner_id = ?, parent_email = ?, updated_at = datetime('now') WHERE id = ?", learnerId, email, a.id);
      await audit(ctx.schoolId, ctx.user.id, "enrol", "learner", learnerId, `from application ${id}`);
    });
    // School fees on the school's schedule, when the year has been billed (lib/fees.ts autoBill).
    const fees = await autoBill(ctx.schoolId, learnerId) ? " This year's school fees were added to their account." : "";
    revalidatePath("/admissions");
    revalidatePath("/learners");
    revalidatePath("/finance", "layout");
    return { ok: true, message: (created
      ? `${a.first_name} is enrolled. A parent account was created for ${email}${pw ? " with the password you set" : ": set its password under Parents → Reset password and share it with the parent"}.`
      : `${a.first_name} is enrolled and linked to the existing parent account ${email}.`) + fees };
  });
}

// ---------------- Re-enrolment ----------------
export async function saveReenrolment(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const open = str(f, "open") === "1";
    const deadline = opt(f, "deadline");
    if (open && deadline && !isDate(deadline)) fail("Choose a valid closing date.");
    const year = ctx.school.current_year + 1;
    const wasOpen = ctx.school.reenrol_year === year;
    await run("UPDATE schools SET reenrol_year = ?, reenrol_deadline = ? WHERE id = ?", open ? year : null, open ? deadline : null, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "update", "reenrolment", null, open ? `open for ${year}` : "closed");
    if (open && !wasOpen) {
      const parents = (await all<{ id: number }>(`SELECT DISTINCT g.parent_user_id id FROM guardian_links g JOIN learners l ON l.id = g.learner_id JOIN users u ON u.id = g.parent_user_id
        WHERE l.school_id = ? AND l.status = 'Active' AND u.active = 1`, ctx.schoolId)).map((r) => r.id);
      notify(parents, { title: `Re-enrolment for ${year}`, body: "Please let the school know whether your child will return next year.", url: "/admissions/reenrol" });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: open ? `Re-enrolment for ${year} is open. Parents were notified.` : "Re-enrolment is closed." };
  });
}

/** Push a reminder to the parents who haven't answered yet. */
export async function remindReenrolment(): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const year = ctx.school.reenrol_year ?? fail("Re-enrolment is not open.");
    await limit(ctx, "reenrol_remind", 5, 3600);
    const parents = (await all<{ id: number }>(`SELECT DISTINCT g.parent_user_id id FROM guardian_links g JOIN learners l ON l.id = g.learner_id JOIN users u ON u.id = g.parent_user_id
      WHERE l.school_id = ? AND l.status = 'Active' AND u.active = 1 AND NOT EXISTS (SELECT 1 FROM reenrolments r WHERE r.learner_id = l.id AND r.year = ?)`, ctx.schoolId, year)).map((r) => r.id);
    notify(parents, { title: `Re-enrolment for ${year}`, body: "We haven't heard from you yet. Will your child return next year?", url: "/admissions/reenrol" });
    return { ok: true, message: parents.length ? `Reminded ${parents.length} parent${parents.length === 1 ? "" : "s"} (on the FerriDash app).` : "Every family has answered." };
  });
}

/** A parent answers for one child; the school admin can also record an answer given at the office. */
export async function answerReenrolment(_: ActionResult, f: FormData) {
  return guarded(["parent", "school_admin"], async (ctx) => {
    const year = ctx.school.reenrol_year ?? fail("Re-enrolment is closed.");
    if (!ctx.isAdmin && ctx.school.reenrol_deadline && today() > ctx.school.reenrol_deadline) fail("The closing date has passed. Please contact the school office.");
    const learnerId = num(f, "learner_id") ?? 0;
    if (ctx.isAdmin ? !(await get("SELECT id FROM learners WHERE id = ? AND school_id = ?", learnerId, ctx.schoolId)) : !((await ownLearnerIds(ctx)) ?? []).includes(learnerId)) fail("Choose one of your children.");
    const status = str(f, "status");
    if (!["Returning", "Leaving", "Unsure"].includes(status)) fail("Choose an answer.");
    const reason = opt(f, "reason");
    if (status === "Leaving" && !reason) fail("Please tell the school why, or which school your child is moving to.");
    await run(`INSERT INTO reenrolments (school_id, learner_id, year, status, reason, responded_by) VALUES (?,?,?,?,?,?)
      ON CONFLICT (learner_id, year) DO UPDATE SET status = excluded.status, reason = excluded.reason, responded_by = excluded.responded_by, responded_at = datetime('now')`,
      ctx.schoolId, learnerId, year, status, reason, ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, "reenrolment", "learner", learnerId, `${year}: ${status}`);
    revalidatePath("/admissions/reenrol");
    revalidatePath("/dashboard");
    return { ok: true, message: "Thank you. Your answer was sent to the school." };
  });
}
