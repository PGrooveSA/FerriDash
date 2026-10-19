"use server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { AVATAR_DIR, MAX_AVATAR_BYTES, avatarFile, imageType } from "@/lib/uploads";
import { revalidatePath } from "next/cache";
import { audit, get, run, tx } from "@/lib/db";
import { parseSaId } from "@/lib/format";
import { ADMIN, STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";

const strongEnough = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p);
const tempPassword = () => "Sk-" + randomBytes(6).toString("base64url") + "9A";

function checkId(id: string | null) {
  if (id && !parseSaId(id).valid) fail("The South African ID number is not valid (13 digits with a correct check digit).");
}

// ---------------- Teachers ----------------
export async function saveTeacher(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "id");
    const email = str(f, "email").toLowerCase();
    if (!email.includes("@")) fail("Enter a valid email address.");
    checkId(opt(f, "id_number"));
    // Classes & subjects ticked on the form (must belong to this school), and the optional register class.
    const allocations = [...new Set(f.getAll("allocations").map(Number).filter(Boolean))];
    for (const cs of allocations) if (!get("SELECT id FROM class_subjects WHERE id = ? AND school_id = ?", cs, ctx.schoolId)) fail("One of the chosen classes/subjects is not valid.");
    const homeroom = num(f, "homeroom_class_id");
    if (homeroom && !get("SELECT id FROM classes WHERE id = ? AND school_id = ?", homeroom, ctx.schoolId)) fail("Choose a valid register class.");
    tx(() => {
      let teacherId = id;
      if (id) {
        const t = get<{ user_id: number }>("SELECT user_id FROM teachers WHERE id = ? AND school_id = ?", id, ctx.schoolId) ?? fail("Teacher not found.");
        run("UPDATE users SET title=?, first_name=?, last_name=?, email=?, phone=? WHERE id = ?", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), t.user_id);
        run("UPDATE teachers SET staff_number=?, persal_number=?, sace_number=?, id_number=?, gender=?, post_level=?, address=? WHERE id = ?",
          opt(f, "staff_number"), opt(f, "persal_number"), opt(f, "sace_number"), opt(f, "id_number"), opt(f, "gender"), opt(f, "post_level"), opt(f, "address"), id);
        audit(ctx.schoolId, ctx.user.id, "update", "teacher", id);
      } else {
        const pw = str(f, "password");
        if (!strongEnough(pw)) fail("Initial password needs 8+ characters, a capital letter and a number.");
        const u = run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)",
          ctx.schoolId, "teacher", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), bcrypt.hashSync(pw, 10));
        const t = run("INSERT INTO teachers (school_id, user_id, staff_number, persal_number, sace_number, id_number, gender, post_level, address, employed_since) VALUES (?,?,?,?,?,?,?,?,?,date('now'))",
          ctx.schoolId, u.id, opt(f, "staff_number"), opt(f, "persal_number"), opt(f, "sace_number"), opt(f, "id_number"), opt(f, "gender"), opt(f, "post_level"), opt(f, "address"));
        audit(ctx.schoolId, ctx.user.id, "create", "teacher", t.id);
        teacherId = t.id;
      }
      // Teaching allocation: unticked subjects become unallocated; ticked ones move to this teacher.
      const keep = allocations.length ? allocations : [-1];
      run(`UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = ? AND id NOT IN (${keep.map(() => "?").join(",")})`, teacherId!, ...keep);
      for (const cs of allocations) run("UPDATE class_subjects SET teacher_id = ? WHERE id = ?", teacherId!, cs);
      run("UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ? AND id IS NOT ?", teacherId!, homeroom);
      if (homeroom) run("UPDATE classes SET class_teacher_id = ? WHERE id = ?", teacherId!, homeroom);
      audit(ctx.schoolId, ctx.user.id, "allocate", "teacher", teacherId!, `${allocations.length} subject(s)${homeroom ? ", register class" : ""}`);
    });
    revalidatePath("/academics");
    revalidatePath("/teachers");
  });
}

export async function deleteTeacher(id: number) {
  return guarded(ADMIN, (ctx) => {
    const t = get<{ user_id: number }>("SELECT user_id FROM teachers WHERE id = ? AND school_id = ?", id, ctx.schoolId) ?? fail("Teacher not found.");
    tx(() => { run("DELETE FROM teachers WHERE id = ?", id); run("DELETE FROM users WHERE id = ?", t.user_id); });
    removeAvatarFile(t.user_id);
    audit(ctx.schoolId, ctx.user.id, "delete", "teacher", id);
    revalidatePath("/teachers");
  });
}

