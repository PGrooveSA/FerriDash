import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// One shared connection per server process (survives hot reloads in dev).
const g = globalThis as unknown as { __schoolHubDb?: DatabaseSync };

function open(): DatabaseSync {
  const path = process.env.DB_PATH || join(process.cwd(), "data", "school-hub.db");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8"));
  migrate(db);
  return db;
}

/** Adds columns introduced after a database was first created. */
function migrate(db: DatabaseSync) {
  const has = (table: string, col: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has("users", "avatar_updated_at")) db.exec("ALTER TABLE users ADD COLUMN avatar_updated_at TEXT");
  if (!has("users", "notices_seen_at")) db.exec("ALTER TABLE users ADD COLUMN notices_seen_at TEXT");
  if (!has("schools", "logo_updated_at")) db.exec("ALTER TABLE schools ADD COLUMN logo_updated_at TEXT");
  if (!has("expenses", "document_name")) db.exec("ALTER TABLE expenses ADD COLUMN document_name TEXT");
  // Online payments: allow the 'Ozow' method (SQLite can't alter a CHECK, so rebuild the table once).
  const paymentsSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'").get() as { sql: string } | undefined)?.sql ?? "";
  if (paymentsSql && !paymentsSql.includes("'Ozow'")) {
    db.exec(`BEGIN;
      CREATE TABLE payments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        paid_on TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'EFT' CHECK (method IN ('EFT','Cash','Card','Debit order','Exemption','Ozow')),
        reference TEXT,
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        online_payment_id INTEGER
      );
      INSERT INTO payments_new (id, school_id, invoice_id, amount, paid_on, method, reference, recorded_by)
        SELECT id, school_id, invoice_id, amount, paid_on, method, reference, recorded_by FROM payments;
      DROP TABLE payments;
      ALTER TABLE payments_new RENAME TO payments;
      COMMIT;`);
  }
  if (!has("teachers", "status")) db.exec("ALTER TABLE teachers ADD COLUMN status TEXT NOT NULL DEFAULT 'Active'; ALTER TABLE teachers ADD COLUMN left_on TEXT; ALTER TABLE teachers ADD COLUMN exit_note TEXT;");
}

export function db(): DatabaseSync {
  if (!g.__schoolHubDb) g.__schoolHubDb = open();
  return g.__schoolHubDb;
}

type Param = SQLInputValue | undefined | boolean;
const norm = (p: Param[]) => p.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)) as SQLInputValue[];

// node:sqlite binds positional arrays only to plain "?" placeholders, so numbered
// placeholders ("?1", "?2", reused several times) are expanded here.
const stmtCache = new Map<string, { sql: string; order: number[] | null }>();
function prep(sql: string, params: Param[]) {
  let entry = stmtCache.get(sql);
  if (!entry) {
    const order: number[] = [];
    const out = sql.replace(/\?(\d+)/g, (_, n) => { order.push(Number(n) - 1); return "?"; });
    entry = { sql: out, order: order.length ? order : null };
    stmtCache.set(sql, entry);
  }
  const values = norm(params);
  return { stmt: db().prepare(entry.sql), values: entry.order ? entry.order.map((i) => values[i]) : values };
}

/** All rows as plain objects (safe to pass to client components). */
export function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
  const { stmt, values } = prep(sql, params);
  return stmt.all(...values).map((r) => ({ ...r }) as T);
}

export function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
  const { stmt, values } = prep(sql, params);
  const r = stmt.get(...values);
  return r ? ({ ...r } as T) : undefined;
}

export function run(sql: string, ...params: Param[]) {
  const { stmt, values } = prep(sql, params);
  const r = stmt.run(...values);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function audit(schoolId: number | null, userId: number | null, action: string, entity: string, entityId?: number | null, detail?: string) {
  run("INSERT INTO audit_log (school_id, user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)", schoolId, userId, action, entity, entityId ?? null, detail ?? null);
}
