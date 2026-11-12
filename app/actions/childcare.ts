"use server";
import { revalidatePath } from "next/cache";
import { all, audit, get, run, tx } from "@/lib/db";
import { ADMIN, STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";
import type { Ctx } from "@/lib/auth";
import { AGE_GROUPS, isAgeGroup, isChildcare } from "@/lib/org";
import { childFor, collectors } from "@/lib/childcare";
import { notify, parentsOf } from "@/lib/push";
import { messageUser } from "@/lib/messages";
import { autoBill } from "@/lib/fees";
import { nowTime, today } from "@/lib/today";

const FAMILY_EDIT = ["school_admin", "parent"] as const;
const needCare = (ctx: Ctx) => { if (!isChildcare(ctx.school)) fail("This is for childcare centres."); };
/** The child, when this user may change their details (owner, or the child's own parent). */
const child = async (ctx: Ctx, id: number | null) => (id ? await childFor(ctx, id) : null) ?? fail("Child not found.");
const refreshChild = (id: number) => { revalidatePath(`/children/${id}`); revalidatePath("/children"); revalidatePath("/checkin"); revalidatePath("/dashboard"); };

// ---------------- Classrooms ----------------
export async function saveClassroom(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    const id = num(f, "id"), name = str(f, "name"), ageGroup = str(f, "age_group"), capacity = num(f, "capacity"), lead = num(f, "class_teacher_id");
    if (!name) fail("Enter the classroom's name.");
    if (!isAgeGroup(ageGroup)) fail("Choose the age group.");
    if (capacity != null && (capacity < 1 || capacity > 200 || !Number.isInteger(capacity))) fail("Enter the capacity as a whole number of children.");
    const staffIds = f.getAll("staff").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const valid = new Set((await all<{ id: number }>("SELECT id FROM teachers WHERE school_id = ? AND status = 'Active'", ctx.schoolId)).map((t) => t.id));
    if ((lead && !valid.has(lead)) || staffIds.some((s) => !valid.has(s))) fail("Choose staff from your centre.");
    let classId = id ?? 0;
    await tx(async () => {
      if (id) {
        if (!(await run("UPDATE classes SET name=?, age_group=?, capacity=?, room=?, class_teacher_id=? WHERE id = ? AND school_id = ?", name, ageGroup, capacity, opt(f, "room"), lead, id, ctx.schoolId)).changes) fail("Classroom not found.");
      } else {
        // Childcare classrooms live in the classes table with grade 0 (no grades at a centre).
        classId = (await run("INSERT INTO classes (school_id, grade, name, year, age_group, capacity, room, class_teacher_id) VALUES (?,0,?,?,?,?,?,?)", ctx.schoolId, name, ctx.school.current_year, ageGroup, capacity, opt(f, "room"), lead)).id;
      }
      await run("DELETE FROM classroom_staff WHERE class_id = ?", classId);
      for (const s of new Set(staffIds)) if (s !== lead) await run("INSERT INTO classroom_staff (class_id, teacher_id) VALUES (?,?)", classId, s);
    });
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "classroom", classId, name);
    revalidatePath("/classrooms"); revalidatePath("/dashboard"); revalidatePath("/checkin");
  });
}

export async function deleteClassroom(id: number) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    const n = (await get<{ n: number }>("SELECT COUNT(*) n FROM learners WHERE class_id = ? AND school_id = ?", id, ctx.schoolId))!.n;
    if (n) fail(`Move the ${n} child${n === 1 ? "" : "ren"} to another classroom first.`);
    await run("DELETE FROM classes WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "delete", "classroom", id);
    revalidatePath("/classrooms");
  });
}

/** Children per staff member for each age group (blank keeps the default). */
export async function saveRatios(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    await tx(async () => {
      for (const g of AGE_GROUPS) {
        const v = num(f, `ratio_${g.id}`);
        if (v == null || v === g.ratio) { await run("DELETE FROM ratio_settings WHERE school_id = ? AND age_group = ?", ctx.schoolId, g.id); continue; }
        if (!Number.isInteger(v) || v < 1 || v > 60) fail("Enter each ratio as a whole number of children per staff member (1 to 60).");
        await run("INSERT INTO ratio_settings (school_id, age_group, children_per_staff) VALUES (?,?,?) ON CONFLICT (school_id, age_group) DO UPDATE SET children_per_staff = excluded.children_per_staff", ctx.schoolId, g.id, v);
      }
    });
    await audit(ctx.schoolId, ctx.user.id, "update", "ratio_settings", null);
    revalidatePath("/classrooms"); revalidatePath("/dashboard");
    return { ok: true, message: "Ratios saved." };
  });
}

