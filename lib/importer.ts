// CSV import of teachers, classes & subjects, and learners with their parents (templates in templates/import).
// analyse() checks every row against the database without writing anything; the returned ops run in one
// transaction when the admin confirms. Rows are matched on email / class name / admission number, so
// importing the same file again updates records instead of duplicating them.
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { audit, get, run, tx } from "./db";
import { parseSaId } from "./format";
import type { Ctx } from "./auth";

export type ImportKind = "teachers" | "classes" | "learners";
export const IMPORT_TEMPLATES: Record<ImportKind, string> = {
  teachers: "1-teachers.csv", classes: "2-classes-and-subjects.csv", learners: "3-learners-and-parents.csv",
};
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type PreviewRow = { line: number; label: string; action: "new" | "update"; notes: string[]; errors: string[] };
export type ImportPreview = { kind: ImportKind; rows: PreviewRow[]; fileErrors: string[]; counts: { new: number; update: number; errors: number } };
export type Credential = { role: string; name: string; email: string; password: string };

const COLUMNS: Record<ImportKind, { required: string[]; optional: string[] }> = {
  teachers: {
    required: ["first_name", "last_name", "email"],
    optional: ["title", "cell", "id_number", "gender", "staff_number", "persal_number", "sace_number", "post_level", "employed_since", "address"],
  },
  classes: {
    required: ["class", "grade"],
    optional: ["room", "register_teacher_email", "subject", "subject_code", "caps_category", "teacher_email"],
  },
  learners: {
    required: ["admission_number", "first_name", "last_name"],
    optional: ["id_number", "gender", "date_of_birth", "class", "home_language", "address", "enrolled_on", "learner_login_email",
      "parent_title", "parent_first_name", "parent_last_name", "parent_email", "parent_cell", "relationship",
      "parent2_title", "parent2_first_name", "parent2_last_name", "parent2_email", "parent2_cell", "parent2_relationship"],
  },
};

const TITLES = ["Mr", "Ms", "Mrs", "Dr", "Prof"];
const GENDERS = ["Female", "Male", "Other"];
const POST_LEVELS = ["PL1", "PL2 (HOD)", "PL3 (Deputy)", "PL4 (Principal)"];
const CATEGORIES = ["HL", "FAL", "SAL", "MATH", "MLIT", "LO", "OTHER"];
const LANGS = ["English", "Afrikaans", "isiZulu", "isiXhosa", "Sepedi", "Setswana", "Sesotho", "Xitsonga", "siSwati", "Tshivenda", "isiNdebele"];
const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Foster parent", "Parent"];

const tempPassword = () => "Sk-" + randomBytes(8).toString("base64url") + "9A";
// Temporary passwords are random (64 bits), so a lower bcrypt cost is safe and keeps a 2,000-account
// import to seconds rather than minutes while the transaction holds the database.
const hash = (pw: string) => bcrypt.hashSync(pw, 8);
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** CSV text to rows of cells. Handles a BOM, quoted cells (commas, quotes, line breaks), CRLF, and ";" files from Excel. */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

type Row = { line: number; v: (col: string) => string };
type Analysis = { preview: ImportPreview; apply: () => Promise<{ message: string; credentials: Credential[] }> };

