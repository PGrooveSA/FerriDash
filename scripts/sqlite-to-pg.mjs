// Copies a FerriDash SQLite database (and its uploaded files) into PostgreSQL / Supabase.
// Use it to load demo data for development, or to move an existing offline school to the cloud.
//
//   node --env-file=.env.local scripts/sqlite-to-pg.mjs <sqlite file> [--reset] [--files <data folder>]
//
//   --reset   drop every FerriDash table in the target database first (never use on a live database
//             you want to keep). Without it, the target must be empty.
//   --files   also copy avatars/, logos/ and expense-docs/ from that folder (default: the SQLite file's
//             folder) to Supabase Storage, or to data/uploads when no Supabase keys are set.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--files");
if (!src || !existsSync(src)) { console.error("Usage: node --env-file=.env.local scripts/sqlite-to-pg.mjs <sqlite file> [--reset] [--files <data folder>]"); process.exit(1); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(url);
const sql = postgres(url, { ssl: local ? false : "require", prepare: false, onnotice: () => {}, max: 1 });
const lite = new DatabaseSync(src, { readOnly: true });
const schema = readFileSync(join(root, "db", "schema.pg.sql"), "utf8");
// Copy in the order the schema creates tables, so foreign keys are satisfied.
const order = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)].map((m) => m[1]).filter((t) => t !== "schema_version");

try {
  if (args.includes("--reset")) {
    console.log(`Resetting ${local ? "the local" : "the REMOTE"} database...`);
    await sql.unsafe(`DROP TABLE IF EXISTS ${[...order, "schema_version"].map((t) => `"${t}"`).join(", ")} CASCADE`);
  }
  const [{ exists }] = await sql`SELECT to_regclass('public.schools') IS NOT NULL AS exists`;
  if (!exists) await sql.unsafe(schema);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM users`;
  if (n > 0) { console.error("The target database already has users. Use --reset to replace everything."); process.exit(1); }

  const liteTables = new Set(lite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  await sql.begin(async (tx) => {
    for (const table of order) {
      if (!liteTables.has(table)) continue;
      const pgCols = (await tx`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`).map((r) => r.column_name);
      const rows = lite.prepare(`SELECT * FROM "${table}"`).all();
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]).filter((c) => pgCols.includes(c));
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
        await tx`INSERT INTO ${tx(table)} ${tx(chunk, cols)}`;
      }
      if (pgCols.includes("id")) await tx.unsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT MAX(id) FROM "${table}"), 1))`);
      console.log(`  ${table}: ${rows.length}`);
    }
  });
  console.log("Database copied.");

  // Uploaded files.
  const filesAt = args.includes("--files") ? resolve(args[args.indexOf("--files") + 1]) : dirname(resolve(src));
  const folders = { avatars: "avatars", logos: "logos", "expense-docs": "expense-docs" };
  const supa = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  let sb = null;
  if (supa) {
    const { createClient } = await import("@supabase/supabase-js");
    sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "ferridash-uploads";
    const { data } = await sb.storage.getBucket(bucket);
    if (!data) await sb.storage.createBucket(bucket, { public: false });
  }
  let copied = 0;
  for (const [dir, prefix] of Object.entries(folders)) {
    const from = join(filesAt, dir);
    if (!existsSync(from)) continue;
    for (const f of readdirSync(from)) {
      const key = `${prefix}/${f}`;
      if (sb) {
        const bytes = readFileSync(join(from, f));
        const { error } = await sb.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "ferridash-uploads").upload(key, bytes, { upsert: true, contentType: f.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" });
        if (error) throw new Error(`${key}: ${error.message}`);
      } else {
        mkdirSync(join(root, "data", "uploads", prefix), { recursive: true });
        copyFileSync(join(from, f), join(root, "data", "uploads", prefix, f));
      }
      copied++;
    }
  }
  if (copied) console.log(`Files copied: ${copied} (${sb ? "Supabase Storage" : "data/uploads"})`);
} finally {
  lite.close();
  await sql.end({ timeout: 5 });
}
