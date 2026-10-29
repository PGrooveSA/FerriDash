"use server";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { MAX_AVATAR_BYTES, MAX_BANNER_BYTES, imageType } from "@/lib/uploads";
import { putFile, removeFile, storageKey } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { all, audit, get, run, tx } from "@/lib/db";
import { EXIT_REASONS } from "@/lib/staff";
import { parseSaId } from "@/lib/format";
import { ADMIN, EVERYONE, STAFF, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";

const strongEnough = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p);
const tempPassword = () => "Sk-" + randomBytes(6).toString("base64url") + "9A";

function checkId(id: string | null) {
  if (id && !parseSaId(id).valid) fail("The South African ID number is not valid (13 digits with a correct check digit).");
}

// ---------------- Teachers ----------------
/** Grade from a class name: "10A" -> 10, "8 B" -> 8, "R1"/"RA" -> 0 (Grade R). */
function gradeOfClassName(name: string): number | null {
  if (/^R(?![A-Z]{2})/i.test(name)) return 0;
  const m = name.match(/^(\d{1,2})/);
  const g = m ? Number(m[1]) : NaN;
  return g >= 1 && g <= 12 ? g : null;
}

/** Best-guess CAPS category for a new subject name (can be changed under Classes & Subjects). */
function subjectCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("home language")) return "HL";
  if (n.includes("first additional")) return "FAL";
  if (n.includes("second additional")) return "SAL";
  if (n.includes("mathematical literacy") || n === "maths lit") return "MLIT";
  if (/^(mathematics|maths|math)$/.test(n)) return "MATH";
  if (n.includes("life orientation") || n === "life skills") return "LO";
  return "OTHER";
}

