"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { audit, get, run, tx } from "@/lib/db";
import { ADMIN, fail, guarded, num, opt, str, type ActionResult } from "@/lib/action-utils";

// ---------------- Classes ----------------
export async function saveClass(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "id"), grade = num(f, "grade");
    if (grade == null || grade < 0 || grade > 12) fail("Choose a grade from R to 12.");
    const vals = [grade, str(f, "name"), num(f, "class_teacher_id"), opt(f, "room")];
    if (id) {
      if (!get("SELECT id FROM classes WHERE id = ? AND school_id = ?", id, ctx.schoolId)) fail("Class not found.");
      run("UPDATE classes SET grade=?, name=?, class_teacher_id=?, room=? WHERE id = ?", ...vals, id);
    } else {
      run("INSERT INTO classes (grade, name, class_teacher_id, room, school_id, year) VALUES (?,?,?,?,?,?)", ...vals, ctx.schoolId, ctx.school.current_year);
    }
    audit(ctx.schoolId, ctx.user.id, id ? "update" : "create", "class", id);
    revalidatePath("/academics");
  });
}

export async function deleteClass(id: number) {
  return guarded(ADMIN, (ctx) => {
    const n = get<{ n: number }>("SELECT COUNT(*) n FROM learners WHERE class_id = ?", id)!.n;
    if (n) fail(`Move the ${n} learner(s) out of this class first.`);
    run("DELETE FROM classes WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    revalidatePath("/academics");
  });
}

// ---------------- Subjects ----------------
export async function saveSubject(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const id = num(f, "id");
    const vals = [str(f, "name"), opt(f, "code"), str(f, "category") || "OTHER"];
    if (id) run("UPDATE subjects SET name=?, code=?, category=? WHERE id = ? AND school_id = ?", ...vals, id, ctx.schoolId);
    else run("INSERT INTO subjects (name, code, category, school_id) VALUES (?,?,?,?)", ...vals, ctx.schoolId);
    revalidatePath("/academics");
  });
}

export async function deleteSubject(id: number) {
  return guarded(ADMIN, (ctx) => {
    if (get("SELECT id FROM class_subjects WHERE subject_id = ? LIMIT 1", id)) fail("Remove this subject from all classes first.");
    run("DELETE FROM subjects WHERE id = ? AND school_id = ?", id, ctx.schoolId);
    revalidatePath("/academics");
  });
}

// ---------------- Allocation ----------------
export async function addClassSubject(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    const classId = num(f, "class_id"), subjectId = num(f, "subject_id");
    if (!get("SELECT id FROM classes WHERE id = ? AND school_id = ?", classId, ctx.schoolId) || !get("SELECT id FROM subjects WHERE id = ? AND school_id = ?", subjectId, ctx.schoolId)) fail("Invalid class or subject.");
    run("INSERT INTO class_subjects (school_id, class_id, subject_id, teacher_id) VALUES (?,?,?,?)", ctx.schoolId, classId, subjectId, num(f, "teacher_id"));
    revalidatePath("/academics");
  });
}

export async function assignTeacher(csId: number, f: FormData) {
  await guarded(ADMIN, (ctx) => {
    run("UPDATE class_subjects SET teacher_id = ? WHERE id = ? AND school_id = ?", num(f, "teacher_id"), csId, ctx.schoolId);
    audit(ctx.schoolId, ctx.user.id, "allocate", "class_subject", csId);
    revalidatePath("/academics");
  });
}

export async function removeClassSubject(csId: number) {
  return guarded(ADMIN, (ctx) => {
    if (get("SELECT m.id FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.class_subject_id = ? LIMIT 1", csId)) fail("Marks have been captured for this subject - it cannot be removed.");
    run("DELETE FROM class_subjects WHERE id = ? AND school_id = ?", csId, ctx.schoolId);
    revalidatePath("/academics");
  });
}

// ---------------- School settings ----------------
export async function saveSchoolSettings(_: ActionResult, f: FormData) {
  return guarded(ADMIN, (ctx) => {
    run(`UPDATE schools SET name=?, emis_number=?, province=?, district=?, quintile=?, school_type=?, fee_paying=?, address=?, phone=?, email=?, principal=?, motto=?, current_year=?, current_term=? WHERE id = ?`,
      str(f, "name"), opt(f, "emis_number"), str(f, "province"), opt(f, "district"), num(f, "quintile"), str(f, "school_type"), str(f, "fee_paying") === "1" ? 1 : 0,
      opt(f, "address"), opt(f, "phone"), opt(f, "email"), opt(f, "principal"), opt(f, "motto"), num(f, "current_year"), num(f, "current_term"), ctx.schoolId);
    for (const t of [1, 2, 3, 4]) {
      const a = str(f, `t${t}_start`), b = str(f, `t${t}_end`);
      if (a && b) run("INSERT INTO terms (school_id, year, number, start_date, end_date) VALUES (?,?,?,?,?) ON CONFLICT(school_id, year, number) DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date", ctx.schoolId, num(f, "current_year"), t, a, b);
    }
    audit(ctx.schoolId, ctx.user.id, "update", "school", ctx.schoolId);
    revalidatePath("/", "layout");
  });
}

// ---------------- Schools (platform admin) ----------------
export async function saveSchool(_: ActionResult, f: FormData) {
  return guarded(["super_admin"], (ctx) => {
    const id = num(f, "id");
    const vals = [str(f, "name"), opt(f, "emis_number"), str(f, "province"), opt(f, "district"), num(f, "quintile"), str(f, "school_type") || "Combined", str(f, "fee_paying") === "1" ? 1 : 0, opt(f, "address"), opt(f, "phone"), opt(f, "email"), opt(f, "principal")];
    if (id) {
      run("UPDATE schools SET name=?, emis_number=?, province=?, district=?, quintile=?, school_type=?, fee_paying=?, address=?, phone=?, email=?, principal=? WHERE id = ?", ...vals, id);
    } else {
      const adminEmail = str(f, "admin_email").toLowerCase(), pw = str(f, "admin_password");
      if (!adminEmail || pw.length < 8) fail("Provide the school admin's email and an initial password (8+ characters).");
      tx(() => {
        const year = new Date().getFullYear();
        const sid = run("INSERT INTO schools (name, emis_number, province, district, quintile, school_type, fee_paying, address, phone, email, principal, current_year, current_term) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)", ...vals, year).id;
        run("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash) VALUES (?,?,?,?,?,?)", sid, "school_admin", str(f, "admin_first_name") || "School", str(f, "admin_last_name") || "Administrator", adminEmail, bcrypt.hashSync(pw, 10));
        audit(sid, ctx.user.id, "create", "school", sid);
      });
    }
    revalidatePath("/schools");
  });
}

export async function toggleSchool(id: number) {
  return guarded(["super_admin"], (ctx) => {
    run("UPDATE schools SET active = 1 - active WHERE id = ?", id);
    audit(id, ctx.user.id, "toggle_active", "school", id);
    revalidatePath("/schools");
  });
}
