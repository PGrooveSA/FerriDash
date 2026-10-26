// Creates the first platform administrator on a new (empty) FerriDash database, e.g. the live Supabase one.
// Creates the tables first if the database is empty. Asks for the name, email and password in the
// terminal; the password is never shown, stored only as a bcrypt hash, and never passed on the command line.
//
//   node --env-file=.env.local scripts/create-admin.mjs [--another]
//
//   --another   add a further platform administrator when one already exists
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/create-admin.mjs"); process.exit(1); }
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(url);
const sql = postgres(url, { ssl: local ? false : "require", prepare: false, onnotice: () => {}, max: 1 });


// Reads a line without echoing it.
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) { reject(new Error("Run this in an interactive terminal (the password is typed, not piped).")); return; }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { done(); resolve(value); return; }
        if (ch === "\u0003") { done(); process.stdout.write("\n"); process.exit(130); } // Ctrl-C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    const done = () => { stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); process.stdout.write("\n"); };
    stdin.on("data", onData);
  });
}

try {
  const [{ exists }] = await sql`SELECT to_regclass('public.schools') IS NOT NULL AS exists`;
  if (!exists) {
    console.log("Empty database: creating the FerriDash tables...");
    await sql.unsafe(readFileSync(join(root, "db", "schema.pg.sql"), "utf8"));
  }
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin'`;
  if (n > 0 && !process.argv.includes("--another")) {
    console.error(`This database already has ${n} platform administrator(s). Use --another to add one more.`);
    process.exit(1);
  }

  console.log(`Creating a platform administrator on ${local ? "the local" : "the LIVE"} database.\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => { process.stdout.write(q); return String((await lines.next()).value ?? "").trim(); };
  const first = await ask("First name: ");
  const last = await ask("Surname: ");
  const email = (await ask("Email (used to sign in): ")).toLowerCase();
  rl.close();
  if (!first || !last || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A first name, surname and valid email are required.");
  const [taken] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (taken) throw new Error("That email is already in use.");

  const password = await askHidden("Password (not shown): ");
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Use at least 12 characters with a capital letter, a small letter and a number.");
  }
  if ((await askHidden("Type the password again: ")) !== password) throw new Error("The passwords do not match.");

  const [{ id }] = await sql`INSERT INTO users (school_id, role, first_name, last_name, email, password_hash)
    VALUES (NULL, 'super_admin', ${first}, ${last}, ${email}, ${bcrypt.hashSync(password, 12)}) RETURNING id`;
  await sql`INSERT INTO audit_log (school_id, user_id, action, entity, entity_id, detail) VALUES (NULL, ${id}, 'create', 'user', ${id}, 'platform administrator created from the command line')`;
  console.log(`\nDone. ${first} ${last} can now sign in with ${email} and add the first school.`);
} catch (e) {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