// ---------------- Learners ----------------
export async function saveLearner(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "id");
    const idNumber = opt(f, "id_number");
    checkId(idNumber);
    const decoded = idNumber ? parseSaId(idNumber) : null;
    const classId = num(f, "class_id");
    if (classId && !get("SELECT id FROM classes WHERE id = ? AND school_id = ?", classId, ctx.schoolId)) fail("Choose a valid class.");
    const fields = [str(f, "first_name"), str(f, "last_name"), str(f, "admission_number"), idNumber, opt(f, "gender") ?? decoded?.gender ?? null,
      opt(f, "date_of_birth") ?? decoded?.dob ?? null, classId, opt(f, "home_language"), opt(f, "address"), str(f, "status") || "Active"];
    if (!fields[0] || !fields[1] || !fields[2]) fail("Name, surname and admission number are required.");

    tx(() => {
      let learnerId = id;
      if (id) {
        if (!get("SELECT id FROM learners WHERE id = ? AND school_id = ?", id, ctx.schoolId)) fail("Learner not found.");
        run("UPDATE learners SET first_name=?, last_name=?, admission_number=?, id_number=?, gender=?, date_of_birth=?, class_id=?, home_language=?, address=?, status=? WHERE id = ?", ...fields, id);
        run("UPDATE users SET first_name=?, last_name=? WHERE id = (SELECT user_id FROM learners WHERE id = ?)", fields[0], fields[1], id);
      } else {
        learnerId = run("INSERT INTO learners (first_name, last_name, admission_number, id_number, gender, date_of_birth, class_id, home_language, address, status, school_id, enrolled_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,date('now'))", ...fields, ctx.schoolId).id;
        const loginEmail = str(f, "login_email").toLowerCase();
        if (loginEmail) {
          const u = run("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash) VALUES (?,?,?,?,?,?)", ctx.schoolId, "learner", fields[0], fields[1], loginEmail, bcrypt.hashSync(str(f, "login_password") || tempPassword(), 10));
          run("UPDATE learners SET user_id = ? WHERE id = ?", u.id, learnerId);
        }
      }
      // Optional parent / guardian link
      const pEmail = str(f, "parent_email").toLowerCase();
      if (pEmail) {
        let parent = get<{ id: number; role: string; school_id: number }>("SELECT id, role, school_id FROM users WHERE lower(email) = ?", pEmail);
        if (parent && (parent.role !== "parent" || parent.school_id !== ctx.schoolId)) fail("That email belongs to another account.");
        if (!parent) {
          if (!str(f, "parent_first_name") || !str(f, "parent_last_name")) fail("Enter the parent's name to create a new parent account.");
          const pw = str(f, "parent_password");
          if (pw && !strongEnough(pw)) fail("Parent password needs 8+ characters, a capital letter and a number.");
          parent = { id: run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)", ctx.schoolId, "parent", opt(f, "parent_title"), str(f, "parent_first_name"), str(f, "parent_last_name"), pEmail, opt(f, "parent_phone"), bcrypt.hashSync(pw || tempPassword(), 10)).id, role: "parent", school_id: ctx.schoolId };
        }
        run("INSERT OR IGNORE INTO guardian_links (parent_user_id, learner_id, relationship) VALUES (?,?,?)", parent.id, learnerId!, str(f, "relationship") || "Parent");
      }
      audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "learner", learnerId);
    });
    revalidatePath("/learners");
  });
}

export async function deleteLearner(id: number) {
  return guarded(ADMIN, (ctx) => {
    const l = get<{ user_id: number | null }>("SELECT user_id FROM learners WHERE id = ? AND school_id = ?", id, ctx.schoolId) ?? fail("Learner not found.");
    tx(() => { run("DELETE FROM learners WHERE id = ?", id); if (l.user_id) run("DELETE FROM users WHERE id = ?", l.user_id); });
    removeAvatarFile(l.user_id);
    audit(ctx.schoolId, ctx.user.id, "delete", "learner", id);
    revalidatePath("/learners");
  });
}

// ---------------- Parents ----------------
export async function saveParent(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "id");
    const email = str(f, "email").toLowerCase();
    if (id) {
      if (!get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'parent'", id, ctx.schoolId)) fail("Parent not found.");
      run("UPDATE users SET title=?, first_name=?, last_name=?, email=?, phone=? WHERE id = ?", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), id);
    } else {
      const pw = str(f, "password");
      if (!strongEnough(pw)) fail("Password needs 8+ characters, a capital letter and a number.");
      run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)", ctx.schoolId, "parent", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), bcrypt.hashSync(pw, 10));
    }
    audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "parent", id);
    revalidatePath("/parents");
  });
}