/** Checks a CSV file; nothing is written until apply() is called. */
export async function analyse(ctx: Ctx, kind: ImportKind, text: string): Promise<Analysis> {
  const fileErrors: string[] = [];
  const all = parseCsv(text);
  const header = (all[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const spec = COLUMNS[kind];
  const missing = spec.required.filter((c) => !header.includes(c));
  const unknown = header.filter((h) => h && !spec.required.includes(h) && !spec.optional.includes(h));
  if (!all.length) fileErrors.push("The file is empty.");
  else {
    if (missing.length) fileErrors.push(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Is this the ${IMPORT_TEMPLATES[kind]} template?`);
    if (unknown.length) fileErrors.push(`Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Keep the template's header row as it is.`);
  }
  const rows: Row[] = [];
  all.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => c.trim())) return; // blank line
    rows.push({ line: i + 2, v: (col) => { const k = header.indexOf(col); return k < 0 ? "" : (cells[k] ?? "").trim(); } });
  });
  if (!fileErrors.length && !rows.length) fileErrors.push("The file has a header row but no records.");

  const result = fileErrors.length ? { preview: [] as PreviewRow[], ops: [] as (() => void)[], creds: [] as Credential[] }
    : kind === "teachers" ? (await teachers(ctx, rows)) : kind === "classes" ? (await classes(ctx, rows)) : (await learners(ctx, rows));
  const counts = {
    new: result.preview.filter((r) => !r.errors.length && r.action === "new").length,
    update: result.preview.filter((r) => !r.errors.length && r.action === "update").length,
    errors: result.preview.filter((r) => r.errors.length).length,
  };
  return {
    preview: { kind, rows: result.preview, fileErrors, counts },
    apply: async () => {
      if (fileErrors.length || counts.errors) throw new Error("!Fix the errors in the file first, then upload it again.");
      await tx(async () => {
                for (const op of result.ops) op();
                await audit(ctx.schoolId, ctx.user.id, "import", kind, null, `${counts.new} new, ${counts.update} updated`);
              });
      return { message: `Imported ${counts.new} new and updated ${counts.update} existing record${counts.new + counts.update === 1 ? "" : "s"}.`, credentials: result.creds };
    },
  };
}

// ---------- shared checks ----------
function pick(value: string, list: string[], label: string, errors: string[]): string | null {
  if (!value) return null;
  const hit = list.find((x) => x.toLowerCase() === value.toLowerCase());
  if (!hit) errors.push(`${label} "${value}" is not allowed. Use one of: ${list.join(", ")}.`);
  return hit ?? null;
}
function date(value: string, label: string, errors: string[]): string | null {
  if (!value) return null;
  const v = value.replace(/\//g, "-");
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!ok) errors.push(`${label} "${value}" is not a date. Use YYYY-MM-DD, e.g. 2012-05-09.`);
  return ok ? v : null;
}
function saId(value: string, errors: string[]) {
  if (!value) return null;
  if (/^\d+(\.\d+)?e\+\d+$/i.test(value)) { errors.push(`ID number "${value}" was changed by Excel. Format the id_number column as Text and type it again.`); return null; }
  const id = value.replace(/\s/g, "");
  if (/^\d{12}$/.test(id)) { errors.push(`ID number "${value}" has 12 digits. Excel may have dropped a leading 0; format the column as Text.`); return null; }
  const p = parseSaId(id);
  if (!p.valid) { errors.push(`ID number "${value}" is not a valid South African ID number.`); return null; }
  return { id, ...p };
}
function email(value: string, label: string, errors: string[]): string | null {
  if (!value) return null;
  const e = value.toLowerCase();
  if (!isEmail(e)) { errors.push(`${label} "${value}" is not a valid email address.`); return null; }
  return e;
}
/** Grade from the template: "R" (or 0) is Grade R, otherwise 1-12. */
function grade(value: string, errors: string[]): number | null {
  if (/^(r|0|grade\s*r)$/i.test(value)) return 0;
  const g = Number(value.replace(/^grade\s*/i, ""));
  if (Number.isInteger(g) && g >= 1 && g <= 12) return g;
  errors.push(`Grade "${value}" must be R or 1 to 12.`);
  return null;
}
/** "Grade 8 A" / "8a" -> "8A"; same rule as classes typed on the teacher form. */
const className = (n: string) => n.toUpperCase().replace(/^GRADE\s*/, "").replace(/\s+/g, "");
function gradeOfClassName(name: string): number | null {
  if (/^R(?![A-Z]{2})/i.test(name)) return 0;
  const m = name.match(/^(\d{1,2})/);
  const g = m ? Number(m[1]) : NaN;
  return g >= 1 && g <= 12 ? g : null;
}
const userByEmail = (e: string) => get<{ id: number; role: string; school_id: number | null }>("SELECT id, role, school_id FROM users WHERE lower(email) = ?", e);
const activeTeacher = (ctx: Ctx, e: string) => get<{ id: number; name: string }>(
  "SELECT t.id, COALESCE(u.title || ' ', '') || u.last_name name FROM teachers t JOIN users u ON u.id = t.user_id WHERE lower(u.email) = ? AND t.school_id = ? AND t.status = 'Active'", e, ctx.schoolId);

