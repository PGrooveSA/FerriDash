// Creates the SQLite database and loads South African demo data.
//   node scripts/seed.mjs            -> seed (fails if data exists)
//   node scripts/seed.mjs --if-empty -> seed only when the database is empty
//   node scripts/seed.mjs --reset    -> delete the database and reseed
//
// Demo logins (all share the password below) are listed in README.md.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const DEMO_PASSWORD = "Demo@2026";
const YEAR = 2026;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DB_PATH || join(root, "data", "school-hub.db");
const args = process.argv.slice(2);

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
if (args.includes("--reset")) {
  // Drop tables instead of deleting the file, so a reset works while the app is running (Windows locks open files).
  db.exec("PRAGMA foreign_keys = OFF;");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  db.exec("PRAGMA foreign_keys = ON;");
}
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));

const existing = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (existing > 0) {
  if (args.includes("--if-empty")) process.exit(0);
  console.error("Database already has data. Use --reset to start over.");
  process.exit(1);
}

// ---------- helpers ----------
let seed = 20260419;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "");

function insert(table, row) {
  const cols = Object.keys(row);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
  return Number(stmt.run(...cols.map((c) => row[c] ?? null)).lastInsertRowid);
}

// South African ID: YYMMDD SSSS C A Z (Luhn check digit)
function luhnDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = Number(twelve[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}
function saId(dob, gender) {
  const ymd = dob.slice(2, 4) + dob.slice(5, 7) + dob.slice(8, 10);
  const seq = gender === "Female" ? randInt(0, 4999) : randInt(5000, 9999);
  const twelve = ymd + String(seq).padStart(4, "0") + "0" + "8";
  return twelve + luhnDigit(twelve);
}

const FEMALE = ["Lerato", "Naledi", "Ayanda", "Zanele", "Palesa", "Karabo", "Nomsa", "Refilwe", "Amahle", "Thandeka", "Busisiwe", "Kamogelo", "Annika", "Aaliyah", "Priya", "Lindiwe", "Nthabiseng", "Boitumelo", "Mbali", "Keabetswe", "Chloé", "Tumelo", "Onalenna", "Rethabile"];
const MALE = ["Thabo", "Sipho", "Kagiso", "Lwazi", "Tshepo", "Mpho", "Bongani", "Themba", "Siyabonga", "Andile", "Neo", "Johan", "Liam", "Yusuf", "Ruan", "Tebogo", "Lethabo", "Katlego", "Sandile", "Musa", "Ethan", "Kabelo", "Vusi", "Ofentse"];
const SURNAMES = ["Mokoena", "Dlamini", "Nkosi", "Khumalo", "Ndlovu", "Molefe", "Mahlangu", "Sithole", "Baloyi", "Mabaso", "Maluleke", "van der Merwe", "Botha", "Naidoo", "Pillay", "Adams", "Petersen", "Jacobs", "Mthembu", "Ngcobo", "Shabalala", "Masilela", "Letsoalo", "Sebola", "Mashaba", "Modise", "Radebe", "Hendricks", "Govender", "Nel"];

const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

// ---------- CAPS subjects per phase ----------
function subjectsForGrade(grade, hl, fal) {
  if (grade <= 3) return [[`${hl} Home Language`, "HL"], [`${fal} First Additional Language`, "FAL"], ["Mathematics", "MATH"], ["Life Skills", "LO"]];
  if (grade <= 6) return [[`${hl} Home Language`, "HL"], [`${fal} First Additional Language`, "FAL"], ["Mathematics", "MATH"], ["Natural Sciences and Technology", "OTHER"], ["Social Sciences", "OTHER"], ["Life Skills", "LO"]];
  if (grade <= 9) return [[`${hl} Home Language`, "HL"], [`${fal} First Additional Language`, "FAL"], ["Mathematics", "MATH"], ["Natural Sciences", "OTHER"], ["Social Sciences", "OTHER"], ["Technology", "OTHER"], ["Economic and Management Sciences", "OTHER"], ["Life Orientation", "LO"], ["Creative Arts", "OTHER"]];
  const science = grade % 2 === 0;
  return [[`${hl} Home Language`, "HL"], [`${fal} First Additional Language`, "FAL"],
    science ? ["Mathematics", "MATH"] : ["Mathematical Literacy", "MLIT"], ["Life Orientation", "LO"],
    ...(science ? [["Physical Sciences", "OTHER"], ["Life Sciences", "OTHER"], ["Geography", "OTHER"]] : [["Accounting", "OTHER"], ["Business Studies", "OTHER"], ["Economics", "OTHER"]])];
}

// Assessment plan per term, per phase: [name, kind, max]
function assessmentPlan(grade, term) {
  if (grade <= 3) return [[`Term ${term} Task 1`, "SBA", 50], [`Term ${term} Task 2`, "SBA", 50]];
  const exam = { 2: "June Examination", 3: grade === 12 ? "Preparatory Examination" : "September Test", 4: "Final Examination" }[term];
  const plan = [[`Test ${term}`, "SBA", 50], [term === 1 ? "Assignment" : term === 3 ? "Project" : "Investigation", "SBA", 100]];
  if (exam && !(grade <= 6 && term === 3)) plan.push([exam, "EXAM", grade >= 10 ? 150 : 100]);
  return plan;
}

const TERMS = [
  [1, "2026-01-14", "2026-03-27"],
  [2, "2026-04-08", "2026-06-26"],
  [3, "2026-07-21", "2026-10-02"],
  [4, "2026-10-13", "2026-12-09"],
];
const TODAY = "2026-10-19";
const ASSESS_DATES = { 1: ["2026-02-20", "2026-03-13", "2026-03-20"], 2: ["2026-04-30", "2026-05-22", "2026-06-10"], 3: ["2026-08-14", "2026-09-04", "2026-09-15"], 4: ["2026-10-16", "2026-10-30", "2026-11-12"] };

const SCHOOLS = [
  { name: "Sunnyside Secondary School", emis_number: "700400123", province: "Gauteng", district: "Tshwane South", quintile: 4, school_type: "Secondary", fee_paying: 1, address: "45 Mears Street, Sunnyside, Pretoria, 0002", phone: "+27 12 341 0001", email: "office@sunnyside.demo", principal: "Mrs N. Mokoena", motto: "Excellence through effort", hl: "English", fal: "isiZulu", grades: [8, 9, 10, 11, 12], perClass: 14, domain: "sunnyside.demo", feeBase: 9800 },
  { name: "Moletjie Primary School", emis_number: "917310456", province: "Limpopo", district: "Capricorn North", quintile: 1, school_type: "Primary", fee_paying: 0, address: "Ga-Moletjie, Polokwane, 0710", phone: "+27 15 291 0002", email: "office@moletjie.demo", principal: "Mr T. Letsoalo", motto: "Thuto ke lesedi", hl: "Sepedi", fal: "English", grades: [0, 3, 5, 7], perClass: 12, domain: "moletjie.demo", feeBase: 0 },
  { name: "Table View Combined School", emis_number: "105220789", province: "Western Cape", district: "Metro North", quintile: 5, school_type: "Combined", fee_paying: 1, address: "12 Blaauwberg Road, Table View, Cape Town, 7441", phone: "+27 21 557 0003", email: "office@tableview.demo", principal: "Dr A. Hendricks", motto: "Rise and shine", hl: "English", fal: "Afrikaans", grades: [6, 9, 11], perClass: 12, domain: "tableview.demo", feeBase: 21500 },
];

db.exec("BEGIN");

insert("users", { school_id: null, role: "super_admin", title: "Mr", first_name: "Platform", last_name: "Administrator", email: "superadmin@ferridash.demo", phone: "+27 11 000 0000", password_hash: hash });

const usedEmails = new Set();
const email = (first, last, domain) => {
  let base = `${slug(first)}.${slug(last)}`, e = `${base}@${domain}`, i = 2;
  while (usedEmails.has(e)) e = `${base}${i++}@${domain}`;
  usedEmails.add(e);
  return e;
};

for (const [si, s] of SCHOOLS.entries()) {
  const schoolId = insert("schools", { name: s.name, emis_number: s.emis_number, province: s.province, district: s.district, quintile: s.quintile, school_type: s.school_type, fee_paying: s.fee_paying, address: s.address, phone: s.phone, email: s.email, principal: s.principal, motto: s.motto, current_year: YEAR, current_term: 4 });
  for (const [n, a, b] of TERMS) insert("terms", { school_id: schoolId, year: YEAR, number: n, start_date: a, end_date: b });

  const adminFirst = si === 0 ? "Linda" : si === 1 ? "Tshepo" : "Aisha";
  const adminLast = si === 0 ? "Mokoena" : si === 1 ? "Letsoalo" : "Hendricks";
  const adminUserId = insert("users", { school_id: schoolId, role: "school_admin", title: si === 1 ? "Mr" : "Mrs", first_name: adminFirst, last_name: adminLast, email: `admin@${s.domain}`, phone: s.phone, password_hash: hash });
  usedEmails.add(`admin@${s.domain}`);

  // Subjects (school-wide catalogue)
  const subjectIds = {};
  for (const g of s.grades) for (const [name, cat] of subjectsForGrade(g, s.hl, s.fal)) {
    if (!subjectIds[name]) subjectIds[name] = insert("subjects", { school_id: schoolId, name, code: name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 4), category: cat });
  }

  // Teachers: enough to cover subjects
  const teacherCount = Math.max(6, Math.ceil(Object.keys(subjectIds).length * 0.8));
  const teachers = [];
  for (let i = 0; i < teacherCount; i++) {
    const gender = rand() < 0.6 ? "Female" : "Male";
    const first = pick(gender === "Female" ? FEMALE : MALE), last = pick(SURNAMES);
    const e = i === 0 ? `teacher@${s.domain}` : email(first, last, s.domain);
    usedEmails.add(e);
    const uid = insert("users", { school_id: schoolId, role: "teacher", title: gender === "Female" ? pick(["Ms", "Mrs"]) : "Mr", first_name: first, last_name: last, email: e, phone: `+27 8${randInt(1, 4)} ${randInt(100, 999)} ${randInt(1000, 9999)}`, password_hash: hash });
    const dob = `${randInt(1970, 1996)}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`;
    const tid = insert("teachers", { school_id: schoolId, user_id: uid, staff_number: `${s.domain.slice(0, 3).toUpperCase()}-${String(101 + i)}`, persal_number: String(randInt(10000000, 99999999)), sace_number: String(randInt(1000000, 9999999)), id_number: saId(dob, gender), gender, address: s.address.split(",").slice(-2).join(",").trim(), post_level: i === 1 ? "PL2 (HOD)" : i === 2 ? "PL3 (Deputy)" : "PL1", employed_since: `${randInt(2005, 2024)}-01-15` });
    teachers.push({ id: tid, userId: uid });
  }

  // Classes, class subjects, learners
  const classes = [];
  for (const [ci, g] of s.grades.entries()) {
    const name = g === 0 ? "Grade R-A" : `${g}A`;
    const ct = teachers[ci % teachers.length];
    const classId = insert("classes", { school_id: schoolId, grade: g, name, year: YEAR, class_teacher_id: ct.id, room: `Room ${100 + ci * 3}` });
    const cs = subjectsForGrade(g, s.hl, s.fal).map(([subName], k) => {
      const teacher = teachers[(ci * 3 + k) % teachers.length];
      return { id: insert("class_subjects", { school_id: schoolId, class_id: classId, subject_id: subjectIds[subName], teacher_id: teacher.id }), subName, teacherUserId: teacher.userId };
    });
    classes.push({ id: classId, grade: g, name, cs, learners: [], classTeacherUserId: ct.userId });
  }

  let admission = 1;
  const parentPool = [];
  for (const c of classes) {
    for (let i = 0; i < s.perClass; i++) {
      const gender = rand() < 0.5 ? "Female" : "Male";
      const first = pick(gender === "Female" ? FEMALE : MALE);
      // Some siblings share a parent account
      const isDemoLearner = c === classes[classes.length - 1] && i === 0;
      const sibling = !isDemoLearner && parentPool.length > 3 && rand() < 0.12 ? pick(parentPool) : null;
      const last = sibling ? sibling.last : pick(SURNAMES);
      const birthYear = YEAR - 6 - c.grade;
      const dob = `${birthYear}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`;
      let userId = null;
      if (c.grade >= 4) {
        const e = isDemoLearner ? `learner@${s.domain}` : email(first, last, s.domain);
        usedEmails.add(e);
        userId = insert("users", { school_id: schoolId, role: "learner", first_name: first, last_name: last, email: e, password_hash: hash });
      }
      const learnerId = insert("learners", { school_id: schoolId, user_id: userId, admission_number: `${YEAR - (c.grade >= 8 ? c.grade - 8 : c.grade)}-${String(admission++).padStart(4, "0")}`, first_name: first, last_name: last, id_number: saId(dob, gender), gender, date_of_birth: dob, class_id: c.id, home_language: s.hl, address: s.address.split(",").slice(-2).join(",").trim(), status: "Active", enrolled_on: `${YEAR}-01-14` });

      let parent = sibling;
      if (!parent) {
        const pg = rand() < 0.65 ? "Female" : "Male";
        const pf = pick(pg === "Female" ? FEMALE : MALE);
        const e = isDemoLearner ? `parent@${s.domain}` : email(pf, last, s.domain.replace(".demo", "-parents.demo"));
        usedEmails.add(e);
        const pid = insert("users", { school_id: schoolId, role: "parent", title: pg === "Female" ? "Mrs" : "Mr", first_name: pf, last_name: last, email: e, phone: `+27 7${randInt(1, 9)} ${randInt(100, 999)} ${randInt(1000, 9999)}`, password_hash: hash });
        parent = { id: pid, last, rel: pg === "Female" ? "Mother" : "Father" };
        parentPool.push(parent);
      }
      insert("guardian_links", { parent_user_id: parent.id, learner_id: learnerId, relationship: parent.rel });
      c.learners.push({ id: learnerId, ability: clamp(58 + gauss() * 14, 22, 95) });
    }
  }

  // Assessments + marks + result sets
  for (const c of classes) {
    for (const cs of c.cs) {
      const subjOffset = gauss() * 6;
      for (const [term] of TERMS) {
        const plan = assessmentPlan(c.grade, term);
        for (const [k, [name, kind, max]] of plan.entries()) {
          const date = ASSESS_DATES[term][Math.min(k, 2)];
          const aid = insert("assessments", { school_id: schoolId, class_subject_id: cs.id, year: YEAR, term, name, kind, max_mark: max, weight: kind === "EXAM" ? 1 : 1, date });
          if (date > TODAY) continue; // future assessment: no marks yet
          for (const l of c.learners) {
            const absent = rand() < 0.015;
            const pct = clamp(l.ability + subjOffset + gauss() * 8, 5, 99);
            insert("marks", { assessment_id: aid, learner_id: l.id, mark: absent ? null : Math.round((pct / 100) * max), absent: absent ? 1 : 0, updated_by: cs.teacherUserId });
          }
        }
        insert("result_sets", { school_id: schoolId, class_subject_id: cs.id, year: YEAR, term, status: term <= 3 ? "published" : "draft", submitted_by: term <= 3 ? cs.teacherUserId : null, approved_by: term <= 3 ? adminUserId : null });
      }
    }
    // Class teacher comments for term 3
    for (const l of c.learners) {
      const comment = l.ability >= 75 ? "An outstanding term. Keep up the excellent work and continue to lead by example." : l.ability >= 60 ? "A solid term with good effort. Aim higher in your weaker subjects." : l.ability >= 45 ? "Satisfactory progress. More consistent study will improve your results." : "Needs urgent support. Please attend extra classes and complete all homework.";
      insert("report_comments", { school_id: schoolId, learner_id: l.id, year: YEAR, term: 3, class_teacher_comment: comment, principal_comment: l.ability >= 50 ? "Well done. Keep working hard." : "We will work with you and your parents to improve." });
    }
  }

  // Homework
  for (const c of classes) for (const cs of c.cs.slice(0, 4)) {
    insert("homework", { school_id: schoolId, class_subject_id: cs.id, title: pick(["Revise chapter notes", "Complete worksheet", "Read and summarise", "Practice past paper", "Prepare oral presentation"]) + ` - ${cs.subName}`, description: "Submit in class on the due date.", due_date: addDays(TODAY, randInt(1, 14)) });
  }

  // Attendance: school days from 1 Sep to 16 Oct (excl. Heritage Day and the term break)
  const holidays = new Set(["2026-09-24"]);
  for (let d = "2026-09-01"; d <= "2026-10-16"; d = addDays(d, 1)) {
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd === 0 || wd === 6 || holidays.has(d) || (d > "2026-10-02" && d < "2026-10-13")) continue;
    for (const c of classes) for (const l of c.learners) {
      const r = rand(), absentP = l.ability < 45 ? 0.1 : 0.04;
      const status = r < absentP ? "A" : r < absentP + 0.03 ? "L" : r < absentP + 0.04 ? "E" : "P";
      insert("attendance", { school_id: schoolId, learner_id: l.id, date: d, status, recorded_by: c.classTeacherUserId });
    }
  }

  // Fees (fee-paying schools only)
  if (s.fee_paying) {
    for (const c of classes) {
      const tuition = s.feeBase + c.grade * 350, activities = 1200, other = 650;
      insert("fee_structures", { school_id: schoolId, year: YEAR, grade: c.grade, tuition, activities, other });
      for (const l of c.learners) {
        const inv = insert("invoices", { school_id: schoolId, learner_id: l.id, year: YEAR, description: `${YEAR} school fees - Grade ${c.grade}`, tuition, activities, other, due_date: "2026-11-30" });
        const total = tuition + activities + other, r = rand();
        const payments = r < 0.55 ? 10 : r < 0.85 ? randInt(3, 8) : randInt(0, 2);
        const monthly = Math.round(total / 10);
        for (let m = 0; m < payments; m++) insert("payments", { school_id: schoolId, invoice_id: inv, amount: m === 9 ? total - monthly * 9 : monthly, paid_on: `2026-${String(1 + m).padStart(2, "0")}-0${randInt(1, 7)}`, method: pick(["EFT", "EFT", "Debit order", "Card", "Cash"]), reference: `PAY${schoolId}${inv}${m}` });
        if (r > 0.97) insert("payments", { school_id: schoolId, invoice_id: inv, amount: total, paid_on: "2026-02-01", method: "Exemption", reference: "Fee exemption (Reg. 2006)" });
      }
    }
  }

  // Expenses
  const EXP = [["Laboratory", "Chemicals and glassware", "40 units", 6500], ["Maintenance", "Classroom roof repair", "1 service", 18500], ["Nutrition (NSNP)", "Food supplies", "1 month", 24800], ["Library", "Readers and reference books", "120 books", 15200], ["Sport", "Netball and soccer kits", "30 items", 9800], ["ICT", "Laptops for staff", "4 pcs", 38000], ["Transport", "Bus service - sports day", "2 buses", 7400], ["Utilities", "Electricity (municipal)", "1 month", 12650], ["Stationery", "Exam paper and toner", "60 reams", 5200], ["Security", "Guarding services", "1 month", 16800], ["Cleaning", "Cleaning materials", "1 month", 3900], ["Maintenance", "Painting of admin block", "1 service", 27000]];
  EXP.forEach(([cat, desc, qty, amt], i) => insert("expenses", { school_id: schoolId, reference: `EX${String(i + 1).padStart(3, "0")}`, category: cat, description: desc, quantity: qty, amount: Math.round(amt * (0.7 + rand() * 0.6)), paid_on: `2026-${String(randInt(1, 10)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`, supplier: pick(["Makro", "Builders Warehouse", "Waltons", "Van Schaik", "Local supplier", "Eskom / Municipality"]) }));

  // Notices
  const NOTICES = [
    ["Term 4 begins", "Welcome back to the final term of 2026. Final examinations start in November - please collect your timetable from your class teacher.", "all", "School,Academic", 1240, "2026-10-13"],
    ["Final examination timetable", "The Term 4 examination timetable is now available. Learners must be seated 15 minutes before each paper. No cellphones are allowed in the venue.", "learners", "Academic,Exams", 860, "2026-10-14"],
    ["Parents' evening", "Parents and guardians are invited to discuss Term 3 reports with teachers on Thursday 29 October from 17:30 in the school hall.", "parents", "Parents,Meeting", 410, "2026-10-15"],
    ["School fees reminder", "Outstanding school fees for 2026 are due by 30 November. Parents who qualify may apply for a fee exemption at the office.", "parents", "Finance", 530, "2026-10-12"],
    ["Staff development workshop", "All educators must attend the CAPS assessment and moderation workshop on Friday 23 October at 14:00 in the staff room.", "staff", "Staff,Training", 95, "2026-10-16"],
    ["Heritage Day celebration", "Thank you to everyone who took part in our Heritage Day celebration. Photos are available in the school office.", "all", "School,Culture", 980, "2026-09-25"],
  ];
  for (const [title, body, audience, tags, views, d] of NOTICES) insert("notices", { school_id: schoolId, title, body, author_id: adminUserId, audience, tags, views, created_at: `${d} 08:00:00` });

  // Events
  const EVENTS = [
    ["Grade 12 Final Exams begin", "2026-10-21", "08:30", "12:00", "academic"], ["SGB meeting", "2026-10-22", "17:30", "19:00", "meeting"],
    ["CAPS moderation workshop", "2026-10-23", "14:00", "16:00", "meeting"], ["Inter-house athletics", "2026-10-27", "08:00", "14:00", "sport"],
    ["Parents' evening", "2026-10-29", "17:30", "19:30", "meeting"], ["Science expo", "2026-11-04", "09:00", "13:00", "academic"],
    ["Final examinations (Gr 8-11)", "2026-11-09", "08:30", "11:30", "academic"], ["Prize-giving ceremony", "2026-11-27", "10:00", "12:00", "school"],
    ["Day of Reconciliation (public holiday)", "2026-12-16", null, null, "holiday"], ["Last school day", "2026-12-09", "08:00", "11:00", "school"],
    ["Staff meeting", "2026-10-19", "14:30", "15:30", "meeting"], ["Soccer vs Rivers High", "2026-10-24", "10:00", "12:00", "sport"],
  ];
  for (const [title, date, st, et, cat] of EVENTS) insert("events", { school_id: schoolId, title, date, start_time: st, end_time: et, category: cat, audience: cat === "meeting" ? "Staff" : "All", description: null });

  // Library
  const BOOKS = [["LIT-001", "Cry, the Beloved Country", "Alan Paton", "English Home Language", "10-12", 1948], ["LIT-002", "Long Walk to Freedom", "Nelson Mandela", "History", "9-12", 1994], ["LIT-003", "Nervous Conditions", "Tsitsi Dangarembga", "English Home Language", "11-12", 1988], ["SCI-004", "A Brief History of Time", "Stephen Hawking", "Physical Sciences", "10-12", 1988], ["LIT-005", "Things Fall Apart", "Chinua Achebe", "English Home Language", "10-12", 1958], ["BIO-006", "The Selfish Gene", "Richard Dawkins", "Life Sciences", "11-12", 1976], ["LIT-007", "Tsotsi", "Athol Fugard", "English Home Language", "10-12", 1980], ["LIT-008", "Kringe in 'n Bos", "Dalene Matthee", "Afrikaans", "10-12", 1984], ["SEP-009", "Tsakatsaka", "O.K. Matsepe", "Sepedi", "8-12", 1968], ["MAT-010", "Calculus Made Easy", "Silvanus P. Thompson", "Mathematics", "11-12", 1910], ["GEO-011", "Atlas for Southern Africa", "Various", "Geography", "4-12", 2019], ["LIT-012", "Animal Farm", "George Orwell", "English First Additional Language", "9-12", 1945]];
  const allLearners = classes.flatMap((c) => c.learners);
  for (const [code, title, author, subject, grades, yr] of BOOKS) {
    const bid = insert("books", { school_id: schoolId, code: `${YEAR}-${code}`, title, author, subject, grades, publish_year: yr, copies: randInt(2, 6) });
    for (let k = 0; k < randInt(0, 2); k++) {
      const borrowed = addDays(TODAY, -randInt(3, 30));
      insert("book_loans", { school_id: schoolId, book_id: bid, learner_id: pick(allLearners).id, borrowed_on: borrowed, due_on: addDays(borrowed, 14), returned_on: rand() < 0.3 ? addDays(borrowed, 7) : null });
    }
  }

  // Messages: a staff group and a couple of direct chats
  const staffUsers = [adminUserId, ...teachers.map((t) => t.userId)];
  const group = insert("conversations", { school_id: schoolId, title: "Staff Coordination", is_group: 1, description: "Day-to-day coordination for all staff members." });
  for (const u of staffUsers) insert("conversation_members", { conversation_id: group, user_id: u });
  const GROUP_MSGS = ["Good morning everyone. Please remember the SGB meeting has moved to Thursday at 17:30.", "Thanks for the reminder. My Term 4 mark sheets will be submitted by Friday.", "Can someone confirm whether the hall is available for the science expo on 4 November?", "The hall is booked for you. Please hand the key back to the office afterwards.", "All Term 3 moderation files must be in the HOD office by the end of the week. Thank you."];
  GROUP_MSGS.forEach((body, i) => insert("messages", { conversation_id: group, sender_id: staffUsers[i % staffUsers.length], body, created_at: `2026-10-${16 + Math.floor(i / 3)} ${String(8 + i).padStart(2, "0")}:1${i}:00` }));
  for (const t of teachers.slice(0, 3)) {
    const dm = insert("conversations", { school_id: schoolId, title: null, is_group: 0 });
    insert("conversation_members", { conversation_id: dm, user_id: adminUserId });
    insert("conversation_members", { conversation_id: dm, user_id: t.userId });
    insert("messages", { conversation_id: dm, sender_id: t.userId, body: "Good day. May I have a quick meeting about my class's Term 4 assessment plan?", created_at: "2026-10-16 10:15:00" });
    insert("messages", { conversation_id: dm, sender_id: adminUserId, body: "Of course. Come to my office tomorrow at 10:00.", created_at: "2026-10-16 10:40:00" });
  }
}

db.exec("COMMIT");
const counts = ["schools", "users", "learners", "teachers", "assessments", "marks", "attendance"].map((t) => `${t}: ${db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n}`);
console.log("Seeded FerriDash demo data ->", dbPath);
console.log(counts.join(" | "));