export async function saveTeacher(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const email = str(f, "email").toLowerCase();
    if (!email.includes("@")) fail("Enter a valid email address.");
    checkId(opt(f, "id_number"));
    // Classes & subjects ticked on the form (must belong to this school), and the optional register class.
    const allocations = [...new Set(f.getAll("allocations").map(Number).filter(Boolean))];
    for (const cs of allocations) if (!(await get("SELECT id FROM class_subjects WHERE id = ? AND school_id = ?", cs, ctx.schoolId))) fail("One of the chosen classes/subjects is not valid.");
    const homeroom = num(f, "homeroom_class_id");
    // "Add teaching": chosen or newly typed classes x subjects.
    const ids = (k: string) => [...new Set(f.getAll(k).map(Number).filter(Boolean))];
    const names = (k: string) => [...new Set(str(f, k).split(/[,;\n]/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))];
    const teachClasses = ids("teach_classes"), teachSubjects = ids("teach_subjects");
    const newClasses = names("new_classes").map((n) => n.toUpperCase().replace(/^GRADE\s*/, "").replace(/\s+/g, "")), newSubjects = names("new_subjects");
    for (const c of teachClasses) if (!(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", c, ctx.schoolId))) fail("One of the chosen classes is not valid.");
    for (const x of teachSubjects) if (!(await get("SELECT id FROM subjects WHERE id = ? AND school_id = ?", x, ctx.schoolId))) fail("One of the chosen subjects is not valid.");
    for (const n of newClasses) if (gradeOfClassName(n) == null) fail(`Start new class names with the grade, e.g. 10A or R1 ("${n}").`);
    const anyClass = teachClasses.length + newClasses.length > 0, anySubject = teachSubjects.length + newSubjects.length > 0;
    if (anyClass !== anySubject) fail(anyClass ? "Choose or type at least one subject for the chosen classes." : "Choose or type at least one class for the chosen subjects.");
    if (homeroom && !(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", homeroom, ctx.schoolId))) fail("Choose a valid register class.");
    await tx(async () => {
            let teacherId = id;
            if (id) {
              const t = (await get<{ user_id: number }>("SELECT user_id FROM teachers WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Teacher not found.");
              await run("UPDATE users SET title=?, first_name=?, last_name=?, email=?, phone=? WHERE id = ?", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), t.user_id);
              await run("UPDATE teachers SET staff_number=?, persal_number=?, sace_number=?, id_number=?, gender=?, post_level=?, address=? WHERE id = ?",
                          opt(f, "staff_number"), opt(f, "persal_number"), opt(f, "sace_number"), opt(f, "id_number"), opt(f, "gender"), opt(f, "post_level"), opt(f, "address"), id);
              await audit(ctx.schoolId, ctx.user.id, "update", "teacher", id);
            } else {
              const pw = str(f, "password");
              if (!strongEnough(pw)) fail("Initial password needs 8+ characters, a capital letter and a number.");
              const u = await run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)",
                        ctx.schoolId, "teacher", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), bcrypt.hashSync(pw, 10));
              const t = await run("INSERT INTO teachers (school_id, user_id, staff_number, persal_number, sace_number, id_number, gender, post_level, address, employed_since) VALUES (?,?,?,?,?,?,?,?,?,date('now'))",
                        ctx.schoolId, u.id, opt(f, "staff_number"), opt(f, "persal_number"), opt(f, "sace_number"), opt(f, "id_number"), opt(f, "gender"), opt(f, "post_level"), opt(f, "address"));
              await audit(ctx.schoolId, ctx.user.id, "create", "teacher", t.id);
              teacherId = t.id;
            }
            // Create any new classes/subjects, then the class-subject pairs for every combination.
            const classIds = [...teachClasses, ...(await Promise.all(newClasses.map(async (n) =>
                        (await get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND name = ? AND year = ?", ctx.schoolId, n, ctx.school.current_year))?.id
                        ?? (await run("INSERT INTO classes (school_id, grade, name, year) VALUES (?,?,?,?)", ctx.schoolId, gradeOfClassName(n)!, n, ctx.school.current_year)).id)))];
            const subjectIds = [...teachSubjects, ...(await Promise.all(newSubjects.map(async (n) =>
                        (await get<{ id: number }>("SELECT id FROM subjects WHERE school_id = ? AND lower(name) = lower(?)", ctx.schoolId, n))?.id
                        ?? (await run("INSERT INTO subjects (school_id, name, code, category) VALUES (?,?,?,?)", ctx.schoolId, n, n.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 4), subjectCategory(n))).id)))];
            for (const c of classIds) for (const x of subjectIds) {
              const cs = (await get<{ id: number }>("SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?", c, x))?.id
                ?? (await run("INSERT INTO class_subjects (school_id, class_id, subject_id) VALUES (?,?,?)", ctx.schoolId, c, x)).id;
              if (!allocations.includes(cs)) allocations.push(cs);
            }
            // Teaching allocation: unticked subjects become unallocated; ticked ones move to this teacher.
            const keep = allocations.length ? allocations : [-1];
            await run(`UPDATE class_subjects SET teacher_id = NULL WHERE teacher_id = ? AND id NOT IN (${keep.map(() => "?").join(",")})`, teacherId!, ...keep);
            for (const cs of allocations) await run("UPDATE class_subjects SET teacher_id = ? WHERE id = ?", teacherId!, cs);
            await run("UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ? AND id IS DISTINCT FROM ?", teacherId!, homeroom);
            if (homeroom) await run("UPDATE classes SET class_teacher_id = ? WHERE id = ?", teacherId!, homeroom);
            await audit(ctx.schoolId, ctx.user.id, "allocate", "teacher", teacherId!, `${allocations.length} subject(s)${homeroom ? ", register class" : ""}`);
          });
    revalidatePath("/academics");
    revalidatePath("/teachers");
  });
}

/**
 * A teacher leaves the school (resigns, transfers, retires...). Nothing is deleted: their login is
 * switched off, this year's classes and register class are handed over (or left unallocated), and
 * every handover is logged so the school can still see who taught what.
 */
