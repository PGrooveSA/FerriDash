// Smoke test: signs a session for one demo user per role and loads every page.
// Usage: start the app (npm run dev), then: node --no-warnings=ExperimentalWarning scripts/smoke.mjs [baseUrl]
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://localhost:3100";
const env = Object.fromEntries(readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const key = new TextEncoder().encode(env.SESSION_SECRET || "dev-only-insecure-secret-change-me");
const db = new DatabaseSync(process.env.DB_PATH || join(root, "data", "school-hub.db"));

const ADMIN_PAGES = ["/dashboard", "/teachers", "/learners", "/learners?status=all", "/learners/1", "/parents", "/academics", "/academics?tab=subjects", "/academics?tab=allocation", "/attendance", "/results", "/results?term=3", "/results/moderation", "/results/analysis", "/results/analysis?term=year", "/reports", "/reports/report-cards", "/reports/report-cards?term=3&all=1", "/reports/report-cards?term=year&all=1", "/reports/broadsheet", "/reports/broadsheet?term=year", "/reports/promotion", "/reports/year-end", "/reports/attendance", "/reports/attendance?range=year", "/reports/finance", "/finance/fees", "/finance/fees?status=overdue", "/finance/expenses", "/notices", "/calendar", "/library", "/messages", "/profile", "/settings", "/search?q=th"];
const ROLES = {
  super_admin: ["/schools", ...ADMIN_PAGES],
  school_admin: ADMIN_PAGES,
  teacher: ["/dashboard", "/learners", "/attendance", "/results", "/results/analysis", "/reports", "/reports/report-cards", "/reports/broadsheet", "/reports/promotion", "/reports/attendance", "/notices", "/calendar", "/library", "/messages", "/profile", "/search?q=a"],
  learner: ["/dashboard", "/attendance", "/results/my", "/results/my?term=year", "/reports/report-cards", "/notices", "/calendar", "/library", "/messages", "/profile"],
  parent: ["/dashboard", "/attendance", "/results/my", "/reports/report-cards", "/finance/statement", "/notices", "/calendar", "/library", "/messages", "/profile"],
};
// Pages a role must NOT reach (should redirect away).
const FORBIDDEN = { teacher: ["/teachers", "/finance/fees", "/settings", "/reports/year-end"], learner: ["/learners", "/results/moderation", "/finance/fees"], parent: ["/teachers", "/reports/broadsheet"] };

let failures = 0;
for (const [role, pages] of Object.entries(ROLES)) {
  // Prefer the documented demo accounts at the first school.
  const u = db.prepare("SELECT id, email FROM users WHERE role = ? ORDER BY (email LIKE '%sunnyside%') DESC, (email LIKE 'admin@%' OR email LIKE 'teacher@%' OR email LIKE 'learner@%' OR email LIKE 'parent@%' OR email LIKE 'superadmin@%') DESC, id LIMIT 1").get(role);
  const token = await new SignJWT({ uid: u.id, role }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);
  const headers = { cookie: `sh_session=${token}` };
  for (const p of pages) {
    const t0 = Date.now();
    const res = await fetch(base + p, { headers, redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    const bad = res.status !== 200 || /Application error|Internal Server Error|__next_error__/.test(html);
    if (bad) failures++;
    console.log(`${bad ? "FAIL" : " ok "} ${role.padEnd(12)} ${String(res.status)} ${String(Date.now() - t0).padStart(5)}ms ${p}${res.headers.get("location") ? " -> " + res.headers.get("location") : ""}`);
  }
  // Learners/parents: "Academic Record" redirects to their own learner record, which must load;
  // someone else's record must not.
  if (role === "learner" || role === "parent") {
    const r = await fetch(base + "/records", { headers, redirect: "manual" });
    const loc = r.headers.get("location") ?? "";
    const rec = loc.startsWith("/learners/") ? await fetch(base + loc, { headers, redirect: "manual" }) : null;
    const okRec = !!rec && rec.status === 200 && (await rec.text()).includes("Academic history");
    if (!okRec) failures++;
    console.log(`${okRec ? " ok " : "FAIL"} ${role.padEnd(12)} ${rec?.status ?? r.status} own record ${loc}`);
    const ownId = Number(loc.split("/").pop());
    const other = db.prepare("SELECT id FROM learners WHERE id <> ? ORDER BY id LIMIT 1").get(ownId).id;
    const o = await fetch(base + "/learners/" + other, { headers, redirect: "manual" });
    const blockedOther = o.status === 404 || (o.status === 200 && !(await o.text()).includes("Academic history"));
    if (!blockedOther) failures++;
    console.log(`${blockedOther ? " ok " : "FAIL"} ${role.padEnd(12)} ${o.status} blocked other learner record`);
  }
  for (const p of FORBIDDEN[role] ?? []) {
    const res = await fetch(base + p, { headers, redirect: "manual" });
    const blocked = res.status >= 300 && res.status < 400 || (res.status === 200 && false);
    if (!blocked) failures++;
    console.log(`${blocked ? " ok " : "FAIL"} ${role.padEnd(12)} ${res.status} blocked ${p}`);
  }
}
console.log(failures ? `\n${failures} failure(s)` : "\nAll pages passed.");
process.exit(failures ? 1 : 0);
