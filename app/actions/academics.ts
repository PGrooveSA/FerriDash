"use server";
import bcrypt from "bcryptjs";
import { MAX_LOGO_BYTES, imageType } from "@/lib/uploads";
import { putFile, removeFile, storageKey } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { audit, get, run, tx } from "@/lib/db";
import { ADMIN, PLATFORM, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";

// ---------------- Classes ----------------
export async function saveClass(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id"), grade = num(f, "grade");
    if (grade == null || grade < 0 || grade > 12) fail("Choose a grade from R to 12.");
    const vals = [grade, str(f, "name"), num(f, "class_teacher_id"), opt(f, "room")];
    if (id) {
      if (!(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", id, ctx.schoolId))) fail("Class not found.");
      await run("UPDATE classes SET grade=?, name=?, class_teacher_id=?, room=? WHERE id = ?", ...vals, id);
    } else {
      await run("INSERT INTO classes (grade, name, class_teacher_id, room, school_id, year) VALUES (?,?,?,?,?,?)", ...vals, ctx.schoolId, ctx.school.current_year);
    }
    await audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "class", id);
    revalidatePath("/academics");
  });
}

export async function deleteClass(id: number) {
  return guarded(ADMIN, async (ctx) => {
    const n = (await get<{ n: number }>("SELECT COUNT(*) n FROM learners WHERE class_id = ?", id))!.n;
    if (n) fail(`Move the ${n} learner(s) out of this class first.`);
    await run("DELETE FROM classes WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    revalidatePath("/academics");
  });
}

// ---------------- Subjects ----------------
export async function saveSubject(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const id = num(f, "id");
    const vals = [str(f, "name"), opt(f, "code"), str(f, "category") || "OTHER"];
    if (id) await run("UPDATE subjects SET name=?, code=?, category=? WHERE id = ? AND school_id = ?", ...vals, id, ctx.schoolId);
    else await run("INSERT INTO subjects (name, code, category, school_id) VALUES (?,?,?,?)", ...vals, ctx.schoolId);
    revalidatePath("/academics");
  });
}

export async function deleteSubject(id: number) {
  return guarded(ADMIN, async (ctx) => {
    if (await get("SELECT id FROM class_subjects WHERE subject_id = ? LIMIT 1", id)) fail("Remove this subject from all classes first.");
    await run("DELETE FROM subjects WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    revalidatePath("/academics");
  });
}

// ---------------- Allocation ----------------
export async function addClassSubject(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    const classId = num(f, "class_id"), subjectId = num(f, "subject_id");
    if (!(await get("SELECT id FROM classes WHERE id = ? AND school_id = ?", classId, ctx.schoolId)) || !(await get("SELECT id FROM subjects WHERE id = ? AND school_id = ?", subjectId, ctx.schoolId))) fail("Invalid class or subject.");
    await run("INSERT INTO class_subjects (school_id, class_id, subject_id, teacher_id) VALUES (?,?,?,?)", ctx.schoolId, classId, subjectId, num(f, "teacher_id"));
    revalidatePath("/academics");
  });
}

export async function assignTeacher(csId: number, f: FormData) {
  await guarded(ADMIN, async (ctx) => {
    await run("UPDATE class_subjects SET teacher_id = ? WHERE id = ? AND school_id = ?", num(f, "teacher_id"), csId, ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "allocate", "class_subject", csId);
    revalidatePath("/academics");
  });
}

export async function removeClassSubject(csId: number) {
  return guarded(ADMIN, async (ctx) => {
    if (await get("SELECT m.id FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.class_subject_id = ? LIMIT 1", csId)) fail("Marks have been captured for this subject - it cannot be removed.");
    await run("DELETE FROM class_subjects WHERE id = ? AND school_id = ?", csId, ctx.schoolId);
    revalidatePath("/academics");
  });
}

// ---------------- School settings ----------------
export async function saveSchoolSettings(_: ActionResult, f: FormData) {
  return guarded(ADMIN, async (ctx) => {
    await run(`UPDATE schools SET name=?, emis_number=?, province=?, district=?, quintile=?, school_type=?, fee_paying=?, address=?, phone=?, email=?, principal=?, motto=?, current_year=?, current_term=? WHERE id = ?`,
            str(f, "name"), opt(f, "emis_number"), str(f, "province"), opt(f, "district"), num(f, "quintile"), str(f, "school_type"), str(f, "fee_paying") === "1" ? 1 : 0,
            opt(f, "address"), opt(f, "phone"), opt(f, "email"), opt(f, "principal"), opt(f, "motto"), num(f, "current_year"), num(f, "current_term"), ctx.schoolId);
    for (const t of [1, 2, 3, 4]) {
      const a = str(f, `t${t}_start`), b = str(f, `t${t}_end`);
      if (a && b) await run("INSERT INTO terms (school_id, year, number, start_date, end_date) VALUES (?,?,?,?,?) ON CONFLICT(school_id, year, number) DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date", ctx.schoolId, num(f, "current_year"), t, a, b);
    }
    await audit(ctx.schoolId, ctx.user.id, "update", "school", ctx.schoolId);
    revalidatePath("/", "layout");
  });
}