export async function exitTeacher(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const t = (await get<{ user_id: number; status: string }>("SELECT user_id, status FROM teachers WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Teacher not found.");
    if (t.status !== "Active") fail("This teacher has already left the school.");
    const reason = str(f, "reason");
    if (!(EXIT_REASONS as readonly string[]).includes(reason)) fail("Choose why the teacher is leaving.");
    const leftOn = opt(f, "left_on") ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leftOn)) fail("Enter a valid last working day.");
    const destination = opt(f, "transferred_to");
    const note = [reason === "Transferred" && destination ? `Transferred to ${destination}` : null, opt(f, "note")].filter(Boolean).join(" · ") || null;

    // Who takes over: a per-class choice, else the "everything" choice, else unallocated.
    const target = async (key: string) => {
      const v = num(f, key) ?? num(f, "handover_all");
      if (!v) return null;
      if (v === id || !(await get("SELECT id FROM teachers WHERE id = ? AND school_id = ? AND status = 'Active'", v, ctx.schoolId))) fail("Hand over only to a current teacher at this school.");
      return v;
    };
    const teaching = await all<{ id: number; class_id: number; subject_id: number }>(
          "SELECT cs.id, cs.class_id, cs.subject_id FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE cs.teacher_id = ? AND c.year >= ?", id, ctx.school.current_year);
    const registers = await all<{ id: number }>("SELECT id FROM classes WHERE class_teacher_id = ? AND year >= ?", id, ctx.school.current_year);

    await tx(async () => {
            for (const cs of teaching) {
              const to = await target(`handover_${cs.id}`);
              await run("INSERT INTO teaching_handovers (school_id, teacher_id, class_id, subject_id, register, ended_on, handed_to) VALUES (?,?,?,?,0,?,?)", ctx.schoolId, id, cs.class_id, cs.subject_id, leftOn, to);
              await run("UPDATE class_subjects SET teacher_id = ? WHERE id = ?", to, cs.id);
            }
            for (const c of registers) {
              const to = await target(`register_${c.id}`);
              await run("INSERT INTO teaching_handovers (school_id, teacher_id, class_id, subject_id, register, ended_on, handed_to) VALUES (?,?,?,NULL,1,?,?)", ctx.schoolId, id, c.id, leftOn, to);
              await run("UPDATE classes SET class_teacher_id = ? WHERE id = ?", to, c.id);
            }
            await run("UPDATE teachers SET status = ?, left_on = ?, exit_note = ? WHERE id = ?", reason, leftOn, note, id);
            await run("UPDATE users SET active = 0 WHERE id = ?", t.user_id);
            await audit(ctx.schoolId, ctx.user.id, "exit", "teacher", id, `${reason} ${leftOn}: ${teaching.length} subject(s), ${registers.length} register class(es) handed over`);
          });
    revalidatePath("/teachers");
    return { ok: true, message: "Teacher marked as left." };
  });
}

