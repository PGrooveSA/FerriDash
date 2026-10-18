-- Sekolo schema (SQLite, written to stay portable to PostgreSQL).
-- Every tenant-owned table carries school_id so many schools share one database.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emis_number TEXT UNIQUE,
  province TEXT NOT NULL,
  district TEXT,
  quintile INTEGER CHECK (quintile BETWEEN 1 AND 5),
  school_type TEXT NOT NULL DEFAULT 'Combined' CHECK (school_type IN ('Primary','Secondary','Combined')),
  fee_paying INTEGER NOT NULL DEFAULT 1,
  address TEXT,
  phone TEXT,
  email TEXT,
  principal TEXT,
  motto TEXT,
  current_year INTEGER NOT NULL DEFAULT 2026,
  current_term INTEGER NOT NULL DEFAULT 4 CHECK (current_term BETWEEN 1 AND 4),
  logo_updated_at TEXT, -- set when the school has uploaded a logo (data/logos)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin','school_admin','teacher','learner','parent')),
  title TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT,
  avatar_updated_at TEXT, -- set when the user has a profile photo in data/avatars
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  staff_number TEXT,
  persal_number TEXT,
  sace_number TEXT,
  id_number TEXT,
  gender TEXT,
  address TEXT,
  post_level TEXT DEFAULT 'PL1',
  employed_since TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 0 AND 12), -- 0 = Grade R
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  room TEXT,
  UNIQUE (school_id, name, year)
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  -- HL = Home Language, FAL = First Additional Language, SAL = Second Additional,
  -- MATH = Mathematics, MLIT = Mathematical Literacy, LO = Life Orientation / Life Skills
  category TEXT NOT NULL DEFAULT 'OTHER' CHECK (category IN ('HL','FAL','SAL','MATH','MLIT','LO','OTHER')),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS learners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  admission_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  id_number TEXT,
  gender TEXT CHECK (gender IN ('Male','Female','Other')),
  date_of_birth TEXT,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  home_language TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Transferred','Withdrawn','Graduated')),
  enrolled_on TEXT,
  UNIQUE (school_id, admission_number)
);

CREATE TABLE IF NOT EXISTS guardian_links (
  parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Parent',
  PRIMARY KEY (parent_user_id, learner_id)
);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 4),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  UNIQUE (school_id, year, number)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P','A','L','E')), -- present, absent, late, excused
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (learner_id, date)
);

-- Assessments follow the CAPS split between School-Based Assessment (SBA/PAT) and examinations.
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  term INTEGER NOT NULL CHECK (term BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'SBA' CHECK (kind IN ('SBA','PAT','EXAM')),
  max_mark REAL NOT NULL DEFAULT 100,
  weight REAL NOT NULL DEFAULT 1,
  date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mark REAL,
  absent INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (assessment_id, learner_id)
);

-- Moderation workflow: one row per class-subject per term.
CREATE TABLE IF NOT EXISTS result_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  term INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','published')),
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_subject_id, year, term)
);

CREATE TABLE IF NOT EXISTS report_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  term INTEGER NOT NULL,
  class_teacher_comment TEXT,
  principal_comment TEXT,
  UNIQUE (learner_id, year, term)
);

CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_subject_id INTEGER NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  grade INTEGER NOT NULL,
  tuition REAL NOT NULL DEFAULT 0,
  activities REAL NOT NULL DEFAULT 0,
  other REAL NOT NULL DEFAULT 0,
  UNIQUE (school_id, year, grade)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  description TEXT NOT NULL,
  tuition REAL NOT NULL DEFAULT 0,
  activities REAL NOT NULL DEFAULT 0,
  other REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'EFT' CHECK (method IN ('EFT','Cash','Card','Debit order','Exemption')),
  reference TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  reference TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity TEXT,
  amount REAL NOT NULL,
  paid_on TEXT NOT NULL,
  supplier TEXT
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','staff','learners','parents')),
  tags TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  category TEXT NOT NULL DEFAULT 'school' CHECK (category IN ('school','academic','sport','meeting','holiday')),
  audience TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  subject TEXT,
  grades TEXT,
  publish_year INTEGER,
  copies INTEGER NOT NULL DEFAULT 1,
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS book_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  borrowed_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  returned_on TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT,
  is_group INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TEXT,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id, role);
CREATE INDEX IF NOT EXISTS idx_learners_class ON learners(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_assess_cs ON assessments(class_subject_id, year, term);
CREATE INDEX IF NOT EXISTS idx_marks_learner ON marks(learner_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_learner ON invoices(learner_id);