// ---------------- School logo (admins only) ----------------
export async function uploadLogo(f: FormData): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    const file = f.get("logo");
    if (!(file instanceof File) || file.size === 0) fail("Choose a logo to upload.");
    if (file.size > MAX_LOGO_BYTES) fail("That logo is too large. Please use an image under 2 MB.");
    const buf = new Uint8Array(await file.arrayBuffer());
    const type = imageType(buf) ?? fail("Only PNG, JPG or WebP logos are allowed.");
    await putFile(storageKey.logo(ctx.schoolId), buf, type);
    await run("UPDATE schools SET logo_updated_at = datetime('now') WHERE id = ?", ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "upload_logo", "school", ctx.schoolId);
    revalidatePath("/", "layout");
  });
}

export async function removeLogo(): Promise<ActionResult> {
  return guarded(ADMIN, async (ctx) => {
    await removeFile(storageKey.logo(ctx.schoolId));
    await run("UPDATE schools SET logo_updated_at = NULL WHERE id = ?", ctx.schoolId);
    await audit(ctx.schoolId, ctx.user.id, "remove_logo", "school", ctx.schoolId);
    revalidatePath("/", "layout");
  });
}

// ---------------- Schools (platform admin) ----------------
export async function saveSchool(_: ActionResult, f: FormData) {
  return guarded(PLATFORM, async (ctx) => {
    const id = num(f, "id");
    if (!str(f, "name")) fail("Enter the school's name.");
    const vals = [str(f, "name"), opt(f, "emis_number"), str(f, "province"), opt(f, "district"), num(f, "quintile"), str(f, "school_type") || "Combined", str(f, "fee_paying") === "1" ? 1 : 0, opt(f, "address"), opt(f, "phone"), opt(f, "email"), opt(f, "principal")];
    if (id) {
      if (!(await run("UPDATE schools SET name=?, emis_number=?, province=?, district=?, quintile=?, school_type=?, fee_paying=?, address=?, phone=?, email=?, principal=? WHERE id = ?", ...vals, id)).changes) fail("School not found.");
      await audit(id, ctx.user.id, "update", "school", id);
    } else {
      const adminEmail = str(f, "admin_email").toLowerCase(), pw = str(f, "admin_password");
      if (!adminEmail.includes("@")) fail("Enter the school admin's email address.");
      if (!strongEnough(pw)) fail("The initial password needs 8+ characters, a capital letter and a number.");
      if (await get("SELECT id FROM users WHERE lower(email) = ?", adminEmail)) fail("That email already belongs to another account.");
      await tx(async () => {
                const year = new Date().getFullYear();
                const sid = (await run("INSERT INTO schools (name, emis_number, province, district, quintile, school_type, fee_paying, address, phone, email, principal, current_year, current_term) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)", ...vals, year)).id;
                await run("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash) VALUES (?,?,?,?,?,?)", sid, "school_admin", str(f, "admin_first_name") || "School", str(f, "admin_last_name") || "Administrator", adminEmail, bcrypt.hashSync(pw, 10));
                await audit(sid, ctx.user.id, "create", "school", sid);
              });
    }
    revalidatePath("/dashboard");
  });
}

/** Suspend (or reactivate) a school: its users can't sign in, and anyone signed in is signed out. */
export async function toggleSchool(id: number) {
  return guarded(PLATFORM, async (ctx) => {
    const s = (await get<{ active: number; name: string }>("SELECT active, name FROM schools WHERE id = ?", id)) ?? fail("School not found.");
    await run("UPDATE schools SET active = ? WHERE id = ?", s.active ? 0 : 1, id);
    await audit(id, ctx.user.id, s.active ? "suspend" : "activate", "school", id, s.name);
    revalidatePath("/dashboard");
  });
}

const strongEnough = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p);

/** Platform admin sets a new password for a school's admin (e.g. when they are locked out). */
export async function resetSchoolAdminPassword(_: ActionResult, f: FormData) {
  return guarded(PLATFORM, async (ctx) => {
    const userId = num(f, "user_id"), pw = str(f, "password");
    const u = (await get<{ school_id: number }>("SELECT school_id FROM users WHERE id = ? AND role = 'school_admin'", userId)) ?? fail("Choose one of the school's admins.");
    if (!strongEnough(pw)) fail("The password needs 8+ characters, a capital letter and a number.");
    await run("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?", bcrypt.hashSync(pw, 10), userId);
    await audit(u.school_id, ctx.user.id, "reset_password", "user", userId, "by platform admin");
    return { ok: true, message: "Password updated. Share it with the school admin privately." };
  });
}

/** Platform admin adds another school admin to a school (e.g. a new principal or office manager). */
export async function addSchoolAdmin(_: ActionResult, f: FormData) {
  return guarded(PLATFORM, async (ctx) => {
    const schoolId = num(f, "school_id"), email = str(f, "email").toLowerCase(), pw = str(f, "password");
    if (!(await get("SELECT id FROM schools WHERE id = ?", schoolId))) fail("School not found.");
    if (!str(f, "first_name") || !str(f, "last_name")) fail("Enter the admin's name.");
    if (!email.includes("@")) fail("Enter a valid email address.");
    if (await get("SELECT id FROM users WHERE lower(email) = ?", email)) fail("That email already belongs to another account.");
    if (!strongEnough(pw)) fail("The password needs 8+ characters, a capital letter and a number.");
    const id = (await run("INSERT INTO users (school_id, role, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?)",
          schoolId, "school_admin", str(f, "first_name"), str(f, "last_name"), email, opt(f, "phone"), bcrypt.hashSync(pw, 10))).id;
    await audit(schoolId, ctx.user.id, "create", "school_admin", id, email);
    revalidatePath("/dashboard");
    return { ok: true, message: "School admin added." };
  });
}