// ---------- teachers ----------
async function teachers(ctx: Ctx, rows: Row[]) {
  const preview: PreviewRow[] = [], ops: (() => void)[] = [], creds: Credential[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const errors: string[] = [], notes: string[] = [];
    const first = r.v("first_name"), last = r.v("last_name");
    if (!first || !last) errors.push("first_name and last_name are required.");
    const mail = email(r.v("email"), "Email", errors);
    if (!r.v("email")) errors.push("email is required: it is the teacher's login.");
    if (mail && seen.has(mail)) errors.push(`Email ${mail} is also on line ${seen.get(mail)}.`);
    if (mail) seen.set(mail, r.line);
    let teacherId: number | null = null;
    const existing = mail ? (await userByEmail(mail)) : undefined;
    if (existing) {
      if (existing.role !== "teacher" || existing.school_id !== ctx.schoolId) errors.push(`Email ${mail} already belongs to another account.`);
      else {
        teacherId = (await get<{ id: number }>("SELECT id FROM teachers WHERE user_id = ?", existing.id))?.id ?? null;
        const was = (await get<{ name: string }>("SELECT first_name || ' ' || last_name name FROM users WHERE id = ?", existing.id))!.name;
        if (first && last && was.toLowerCase() !== `${first} ${last}`.toLowerCase()) notes.push(`⚠ Renames ${was} (same email)`);
      }
    }
    const title = pick(r.v("title"), TITLES, "Title", errors);
    const id = saId(r.v("id_number"), errors);
    const gender = pick(r.v("gender"), GENDERS, "Gender", errors) ?? id?.gender ?? null;
    const post = pick(r.v("post_level"), POST_LEVELS, "Post level", errors);
    const since = date(r.v("employed_since"), "employed_since", errors);
    const f = { phone: r.v("cell") || null, staff: r.v("staff_number") || null, persal: r.v("persal_number") || null, sace: r.v("sace_number") || null, address: r.v("address") || null };
    if (!existing && mail) notes.push("New login (temporary password shown after import)");
    preview.push({ line: r.line, label: `${title ? title + " " : ""}${first} ${last}`.trim(), action: existing ? "update" : "new", notes, errors });
    if (errors.length) continue;
    ops.push(async () => {
      if (existing && teacherId) {
        await run("UPDATE users SET title = COALESCE(?, title), first_name = ?, last_name = ?, phone = COALESCE(?, phone) WHERE id = ?", title, first, last, f.phone, existing.id);
        await run(`UPDATE teachers SET id_number = COALESCE(?, id_number), gender = COALESCE(?, gender), staff_number = COALESCE(?, staff_number), persal_number = COALESCE(?, persal_number),
          sace_number = COALESCE(?, sace_number), post_level = COALESCE(?, post_level), employed_since = COALESCE(?, employed_since), address = COALESCE(?, address) WHERE id = ?`,
                    id?.id ?? null, gender, f.staff, f.persal, f.sace, post, since, f.address, teacherId);
      } else {
        const password = tempPassword();
        const u = await run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)",
                  ctx.schoolId, "teacher", title, first, last, mail, f.phone, hash(password));
        await run(`INSERT INTO teachers (school_id, user_id, staff_number, persal_number, sace_number, id_number, gender, post_level, address, employed_since)
          VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?, date('now')))`, ctx.schoolId, u.id, f.staff, f.persal, f.sace, id?.id ?? null, gender, post ?? "PL1", f.address, since);
        creds.push({ role: "Teacher", name: `${first} ${last}`, email: mail!, password });
      }
    });
  }
  return { preview, ops, creds };
}