/** Re-employ a teacher who left: login works again; teaching is allocated afresh with Edit. */
export async function reinstateTeacher(id: number) {
  return guarded(ADMIN, async (ctx) => {
    const t = (await get<{ user_id: number; status: string }>("SELECT user_id, status FROM teachers WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Teacher not found.");
    if (t.status === "Active") fail("This teacher is already active.");
    await tx(async () => {
            await run("UPDATE teachers SET status = 'Active', left_on = NULL, exit_note = NULL, employed_since = date('now') WHERE id = ?", id);
            await run("UPDATE users SET active = 1 WHERE id = ?", t.user_id);
          });
    await audit(ctx.schoolId, ctx.user.id, "reinstate", "teacher", id);
    revalidatePath("/teachers");
  });
}

export async function deleteTeacher(id: number) {
  return guarded(ADMIN, async (ctx) => {
    const t = (await get<{ user_id: number }>("SELECT user_id FROM teachers WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Teacher not found.");
    // Deleting is only for teachers added by mistake: anyone with teaching history keeps their record.
    const history = await get(`SELECT 1 FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE cs.teacher_id = ?1 AND c.year < ?2
      UNION SELECT 1 FROM classes WHERE class_teacher_id = ?1 AND year < ?2 UNION SELECT 1 FROM teaching_handovers WHERE teacher_id = ?1
      UNION SELECT 1 FROM marks WHERE updated_by = ?3 UNION SELECT 1 FROM attendance WHERE recorded_by = ?3 LIMIT 1`, id, ctx.school.current_year, t.user_id);
    if (history) fail("This teacher has teaching records, so they can't be deleted. Use \"Leaves school\" instead: their history is kept and their login is switched off.");
    await tx(async () => { await run("DELETE FROM teachers WHERE id = ?", id); await run("DELETE FROM users WHERE id = ?", t.user_id); });
    await removeUserFiles(t.user_id);
    await audit(ctx.schoolId, ctx.user.id, "delete", "teacher", id);
    revalidatePath("/teachers");
  });
}

// ---------------- Learners ----------------
export async function saveLearner(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const idNumber = opt(f, "id_number");
    checkId(idNumber);
    const decoded = idNumber ? parseSaId(idNumber) : null;
    const classId = num(f, "class_id");
    if (classId && !(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", classId, ctx.schoolId))) fail("Choose a valid class.");
    const fields = [str(f, "first_name"), str(f, "last_name"), str(f, "admission_number"), idNumber, opt(f, "gender") ?? decoded?.gender ?? null,
      opt(f, "date_of_birth") ?? decoded?.dob ?? null, classId, opt(f, "home_language"), opt(f, "address"), str(f, "status") || "Active"];
    if (!fields[0] || !fields[1] || !fields[2]) fail("Name, surname and admission number are required.");

    await tx(async () => {
            let learnerId = id;
            if (id) {
              if (!(await get("SELECT id FROM learners WHERE id = ? AND school_id = ?", id, ctx.schoolId))) fail("Learner not found.");
              await run("UPDATE learners SET first_name=?, last_name=?, admission_number=?, id_number=?, gender=?, date_of_birth=?, class_id=?, home_language=?, address=?, status=? WHERE id = ?", ...fields, id);
              await run("UPDATE users SET first_name=?, last_name=? WHERE id = (SELECT user_id FROM learners WHERE id = ?)", fields[0], fields[1], id);
            } else {
              learnerId = (await run("INSERT INTO learners (first_name, last_name, admission_number, id_number, gender, date_of_birth, class_id, home_language, address, status, school_id, enrolled_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,date('now'))", ...fields, ctx.schoolId)).id;
              const loginEmail = str(f, "login_email").toLowerCase();
              if (loginEmail) {
                const u = await run("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash) VALUES (?,?,?,?,?,?)", ctx.schoolId, "learner", fields[0], fields[1], loginEmail, bcrypt.hashSync(str(f, "login_password") || tempPassword(), 10));
                await run("UPDATE learners SET user_id = ? WHERE id = ?", u.id, learnerId);
              }
            }
            // Optional parent / guardian link
            const pEmail = str(f, "parent_email").toLowerCase();
            if (pEmail) {
              let parent = await get<{ id: number; role: string; school_id: number }>("SELECT id, role, school_id FROM users WHERE lower(email) = ?", pEmail);
              if (parent && (parent.role !== "parent" || parent.school_id !== ctx.schoolId)) fail("That email belongs to another account.");
              if (!parent) {
                if (!str(f, "parent_first_name") || !str(f, "parent_last_name")) fail("Enter the parent's name to create a new parent account.");
                const pw = str(f, "parent_password");
                if (pw && !strongEnough(pw)) fail("Parent password needs 8+ characters, a capital letter and a number.");
                parent = { id: (await run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)", ctx.schoolId, "parent", opt(f, "parent_title"), str(f, "parent_first_name"), str(f, "parent_last_name"), pEmail, opt(f, "parent_phone"), bcrypt.hashSync(pw || tempPassword(), 10))).id, role: "parent", school_id: ctx.schoolId };
              }
              await run("INSERT INTO guardian_links (parent_user_id, learner_id, relationship) VALUES (?,?,?) ON CONFLICT (parent_user_id, learner_id) DO NOTHING", parent.id, learnerId!, str(f, "relationship") || "Parent");
            }
            await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "learner", learnerId);
          });
    revalidatePath("/learners");
  });
}

export async function deleteLearner(id: number) {
  return guarded(ADMIN, async (ctx) => {
    const l = (await get<{ user_id: number | null }>("SELECT user_id FROM learners WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("Learner not found.");
    await tx(async () => { await run("DELETE FROM learners WHERE id = ?", id); if (l.user_id) await run("DELETE FROM users WHERE id = ?", l.user_id); });
    await removeUserFiles(l.user_id);
    await audit(ctx.schoolId, ctx.user.id, "delete", "learner", id);
    revalidatePath("/learners");
  });
}

// ---------------- Parents ----------------
export async function saveParent(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const email = str(f, "email").toLowerCase();
    if (id) {
      if (!(await get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'parent'", id, ctx.schoolId))) fail("Parent not found.");
      await run("UPDATE users SET title=?, first_name=?, last_name=?, email=?, phone=? WHERE id = ?", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), id);
    } else {
      const pw = str(f, "password");
      if (!strongEnough(pw)) fail("Password needs 8+ characters, a capital letter and a number.");
      await run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)", ctx.schoolId, "parent", opt(f, "title"), str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), bcrypt.hashSync(pw, 10));
    }
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "parent", id);
    revalidatePath("/parents");
  });
}

export async function linkChild(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const parentId = num(f, "parent_id");
    const learner = (await get<{ id: number }>("SELECT id FROM learners WHERE school_id = ? AND admission_number = ?", ctx.schoolId, str(f, "admission_number"))) ?? fail("No learner with that admission number.");
    if (!(await get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'parent'", parentId, ctx.schoolId))) fail("Parent not found.");
    await run("INSERT INTO guardian_links (parent_user_id, learner_id, relationship) VALUES (?,?,?) ON CONFLICT (parent_user_id, learner_id) DO UPDATE SET relationship = excluded.relationship", parentId, learner.id, str(f, "relationship") || "Parent");
    await audit(ctx.schoolId, ctx.user.id, "link", "guardian", learner.id, `parent ${parentId}`);
    revalidatePath("/parents");
  });
}

export async function unlinkChild(parentId: number, learnerId: number) {
  return guarded(ADMIN, async (ctx) => {
    await run("DELETE FROM guardian_links WHERE parent_user_id = ? AND learner_id = ? AND learner_id IN (SELECT id FROM learners WHERE school_id = ?)", parentId, learnerId, ctx.schoolId);
    revalidatePath("/parents");
  });
}

export async function deleteUser(id: number) {
  return guarded(ADMIN, async (ctx) => {
    const u = (await get<{ role: string }>("SELECT role FROM users WHERE id = ? AND school_id = ?", id, ctx.schoolId)) ?? fail("User not found.");
    if (u.role === "school_admin" && id === ctx.user.id) fail("You cannot delete your own account.");
    await run("DELETE FROM users WHERE id = ?", id);
    await removeUserFiles(id);
    await audit(ctx.schoolId, ctx.user.id, "delete", "user", id);
    revalidatePath("/parents");
  });
}

/** Admin sets a new password for any user in their school. */
export async function resetPassword(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "user_id"), pw = str(f, "password");
    if (!strongEnough(pw)) fail("Password needs 8+ characters, a capital letter and a number.");
    const scope = await get("SELECT id FROM users WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    if (!scope) fail("User not found.");
    await run("UPDATE users SET password_hash = ? WHERE id = ?", bcrypt.hashSync(pw, 10), id);
    await audit(ctx.schoolId, ctx.user.id, "reset_password", "user", id);
  });
}

