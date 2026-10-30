// Database access: PostgreSQL on Supabase.
// The application's SQL was written for SQLite; translate() adapts it once per statement, so queries
// keep their familiar shape: "?" or "?1" placeholders, datetime('now'), case-insensitive LIKE and
// camelCase result names. Transactions follow the async call chain (AsyncLocalStorage), so code inside
// tx() uses the same get/all/run helpers.
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS } from "../db/migrations";

type Sql = postgres.Sql;
type Param = string | number | boolean | null | undefined;

const g = globalThis as unknown as { __ferriSql?: Sql; __ferriReady?: Promise<void> };
const txStore = new AsyncLocalStorage<Sql>();

// int8 (COUNT, SUM of integers) and numeric (AVG, ROUND) come back as numbers, like SQLite.
const asNumber = (oid: number) => ({ to: oid, from: [oid], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) });

function client(): Sql {
  if (!g.__ferriSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add your Supabase connection string to .env.local.");
    const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(url);
    g.__ferriSql = postgres(url, {
      ssl: local ? false : "require",
      prepare: false, // required by Supabase's transaction pooler (port 6543)
      max: Number(process.env.DB_POOL_MAX || 5),
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
      types: { int8: asNumber(20), numeric: asNumber(1700) } as unknown as Record<string, postgres.PostgresType>,
    });
  }
  return g.__ferriSql;
}

/** Creates the tables on an empty database (first run), then applies any schema changes it hasn't had (db/migrations.ts). */
async function ready(): Promise<void> {
  if (!g.__ferriReady) {
    g.__ferriReady = (async () => {
      const sql = client();
      const [{ exists }] = await sql`SELECT to_regclass('public.schools') IS NOT NULL AS exists`;
      if (!exists) await sql.unsafe(readFileSync(join(process.cwd(), "db", "schema.pg.sql"), "utf8"));
      const [{ v }] = await sql`SELECT COALESCE(MAX(version), 1)::int AS v FROM schema_version`;
      const pending = MIGRATIONS.filter((m) => m.version > v);
      if (pending.length) {
        await sql.begin(async (t) => {
          // Several servers can start at once: one applies the changes, the others wait and then skip them.
          await t`SELECT pg_advisory_xact_lock(470211)`;
          const [{ v: now }] = await t`SELECT COALESCE(MAX(version), 1)::int AS v FROM schema_version`;
          for (const m of pending.filter((x) => x.version > now)) {
            await t.unsafe(m.sql);
            await t`INSERT INTO schema_version (version) VALUES (${m.version})`;
          }
        });
      }
    })().catch((e) => { g.__ferriReady = undefined; throw e; });
  }
  return g.__ferriReady;
}

// Tables without an "id" column (no RETURNING id on insert).
const NO_ID = new Set(["enrolments", "guardian_links", "conversation_members", "schema_version"]);
const cache = new Map<string, { text: string; order: number[] | null }>();

/** SQLite-flavoured SQL to PostgreSQL. Text inside quotes is left alone. */
export function translate(sql: string): { text: string; order: number[] | null } {
  const hit = cache.get(sql);
  if (hit) return hit;
  let out = "", i = 0, plain = 0;
  const order: number[] = [];
  let numbered = false;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') { // copy quoted text verbatim
      let j = i + 1;
      while (j < sql.length && !(sql[j] === c && sql[j + 1] !== c)) j += sql[j] === c ? 2 : 1;
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "?") {
      const m = /^\?(\d+)/.exec(sql.slice(i));
      if (m) { numbered = true; order.push(Number(m[1]) - 1); out += "$" + order.length; i += m[0].length; }
      else { plain++; out += "$" + plain; i++; }
      continue;
    }
    // Words: functions and identifiers.
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i));
    if (w) {
      const word = w[0], rest = sql.slice(i + word.length);
      if (/^datetime$/i.test(word) && /^\(\s*'now'\s*\)/i.test(rest)) { out += "ferri_now()"; i += word.length + /^\(\s*'now'\s*\)/i.exec(rest)![0].length; continue; }
      if (/^date$/i.test(word) && /^\(\s*'now'\s*\)/i.test(rest)) { out += "ferri_today()"; i += word.length + /^\(\s*'now'\s*\)/i.exec(rest)![0].length; continue; }
      if (/^like$/i.test(word)) { out += "ILIKE"; i += word.length; continue; }
      // camelCase result names (className, classYear): quote them, or Postgres lowercases them.
      if (/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(word)) { out += `"${word}"`; i += word.length; continue; }
      out += word; i += word.length; continue;
    }
    out += c; i++;
  }
  // Inserts report the new row's id, like SQLite's lastInsertRowid.
  const ins = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(out);
  if (ins && !NO_ID.has(ins[1].toLowerCase()) && !/\bRETURNING\b/i.test(out)) out = out.replace(/;?\s*$/, " RETURNING id");
  const entry = { text: out, order: numbered ? order : null };
  cache.set(sql, entry);
  return entry;
}

function bind(sql: string, params: Param[]) {
  const { text, order } = translate(sql);
  const values = params.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  return { text, values: order ? order.map((k) => values[k] ?? null) : values };
}

async function query(sql: string, params: Param[]) {
  await ready();
  const { text, values } = bind(sql, params);
  const conn = txStore.getStore() ?? client();
  try {
    return await conn.unsafe(text, values as postgres.ParameterOrJSON<never>[]);
  } catch (e) {
    // Server log only (never shown to users): which statement failed.
    if (process.env.DB_DEBUG) console.error(`[db] ${(e as Error).message}
${text}
`);
    throw e;
  }
}

/** All rows as plain objects (safe to pass to client components). */
export async function all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]> {
  const rows = await query(sql, params);
  return rows.map((r) => ({ ...r }) as T);
}

export async function get<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T | undefined> {
  const rows = await query(sql, params);
  return rows[0] ? ({ ...rows[0] } as T) : undefined;
}

export async function run(sql: string, ...params: Param[]): Promise<{ changes: number; id: number }> {
  const rows = await query(sql, params);
  return { changes: rows.count ?? 0, id: Number((rows[0] as { id?: number } | undefined)?.id ?? 0) };
}

/** Runs fn in one transaction (nested calls join the outer one). Throwing rolls everything back. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  await ready();
  return (await client().begin((t) => txStore.run(t as unknown as Sql, fn))) as T;
}

export async function audit(schoolId: number | null, userId: number | null, action: string, entity: string, entityId?: number | null, detail?: string) {
  await run("INSERT INTO audit_log (school_id, user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)", schoolId, userId, action, entity, entityId ?? null, detail ?? null);
}

/** For scripts and tests: close the connection pool. */
export async function closeDb() {
  if (g.__ferriSql) { await g.__ferriSql.end({ timeout: 5 }); g.__ferriSql = undefined; g.__ferriReady = undefined; }
}