// ---------- classes & subjects ----------
async function classes(ctx: Ctx, rows: Row[]) {
  const preview: PreviewRow[] = [], ops: (() => void)[] = [];
  const year = ctx.school.current_year;
  const classSeen = new Map<string, { line: number; grade: number | null; room: string; reg: string }>();
  const subjectSeen = new Map<string, { line: number; category: string | null }>();
  const pairSeen = new Map<string, number>();
  const newSubjects = new Set<string>();
  for (const r of rows) {
    const errors: string[] = [], notes: string[] = [];
    const name = className(r.v("class"));
    if (!name) errors.push("class is required, e.g. 8A.");
    const g = r.v("grade") ? grade(r.v("grade"), errors) : (errors.push("grade is required: R or 1 to 12."), null);
    if (name && g != null) {
      const fromName = gradeOfClassName(name);
      if (fromName == null) errors.push(`Class "${name}" must start with its grade, e.g. 8A or R1.`);
      else if (fromName !== g) errors.push(`Class ${name} looks like Grade ${fromName === 0 ? "R" : fromName}, but grade says ${g === 0 ? "R" : g}.`);
    }
    const room = r.v("room");
    const regMail = email(r.v("register_teacher_email"), "register_teacher_email", errors);
    const reg = regMail ? (await activeTeacher(ctx, regMail)) : undefined;
    if (regMail && !reg) errors.push(`No current teacher with email ${regMail}. Import teachers first.`);
    const prev = name ? classSeen.get(name) : undefined;
    if (prev) {
      if (prev.grade !== g || (room && prev.room && prev.room !== room) || (regMail && prev.reg && prev.reg !== regMail))
        errors.push(`Class ${name} has a different grade, room or register teacher on line ${prev.line}.`);
    } else if (name) classSeen.set(name, { line: r.line, grade: g, room, reg: regMail ?? "" });

    const subject = r.v("subject").replace(/\s+/g, " ");
    const category = subject ? (r.v("caps_category") ? pick(r.v("caps_category").toUpperCase(), CATEGORIES, "caps_category", errors) : (errors.push("caps_category is required for a subject (HL, FAL, SAL, MATH, MLIT, LO or OTHER)."), null)) : null;
    const code = r.v("subject_code") || null;
    const tMail = email(r.v("teacher_email"), "teacher_email", errors);
    const teacher = tMail ? (await activeTeacher(ctx, tMail)) : undefined;
    if (tMail && !teacher) errors.push(`No current teacher with email ${tMail}. Import teachers first.`);
    if (tMail && !subject) errors.push("teacher_email needs a subject on the same row.");
    if (subject) {
      const sPrev = subjectSeen.get(subject.toLowerCase());
      if (sPrev && category && sPrev.category && sPrev.category !== category) errors.push(`${subject} has a different caps_category on line ${sPrev.line}.`);
      else if (!sPrev) subjectSeen.set(subject.toLowerCase(), { line: r.line, category });
      const key = `${name}|${subject.toLowerCase()}`;
      if (pairSeen.has(key)) errors.push(`${subject} for ${name} is also on line ${pairSeen.get(key)}.`);
      pairSeen.set(key, r.line);
    }

    const cls = name ? (await get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND name = ? AND year = ?", ctx.schoolId, name, year)) : undefined;
    const subj = subject ? (await get<{ id: number }>("SELECT id FROM subjects WHERE school_id = ? AND lower(name) = lower(?)", ctx.schoolId, subject)) : undefined;
    const pair = cls && subj ? (await get("SELECT id FROM class_subjects WHERE class_id = ? AND subject_id = ?", cls.id, subj.id)) : undefined;
    if (!cls && !prev) notes.push(`New class for ${year}`);
    if (subject && !subj && !newSubjects.has(subject.toLowerCase())) { notes.push("New subject"); newSubjects.add(subject.toLowerCase()); }
    if (teacher) notes.push(`Taught by ${teacher.name}`);
    if (reg && !prev) notes.push(`Register: ${reg.name}`);
    preview.push({ line: r.line, label: subject ? `${name} · ${subject}` : `${name} (class only)`, action: (subject ? pair : cls) ? "update" : "new", notes, errors });
    if (errors.length) continue;
    ops.push(async () => {
      let classId = (await get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND name = ? AND year = ?", ctx.schoolId, name, year))?.id;
      if (classId) await run("UPDATE classes SET grade = ?, room = COALESCE(?, room), class_teacher_id = COALESCE(?, class_teacher_id) WHERE id = ?", g, room || null, reg?.id ?? null, classId);
      else classId = (await run("INSERT INTO classes (school_id, grade, name, year, class_teacher_id, room) VALUES (?,?,?,?,?,?)", ctx.schoolId, g, name, year, reg?.id ?? null, room || null)).id;
      if (!subject) return;
      let subjectId = (await get<{ id: number }>("SELECT id FROM subjects WHERE school_id = ? AND lower(name) = lower(?)", ctx.schoolId, subject))?.id;
      if (subjectId) await run("UPDATE subjects SET category = ?, code = COALESCE(?, code) WHERE id = ?", category, code, subjectId);
      else subjectId = (await run("INSERT INTO subjects (school_id, name, code, category) VALUES (?,?,?,?)", ctx.schoolId, subject, code, category)).id;
      await run("INSERT INTO class_subjects (school_id, class_id, subject_id) VALUES (?,?,?) ON CONFLICT (class_id, subject_id) DO NOTHING", ctx.schoolId, classId, subjectId);
      if (teacher) await run("UPDATE class_subjects SET teacher_id = ? WHERE class_id = ? AND subject_id = ?", teacher.id, classId, subjectId);
    });
  }
  return { preview, ops, creds: [] as Credential[] };
}

// ---------- learners & parents ----------
async function learners(ctx: Ctx, rows: Row[]) {
  const preview: PreviewRow[] = [], ops: (() => void)[] = [], creds: Credential[] = [];
  const year = ctx.school.current_year;
  const admSeen = new Map<string, number>(), loginSeen = new Map<string, number>();
  const parentSeen = new Map<string, number>(); // parent email -> line where its account is created
  const parentIds = new Map<string, number>(); // filled while applying
  for (const r of rows) {
    const errors: string[] = [], notes: string[] = [];
    const adm = r.v("admission_number"), first = r.v("first_name"), last = r.v("last_name");
    if (!adm) errors.push("admission_number is required.");
    if (!first || !last) errors.push("first_name and last_name are required.");
    if (adm && admSeen.has(adm)) errors.push(`Admission number ${adm} is also on line ${admSeen.get(adm)}.`);
    if (adm) admSeen.set(adm, r.line);
    const existing = adm ? (await get<{ id: number; user_id: number | null; first_name: string; last_name: string }>("SELECT id, user_id, first_name, last_name FROM learners WHERE school_id = ? AND admission_number = ?", ctx.schoolId, adm)) : undefined;
    // Matching is on admission number, so make a changed name stand out: it may be the wrong number.
    if (existing && first && last && `${existing.first_name} ${existing.last_name}`.toLowerCase() !== `${first} ${last}`.toLowerCase())
      notes.push(`⚠ Renames existing learner ${existing.first_name} ${existing.last_name} (${adm}). Check the admission number`);

    const id = saId(r.v("id_number"), errors);
    const gender = pick(r.v("gender"), GENDERS, "Gender", errors) ?? id?.gender ?? null;
    const dob = date(r.v("date_of_birth"), "date_of_birth", errors) ?? id?.dob ?? null;
    const enrolled = date(r.v("enrolled_on"), "enrolled_on", errors);
    const lang = pick(r.v("home_language"), LANGS, "Home language", errors);
    const cName = className(r.v("class"));
    const cls = cName ? (await get<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND name = ? AND year = ?", ctx.schoolId, cName, year)) : undefined;
    if (cName && !cls) errors.push(`Class ${cName} does not exist for ${year}. Import classes first.`);
    const address = r.v("address") || null;

    const login = email(r.v("learner_login_email"), "learner_login_email", errors);
    let makeLogin = false;
    if (login) {
      const u = await userByEmail(login);
      if (loginSeen.has(login)) errors.push(`Login email ${login} is also on line ${loginSeen.get(login)}.`);
      else if (parentSeen.has(login)) errors.push(`Login email ${login} is used for a parent on line ${parentSeen.get(login)}.`);
      loginSeen.set(login, r.line);
      if (u && !(existing && u.id === existing.user_id)) errors.push(`Email ${login} already belongs to another account.`);
      else if (!u && existing?.user_id) notes.push("Already has a login, so learner_login_email is ignored");
      else if (!u) { makeLogin = true; notes.push("New learner login"); }
    }

    const parents: { email: string; title: string | null; first: string; last: string; phone: string | null; relationship: string; isNew: boolean; existingId: number | null }[] = [];
    for (const p of ["parent", "parent2"] as const) {
      const label = p === "parent" ? "Parent" : "Parent 2";
      const raw = r.v(`${p}_email`), pFirst = r.v(`${p}_first_name`), pLast = r.v(`${p}_last_name`);
      if (!raw) { if (pFirst || pLast) errors.push(`${label} needs an email (${p}_email) to be linked.`); continue; }
      const pMail = email(raw, `${p}_email`, errors);
      if (!pMail) continue;
      if (parents.some((x) => x.email === pMail)) { errors.push(`${label} has the same email as the first parent.`); continue; }
      if (loginSeen.has(pMail)) { errors.push(`${pMail} is used as a learner login on line ${loginSeen.get(pMail)}.`); continue; }
      const u = await userByEmail(pMail);
      if (u && (u.role !== "parent" || u.school_id !== ctx.schoolId)) { errors.push(`${label} email ${pMail} already belongs to another account.`); continue; }
      const isNew = !u && !parentSeen.has(pMail);
      if (isNew && (!pFirst || !pLast)) { errors.push(`${label} ${pMail} is new: ${p}_first_name and ${p}_last_name are required.`); continue; }
      const relationship = pick(r.v(p === "parent" ? "relationship" : "parent2_relationship"), RELATIONSHIPS, `${label} relationship`, errors) ?? "Parent";
      parents.push({ email: pMail, title: pick(r.v(`${p}_title`), TITLES, `${label} title`, errors), first: pFirst, last: pLast, phone: r.v(`${p}_cell`) || null, relationship, isNew, existingId: u?.id ?? null });
      notes.push(`${relationship}: ${pMail}${isNew ? " (new account)" : ""}`);
    }
    if (!errors.length) for (const p of parents) if (p.isNew) parentSeen.set(p.email, r.line);

    preview.push({ line: r.line, label: `${first} ${last} · ${adm}${cName ? ` · ${cName}` : ""}`, action: existing ? "update" : "new", notes, errors });
    if (errors.length) continue;
    ops.push(async () => {
      let learnerId = existing?.id;
      if (learnerId) {
        await run(`UPDATE learners SET first_name = ?, last_name = ?, id_number = COALESCE(?, id_number), gender = COALESCE(?, gender), date_of_birth = COALESCE(?, date_of_birth),
          class_id = COALESCE(?, class_id), home_language = COALESCE(?, home_language), address = COALESCE(?, address), enrolled_on = COALESCE(?, enrolled_on) WHERE id = ?`,
                    first, last, id?.id ?? null, gender, dob, cls?.id ?? null, lang, address, enrolled, learnerId);
        await run("UPDATE users SET first_name = ?, last_name = ? WHERE id = (SELECT user_id FROM learners WHERE id = ?)", first, last, learnerId);
      } else {
        learnerId = (await run(`INSERT INTO learners (school_id, admission_number, first_name, last_name, id_number, gender, date_of_birth, class_id, home_language, address, status, enrolled_on)
          VALUES (?,?,?,?,?,?,?,?,?,?,'Active',COALESCE(?, date('now')))`, ctx.schoolId, adm, first, last, id?.id ?? null, gender, dob, cls?.id ?? null, lang, address, enrolled)).id;
      }
      if (makeLogin && login) {
        const password = tempPassword();
        const u = await run("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash) VALUES (?,?,?,?,?,?)", ctx.schoolId, "learner", first, last, login, hash(password));
        await run("UPDATE learners SET user_id = ? WHERE id = ?", u.id, learnerId);
        creds.push({ role: "Learner", name: `${first} ${last}`, email: login, password });
      }
      for (const p of parents) {
        let parentId = parentIds.get(p.email) ?? p.existingId ?? (await userByEmail(p.email))?.id;
        if (parentId) {
          await run("UPDATE users SET title = COALESCE(?, title), first_name = COALESCE(NULLIF(?, ''), first_name), last_name = COALESCE(NULLIF(?, ''), last_name), phone = COALESCE(?, phone) WHERE id = ?",
                        p.title, p.first, p.last, p.phone, parentId);
        } else {
          const password = tempPassword();
          parentId = (await run("INSERT INTO users (school_id, role, title, first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?,?,?,?)",
                      ctx.schoolId, "parent", p.title, p.first, p.last, p.email, p.phone, hash(password))).id;
          creds.push({ role: "Parent", name: `${p.first} ${p.last}`, email: p.email, password });
        }
        parentIds.set(p.email, parentId);
        await run("INSERT INTO guardian_links (parent_user_id, learner_id, relationship) VALUES (?,?,?) ON CONFLICT(parent_user_id, learner_id) DO UPDATE SET relationship = excluded.relationship",
                    parentId, learnerId!, p.relationship);
      }
    });
  }
  return { preview, ops, creds };
}