export async function linkChild(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const parentId = num(f, "parent_id");
    const learner = get<{ id: number }>("SELECT id FROM learners WHERE school_id = ? AND admission_number = ?", ctx.schoolId, str(f, "admission_number")) ?? fail("No learner with that admission number.");
    if (!get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'parent'", parentId, ctx.schoolId)) fail("Parent not found.");
    run("INSERT OR REPLACE INTO guardian_links (parent_user_id, learner_id, relationship) VALUES (?,?,?)", parentId, learner.id, str(f, "relationship") || "Parent");
    audit(ctx.schoolId, ctx.user.id, "link", "guardian", learner.id, `parent ${parentId}`);
    revalidatePath("/parents");
  });
}

export async function unlinkChild(parentId: number, learnerId: number) {
  return guarded(ADMIN, (ctx) => {
    run("DELETE FROM guardian_links WHERE parent_user_id = ? AND learner_id = ? AND learner_id IN (SELECT id FROM learners WHERE school_id = ?)", parentId, learnerId, ctx.schoolId);
    revalidatePath("/parents");
  });
}

export async function deleteUser(id: number) {
  return guarded(ADMIN, (ctx) => {
    const u = get<{ role: string }>("SELECT role FROM users WHERE id = ? AND school_id = ?", id, ctx.schoolId) ?? fail("User not found.");
    if (u.role === "school_admin" && id === ctx.user.id) fail("You cannot delete your own account.");
    run("DELETE FROM users WHERE id = ?", id);
    removeAvatarFile(id);
    audit(ctx.schoolId, ctx.user.id, "delete", "user", id);
    revalidatePath("/parents");
  });
}

/** Admin sets a new password for any user in their school. */
export async function resetPassword(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "user_id"), pw = str(f, "password");
    if (!strongEnough(pw)) fail("Password needs 8+ characters, a capital letter and a number.");
    const scope = ctx.user.role === "super_admin" ? get("SELECT id FROM users WHERE id = ?", id) : get("SELECT id FROM users WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    if (!scope) fail("User not found.");
    run("UPDATE users SET password_hash = ? WHERE id = ?", bcrypt.hashSync(pw, 10), id);
    audit(ctx.schoolId, ctx.user.id, "reset_password", "user", id);
  });
}

// ---------------- Profile photo ----------------
function removeAvatarFile(userId: number | null | undefined) {
  if (userId) rmSync(avatarFile(userId), { force: true });
}

/** Any signed-in user may set their own profile photo (resized in the browser first). */
export async function uploadAvatar(f: FormData): Promise<ActionResult> {
  return guarded(undefined, async (ctx) => {
    const file = f.get("photo");
    if (!(file instanceof File) || file.size === 0) fail("Choose a photo to upload.");
    if (file.size > MAX_AVATAR_BYTES) fail("That photo is too large. Please use an image under 2 MB.");
    const buf = new Uint8Array(await file.arrayBuffer());
    if (!imageType(buf)) fail("Only JPG, PNG or WebP photos are allowed.");
    mkdirSync(AVATAR_DIR, { recursive: true });
    writeFileSync(avatarFile(ctx.user.id), buf);
    run("UPDATE users SET avatar_updated_at = datetime('now') WHERE id = ?", ctx.user.id);
    audit(ctx.schoolId, ctx.user.id, "upload_photo", "user", ctx.user.id);
    revalidatePath("/", "layout");
  });
}

export async function removeAvatar(): Promise<ActionResult> {
  return guarded(undefined, (ctx) => {
    removeAvatarFile(ctx.user.id);
    run("UPDATE users SET avatar_updated_at = NULL WHERE id = ?", ctx.user.id);
    audit(ctx.schoolId, ctx.user.id, "remove_photo", "user", ctx.user.id);
    revalidatePath("/", "layout");
  });
}

// ---------------- Profile ----------------
export async function updateProfile(_: ActionResult, f: FormData) {
  return guarded(STAFF.concat(["learner", "parent"]), (ctx) => {
    run("UPDATE users SET title=?, phone=? WHERE id = ?", opt(f, "title"), opt(f, "phone"), ctx.user.id);
    revalidatePath("/profile");
  });
}