// ---------------- Child profile: health, allergies, contacts, consent ----------------
export async function saveHealth(_: ActionResult, f: FormData) {
  return guarded([...FAMILY_EDIT], async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, num(f, "learner_id"));
    const v = ["conditions", "medication", "dietary", "doctor_name", "doctor_phone", "medical_aid", "medical_aid_number"].map((k) => opt(f, k));
    await run(`INSERT INTO child_health (learner_id, conditions, medication, dietary, doctor_name, doctor_phone, medical_aid, medical_aid_number, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,ferri_now())
      ON CONFLICT (learner_id) DO UPDATE SET conditions = excluded.conditions, medication = excluded.medication, dietary = excluded.dietary, doctor_name = excluded.doctor_name,
        doctor_phone = excluded.doctor_phone, medical_aid = excluded.medical_aid, medical_aid_number = excluded.medical_aid_number, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      c.id, ...v, ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, "update", "child_health", c.id);
    refreshChild(c.id);
    return { ok: true, message: "Health details saved." };
  });
}

export async function addAllergy(_: ActionResult, f: FormData) {
  return guarded([...FAMILY_EDIT], async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, num(f, "learner_id"));
    const allergen = str(f, "allergen"), severity = str(f, "severity");
    if (!allergen) fail("Enter what the child is allergic to.");
    if (!["Mild", "Moderate", "Severe"].includes(severity)) fail("Choose how serious the allergy is.");
    await run("INSERT INTO child_allergies (learner_id, allergen, severity, reaction, action_plan) VALUES (?,?,?,?,?)", c.id, allergen, severity, opt(f, "reaction"), opt(f, "action_plan"));
    await audit(ctx.schoolId, ctx.user.id, "create", "child_allergy", c.id, `${allergen} (${severity})`);
    refreshChild(c.id);
  });
}

export async function deleteAllergy(id: number) {
  return guarded([...FAMILY_EDIT], async (ctx) => {
    needCare(ctx);
    const a = (await get<{ learner_id: number; allergen: string }>("SELECT learner_id, allergen FROM child_allergies WHERE id = ?", id)) ?? fail("Allergy not found.");
    await child(ctx, a.learner_id);
    await run("DELETE FROM child_allergies WHERE id = ?", id);
    await audit(ctx.schoolId, ctx.user.id, "delete", "child_allergy", a.learner_id, a.allergen);
    refreshChild(a.learner_id);
  });
}

export async function saveContact(_: ActionResult, f: FormData) {
  return guarded([...FAMILY_EDIT], async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, num(f, "learner_id"));
    const id = num(f, "id"), name = str(f, "name"), digits = opt(f, "id_last_digits");
    if (!name) fail("Enter the person's name.");
    if (digits && !/^\d{3,6}$/.test(digits)) fail("Enter only the last 3 to 6 digits of their ID number.");
    const canCollect = str(f, "can_collect") === "1" ? 1 : 0, emergency = str(f, "emergency") === "1" ? 1 : 0;
    if (!canCollect && !emergency) fail("Choose whether this person may collect the child, is an emergency contact, or both.");
    const vals = [name, opt(f, "relationship"), opt(f, "phone"), digits, canCollect, emergency];
    if (id) {
      if (!(await run("UPDATE child_contacts SET name=?, relationship=?, phone=?, id_last_digits=?, can_collect=?, emergency=? WHERE id = ? AND learner_id = ?", ...vals, id, c.id)).changes) fail("Contact not found.");
    } else await run("INSERT INTO child_contacts (name, relationship, phone, id_last_digits, can_collect, emergency, learner_id) VALUES (?,?,?,?,?,?,?)", ...vals, c.id);
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "child_contact", c.id, `${name}${canCollect ? ", may collect" : ""}`);
    refreshChild(c.id);
  });
}

export async function deleteContact(id: number) {
  return guarded([...FAMILY_EDIT], async (ctx) => {
    needCare(ctx);
    const k = (await get<{ learner_id: number; name: string }>("SELECT learner_id, name FROM child_contacts WHERE id = ?", id)) ?? fail("Contact not found.");
    await child(ctx, k.learner_id);
    await run("DELETE FROM child_contacts WHERE id = ?", id);
    await audit(ctx.schoolId, ctx.user.id, "delete", "child_contact", k.learner_id, k.name);
    refreshChild(k.learner_id);
  });
}

/** A parent gives or withdraws consent; the owner can record consent a parent gave on paper. */
export async function setConsent(learnerId: number, kind: "photos" | "medical", given: boolean): Promise<ActionResult> {
  return guarded([...FAMILY_EDIT], async (ctx) => {
    needCare(ctx);
    if (kind !== "photos" && kind !== "medical") fail("Unknown consent.");
    const c = await child(ctx, learnerId);
    await run(`INSERT INTO child_consents (learner_id, kind, given, recorded_by, recorded_at) VALUES (?,?,?,?,ferri_now())
      ON CONFLICT (learner_id, kind) DO UPDATE SET given = excluded.given, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at`, c.id, kind, given ? 1 : 0, ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, given ? "consent" : "withdraw_consent", "child_consent", c.id, kind);
    refreshChild(c.id);
  });
}

/** Owner: a child's monthly fee plan (billed from the current month when fees have been generated). */
export async function setFeePlan(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, num(f, "learner_id"));
    const plan = num(f, "fee_plan_id");
    if (plan && !(await get("SELECT id FROM fee_plans WHERE id = ? AND school_id = ?", plan, ctx.schoolId))) fail("Choose one of your fee plans.");
    await run("UPDATE learners SET fee_plan_id = ? WHERE id = ?", plan, c.id);
    await audit(ctx.schoolId, ctx.user.id, "update", "fee_plan_child", c.id);
    if (plan && c.status === "Active") await autoBill(ctx.schoolId, c.id);
    refreshChild(c.id); revalidatePath("/finance", "layout");
  });
}

// ---------------- Fee plans ----------------
export async function saveFeePlan(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    const id = num(f, "id"), name = str(f, "name"), monthly = num(f, "monthly");
    if (!name) fail("Name the plan, for example Full day.");
    if (monthly == null || monthly <= 0 || monthly > 1e6) fail("Enter the monthly fee in Rand.");
    const amount = Math.round(monthly * 100) / 100;
    if (id) {
      if (!(await run("UPDATE fee_plans SET name = ?, monthly = ? WHERE id = ? AND school_id = ?", name, amount, id, ctx.schoolId)).changes) fail("Plan not found.");
    } else await run("INSERT INTO fee_plans (school_id, name, monthly) VALUES (?,?,?)", ctx.schoolId, name, amount);
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "fee_plan", id, `${name}: R${amount.toFixed(2)} a month`);
    revalidatePath("/finance", "layout"); revalidatePath("/children");
  });
}

export async function deleteFeePlan(id: number) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    const n = (await get<{ n: number }>("SELECT COUNT(*) n FROM learners WHERE fee_plan_id = ? AND school_id = ? AND status = 'Active'", id, ctx.schoolId))!.n;
    if (n) fail(`${n} child${n === 1 ? " is" : "ren are"} on this plan. Move them to another plan first.`);
    await run("DELETE FROM fee_plans WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "delete", "fee_plan", id);
    revalidatePath("/finance", "layout");
  });
}

// ---------------- Check-in and check-out ----------------
/** Who a choice on the check-in form names: "parent:12", "contact:7" or someone else (typed in). */
async function personFrom(learnerId: number, choice: string, other: string | null) {
  const { parents, contacts } = await collectors(learnerId);
  const [kind, raw] = choice.split(":"), id = Number(raw);
  if (kind === "parent") { const p = parents.find((x) => x.id === id); if (p) return { name: `${p.name} (${p.relationship})`, authorised: true }; }
  if (kind === "contact") { const c = contacts.find((x) => x.id === id); if (c) return { name: `${c.name}${c.relationship ? ` (${c.relationship})` : ""}`, authorised: true }; }
  if (!other) fail("Choose who it is, or type the name of the person.");
  return { name: other, authorised: false };
}

export async function checkIn(_: ActionResult, f: FormData) {
  return guarded(STAFF, async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, num(f, "learner_id"));
    if (c.status !== "Active") fail(`${c.first_name} is not an active child at the centre.`);
    const date = today(), time = nowTime();
    const by = await personFrom(c.id, str(f, "dropped_by"), opt(f, "dropped_other"));
    const existing = await get<{ out_at: string | null }>("SELECT out_at FROM checkins WHERE learner_id = ? AND date = ?", c.id, date);
    if (existing && !existing.out_at) fail(`${c.first_name} is already checked in.`);
    if (existing) {
      // Back again the same day (after an appointment, say): a new arrival time, and the collection cleared.
      await run("UPDATE checkins SET in_at = ?, dropped_by = ?, in_note = ?, in_by = ?, out_at = NULL, collected_by = NULL, out_note = NULL, out_by = NULL, unauthorised = 0 WHERE learner_id = ? AND date = ?",
        time, by.name, opt(f, "note"), ctx.user.id, c.id, date);
    } else {
      await run("INSERT INTO checkins (school_id, learner_id, date, in_at, dropped_by, in_note, in_by) VALUES (?,?,?,?,?,?,?)", ctx.schoolId, c.id, date, time, by.name, opt(f, "note"), ctx.user.id);
    }
    // The attendance register (and its reports) count the child as present.
    await run("INSERT INTO attendance (school_id, learner_id, date, status, recorded_by) VALUES (?,?,?,'P',?) ON CONFLICT (learner_id, date) DO UPDATE SET status = 'P', recorded_by = excluded.recorded_by",
      ctx.schoolId, c.id, date, ctx.user.id);
    notify(await parentsOf(c.id), { title: `${c.first_name} checked in`, body: `Arrived at ${time}, dropped off by ${by.name}.`, url: `/children/${c.id}` });
    refreshChild(c.id);
  });
}

export async function checkOut(_: ActionResult, f: FormData) {
  return guarded(STAFF, async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, num(f, "learner_id"));
    const date = today(), time = nowTime();
    const row = await get<{ out_at: string | null }>("SELECT out_at FROM checkins WHERE learner_id = ? AND date = ?", c.id, date);
    if (!row) fail(`${c.first_name} was not checked in today.`);
    if (row.out_at) fail(`${c.first_name} was already collected at ${row.out_at}.`);
    const by = await personFrom(c.id, str(f, "collected_by"), opt(f, "collected_other"));
    // Someone not on the child's list: staff must confirm they checked with the parents first.
    if (!by.authorised && str(f, "confirm_other") !== "1") fail(`${by.name} is not on ${c.first_name}'s collection list. Confirm that you checked with a parent before letting them collect.`);
    await run("UPDATE checkins SET out_at = ?, collected_by = ?, out_note = ?, out_by = ?, unauthorised = ? WHERE learner_id = ? AND date = ?",
      time, by.name, opt(f, "note"), ctx.user.id, by.authorised ? 0 : 1, c.id, date);
    const parents = await parentsOf(c.id);
    if (by.authorised) {
      notify(parents, { title: `${c.first_name} has gone home`, body: `Collected at ${time} by ${by.name}.`, url: `/children/${c.id}` });
    } else {
      // Not on the list: the parents get a message and an alert, and so does the owner.
      const owners = (await all<{ id: number }>("SELECT id FROM users WHERE school_id = ? AND role = 'school_admin' AND active = 1", ctx.schoolId)).map((u) => u.id);
      const body = `${c.first_name} ${c.last_name} was collected at ${time} today by ${by.name}, who is not on the collection list.${opt(f, "note") ? ` Note from staff: ${opt(f, "note")}` : ""}\n\nIf you did not arrange this, contact ${ctx.school.name} immediately${ctx.school.phone ? ` on ${ctx.school.phone}` : ""}.`;
      for (const p of parents) await messageUser(ctx.schoolId, ctx.user.id, p, body);
      notify([...parents, ...owners.filter((o) => o !== ctx.user.id)], { title: `${c.first_name} collected by someone not on the list`, body: `${by.name} collected ${c.first_name} at ${time}.`, url: `/children/${c.id}` });
    }
    await audit(ctx.schoolId, ctx.user.id, by.authorised ? "check_out" : "check_out_unlisted", "child", c.id, by.name);
    refreshChild(c.id);
  });
}