// ---------------- Profile photo ----------------
async function removeAvatarFile(userId: number | null | undefined) {
  if (userId) await removeFile(storageKey.avatar(userId));
}
/** A deleted account's photo and banner. */
async function removeUserFiles(userId: number | null | undefined) {
  if (userId) await Promise.all([removeFile(storageKey.avatar(userId)), removeFile(storageKey.banner(userId))]);
}

/** Any signed-in user may set their own profile photo (resized in the browser first). */
export async function uploadAvatar(f: FormData): Promise<ActionResult> {
  return guarded(EVERYONE, async (ctx) => {
    const file = f.get("photo");
    if (!(file instanceof File) || file.size === 0) fail("Choose a photo to upload.");
    if (file.size > MAX_AVATAR_BYTES) fail("That photo is too large. Please use an image under 2 MB.");
    const buf = new Uint8Array(await file.arrayBuffer());
    const type = imageType(buf) ?? fail("Only JPG, PNG or WebP photos are allowed.");
    await putFile(storageKey.avatar(ctx.user.id), buf, type);
    await run("UPDATE users SET avatar_updated_at = datetime('now') WHERE id = ?", ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, "upload_photo", "user", ctx.user.id);
    revalidatePath("/", "layout");
  });
}

export async function removeAvatar(): Promise<ActionResult> {
  return guarded(EVERYONE, async (ctx) => {
    await removeAvatarFile(ctx.user.id);
    await run("UPDATE users SET avatar_updated_at = NULL WHERE id = ?", ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, "remove_photo", "user", ctx.user.id);
    revalidatePath("/", "layout");
  });
}

/** Any signed-in user may set a banner picture for their profile and dashboard (resized in the browser first). */
export async function uploadBanner(f: FormData): Promise<ActionResult> {
  return guarded(EVERYONE, async (ctx) => {
    const file = f.get("banner");
    if (!(file instanceof File) || file.size === 0) fail("Choose a picture to upload.");
    if (file.size > MAX_BANNER_BYTES) fail("That picture is too large. Please use an image under 3 MB.");
    const buf = new Uint8Array(await file.arrayBuffer());
    const type = imageType(buf) ?? fail("Only JPG, PNG or WebP pictures are allowed.");
    await putFile(storageKey.banner(ctx.user.id), buf, type);
    await run("UPDATE users SET banner_updated_at = datetime('now') WHERE id = ?", ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, "upload_banner", "user", ctx.user.id);
    revalidatePath("/", "layout");
  });
}

export async function removeBanner(): Promise<ActionResult> {
  return guarded(EVERYONE, async (ctx) => {
    await removeFile(storageKey.banner(ctx.user.id));
    await run("UPDATE users SET banner_updated_at = NULL WHERE id = ?", ctx.user.id);
    await audit(ctx.schoolId, ctx.user.id, "remove_banner", "user", ctx.user.id);
    revalidatePath("/", "layout");
  });
}

// ---------------- Profile ----------------
export async function updateProfile(_: ActionResult, f: FormData) {
  return guarded(EVERYONE, async (ctx) => {
    await run("UPDATE users SET title=?, phone=? WHERE id = ?", opt(f, "title"), opt(f, "phone"), ctx.user.id);
    revalidatePath("/profile");
  });
}
