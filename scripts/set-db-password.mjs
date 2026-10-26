// Updates the password inside DATABASE_URL in .env.local: asks for it (hidden), encodes special characters,
// tests the connection, and only saves when Supabase accepts it. Then copies the new DATABASE_URL to the
// clipboard (for Vercel). The password is never printed.
//   npm run db:password
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import postgres from "postgres";

const file = ".env.local";
const text = readFileSync(file, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) { console.error("No DATABASE_URL line in .env.local"); process.exit(1); }
const url = new URL(line.slice("DATABASE_URL=".length).trim());

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); process.stdout.write("\n"); resolve(value); return; }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

console.log(`Database user ${url.username.replace(/\.[a-z0-9]+$/, ".<project>")} at ${url.host}`);
console.log("Paste or type the database password exactly as set in Supabase (Project Settings > Database).");
console.log("Right-click pastes in this window. Nothing is shown while you type.\n");
const password = await askHidden("Database password: ");
if (!password) { console.error("No password entered."); process.exit(1); }
url.password = encodeURIComponent(password);

process.stdout.write("Testing the connection... ");
const sql = postgres(url.toString(), { ssl: "require", prepare: false, max: 1, connect_timeout: 15, onnotice: () => {} });
try {
  await sql`SELECT 1`;
  console.log("OK, Supabase accepted the password.");
} catch (e) {
  console.log("failed.");
  console.error(`Supabase said: ${e.message}`);
  console.error("Nothing was changed. If you reset the password a moment ago, wait 2 minutes and try again.");
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

const value = url.toString();
writeFileSync(file, text.replace(line, "DATABASE_URL=" + value));
console.log("Saved to .env.local.");
try {
  execSync("clip", { input: value });
  console.log("\nThe new DATABASE_URL is on your clipboard. In Vercel: ferri-dash > Settings > Environment Variables,");
  console.log("open DATABASE_URL (the ... menu > Edit), paste it as the value, Save, then Redeploy.");
} catch {
  console.log("\nCopy the DATABASE_URL line from .env.local into Vercel (Settings > Environment Variables), then Redeploy.");
}