/** Owner: undo today's check-in or check-out when it was recorded by mistake. */
export async function undoCheck(learnerId: number, what: "in" | "out"): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    const c = await child(ctx, learnerId);
    const date = today();
    if (what === "out") await run("UPDATE checkins SET out_at = NULL, collected_by = NULL, out_note = NULL, out_by = NULL, unauthorised = 0 WHERE learner_id = ? AND date = ?", c.id, date);
    else {
      await run("DELETE FROM checkins WHERE learner_id = ? AND date = ?", c.id, date);
      await run("DELETE FROM attendance WHERE learner_id = ? AND date = ?", c.id, date);
    }
    await audit(ctx.schoolId, ctx.user.id, `undo_check_${what}`, "child", c.id);
    refreshChild(c.id);
  });
}

// ---------------- Centre settings ----------------
export async function saveCentreSettings(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    needCare(ctx);
    if (!str(f, "name")) fail("Enter the centre's name.");
    const time = (k: string) => { const v = opt(f, k); if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail("Enter the opening and closing times as HH:MM."); return v; };
    const year = num(f, "current_year") ?? ctx.school.current_year;
    if (year < 2000 || year > 2100) fail("Enter a valid year.");
    await run("UPDATE schools SET name=?, ecd_number=?, province=?, district=?, principal=?, phone=?, email=?, address=?, motto=?, opens_at=?, closes_at=?, current_year=? WHERE id = ?",
      str(f, "name"), opt(f, "ecd_number"), str(f, "province"), opt(f, "district"), opt(f, "principal"), opt(f, "phone"), opt(f, "email"), opt(f, "address"), opt(f, "motto"),
      time("opens_at"), time("closes_at"), year, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "update", "school", ctx.schoolId);
    revalidatePath("/", "layout");
  });
}
