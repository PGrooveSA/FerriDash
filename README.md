# FerriDash – School Management for South Africa

A multi-school management system for South African public and independent schools, Grade R to Grade 12.
It covers learners, educators, parents, attendance, **CAPS results**, **report generation**, fees in **ZAR**,
notices, calendar, library and messaging, with a modern glass interface in light and dark mode.

Copyright © Infinite Q Graphics

## Run it (offline)

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`; no database server and no internet connection needed once installed).

**Windows:** double-click `start.bat`. It checks Node.js, installs packages and builds the app on first run, then opens http://localhost:3100 in your browser. Use `start.bat rebuild` after code changes, `start.bat dev` for live-reload development, or `start.bat reset` to reload the demo data.

**Any platform:**

```bash
npm install
npm run dev
```

Open http://localhost:3100. On first start the database (`data/school-hub.db`) is created and filled with demo data.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3100 (seeds automatically if empty) |
| `npm run build` then `npm start` | Production build and server |
| `npm run seed:reset` | Wipe and reload the demo data (safe while the app is running) |
| `npm run typecheck` | TypeScript check |
| `node scripts/smoke.mjs` | Loads every page as every role and checks role restrictions (app must be running) |

`.env.local` holds `SESSION_SECRET` (generate a new one per installation). `DB_PATH` can point the database elsewhere.
To serve other devices on the school LAN over plain HTTP in production, set `INSECURE_COOKIES=1`.

## Demo accounts

All demo accounts use the password **`Demo@2026`**. Change or remove them before real use.

| Role | Email |
|---|---|
| Platform admin (all schools) | `superadmin@ferridash.demo` |
| School admin | `admin@sunnyside.demo`, `admin@moletjie.demo`, `admin@tableview.demo` |
| Educator | `teacher@sunnyside.demo` (also `@moletjie.demo`, `@tableview.demo`) |
| Learner | `learner@sunnyside.demo` (also `@moletjie.demo`, `@tableview.demo`) |
| Parent / guardian | `parent@sunnyside.demo` (also `@moletjie.demo`, `@tableview.demo`) |

Demo schools: Sunnyside Secondary (Gauteng, Q4, fee-paying), Moletjie Primary (Limpopo, Q1, no-fee, Sepedi HL),
Table View Combined (Western Cape, Q5).

## Roles

| Role | Can do |
|---|---|
| **Platform admin** | Register and suspend schools, switch into any school with full admin rights |
| **School admin** | Everything in their school: staff, learners, parents, classes, allocation, moderation and publishing, finance, settings |
| **Educator** | Registers for their classes, mark capture for subjects they teach, reports for their classes, notices, calendar, library loans |
| **Learner** | Own dashboard, published results and report cards, attendance, homework, library, messages to staff |
| **Parent** | Their own children only: published results, report cards, attendance, fee statement, messages to staff |

Learners and parents never see unpublished marks.

## CAPS implementation

- **7-point scale**: 7 Outstanding (80–100), 6 Meritorious (70–79), 5 Substantial (60–69), 4 Adequate (50–59),
  3 Moderate (40–49), 2 Elementary (30–39), 1 Not achieved (0–29).
- **Phase weighting** (SBA : examinations): Foundation 100:0, Intermediate 75:25, Senior 40:60, FET 25:75.
  The June and preparatory examinations count towards SBA; the Term 4 examination is the final exam.
  Until it is captured, year marks and promotion outcomes are marked *provisional*.
- **Promotion requirements** (`lib/caps.ts`), per the National Policy pertaining to Programme and Promotion Requirements:
  - Foundation: HL 50%, Mathematics 40%, FAL 40%
  - Intermediate: HL 50%, FAL 40%, Mathematics 40%, two other subjects 40%
  - Senior: HL 50%, FAL 40%, Mathematics 40%, three others 40%, two further 30%
  - FET: HL 40%, two others 40%, three further 30%; Grade 12 also shows Higher Certificate, Diploma or Bachelor's pass
    (designated-subject lists are simplified to "non-LO subjects")
  
  These rules are indicative. Verify them against current DBE circulars before making official decisions.
- **Results workflow**: Draft → Submitted (educator) → Approved → Published (management). Marks lock once submitted,
  and every change is written to the audit trail.

## Results and Reports

- **Results → Mark Entry**: spreadsheet-style grid with live term % and CAPS level. Paste blocks straight from Excel,
  type `ab` for absent, press Enter to move down; cells save automatically.
- **Results → Moderation**: capture progress per class-subject; approve, publish, or publish all approved at once.
- **Results → Analysis**: subject averages, pass rates, level distribution, top learners, learners needing support.
- **Reports**: CAPS report cards (one learner or the whole class, print or save as PDF) with comments, attendance,
  position and promotion outcome; class broadsheet (CSV); promotion schedule (CSV); attendance report; finance report with debtors list.

## Year-end promotion

School admins use **Reports → Year-end Promotion** when the year's final results are in:

1. Each learner gets a default action from their CAPS year result: **Promote**, **Repeat grade**, **Graduate** (Grade 12s who achieved the NSC) or **Leaves school**. Change any of them, for example for progression or condonation decisions.
2. Type the year to confirm. FerriDash then records every learner's class and outcome for the year, creates next year's classes (8A → 9A; same subjects, teachers and register teachers), moves learners, marks graduates, copies term dates and fee structures, and moves the school to Term 1 of the new year.
3. Past report cards stay available: choose the year under **Report cards**. Graduates and their parents can still open them.

Back up the `data` folder before running it; it cannot be undone.

## Online fee payments (Ozow)

Fee-paying schools can let parents pay school fees from their banking app with [Ozow](https://ozow.com):

1. The school signs up with Ozow and creates a One API client (dash.ozow.com → One API → Clients).
2. A school admin enters the **site code**, **client ID** and **client secret** under **Settings → Online payments (Ozow)**, starts in **Test** mode (Ozow staging, no real money), clicks **Test connection**, then switches to **Live**. The secret is stored encrypted with `SESSION_SECRET`; if that changes, enter the secret again.
3. Parents see **Pay now** on their dashboard and fee statement, choose an amount up to the balance, and pay on Ozow's secure page.
4. FerriDash confirms each payment by asking Ozow (outbound internet only), then records it on the statement, oldest invoice first, exactly once. Open payments are re-checked when the statement or Fees page is opened; **Check status** does it on demand. Admins see online payments on **Finance → Fees Collection**.

The server needs internet access for this. Ozow only sends parents straight back to FerriDash if the optional **public address** (an `https://` address reachable from the internet) is set; without it, payments are confirmed when the parent returns to the statement. No-fee schools don't see any of this.

To try it without an Ozow account: run `node scripts/mock-ozow.mjs`, start FerriDash with `OZOW_BASE_URL=http://127.0.0.1:4010`, and use client ID `test-client` and secret `test-secret`.

## School logo and profile photos

- **School logo**: school admins upload or remove it under **Settings** (no other role can). After sign-in it appears on every role's dashboard, in the sidebar, and on report cards and fee statements. The sign-in page stays generic because all schools share it; its animated dawn-sky background (midnight blue to a tangerine sunrise) shows rising education symbols, an orbiting atom, a learning path and twinkling stars for the future.
- **Profile photos**: every user can upload one under **Profile**.
- Images are resized in the browser and stored offline in `data/logos` and `data/avatars`. Logos are public; profile photos are only visible to signed-in users of the same school.

## South African details

ZAR currency (`en-ZA` formatting), SA ID number validation (Luhn check, with date of birth and gender read from the ID),
EMIS numbers, quintiles, the nine provinces, no-fee schools, fee exemptions, PERSAL and SACE numbers, the 11 official
languages plus SA Sign Language, four-term calendar, and a POPIA privacy notice.

## Architecture

- **Next.js 15 (App Router) + React 19 + TypeScript**, server components and server actions
- **Tailwind CSS 4** glass design system (`app/globals.css`) in a sunrise palette (tangerine, sunshine yellow and warm charcoal): `.glass`, `.glass-strong`, `.glass-solid`, light and dark
  themes, and support for `prefers-reduced-transparency` and `prefers-reduced-motion`
- **SQLite via `node:sqlite`** (`db/schema.sql`). Every tenant table carries `school_id`; all queries are scoped to the
  signed-in user's school. The SQL stays close to standard so it can move to PostgreSQL or Supabase later.
- **Auth**: bcrypt password hashes, signed JWT session cookie (`jose`), middleware guard, a role check in every page
  and action, login throttling, audit log
- **Charts**: Recharts. **PDF**: browser print with dedicated print styles (works offline).

```
app/(app)/        authenticated pages (dashboard, results, reports, finance, ...)
app/actions/      server actions (all mutations, each role-checked)
lib/caps.ts       CAPS levels, weighting, promotion rules
lib/results.ts    term/year marks, rankings, class results
components/       shell, UI kit, charts, report card
db/schema.sql     database schema
scripts/          seed and smoke test
```

## Suggested next steps

1. Bulk CSV/Excel import for learners, staff and marks (SA-SAMS export)
2. SMS/WhatsApp/email notifications to parents (needs an online gateway)
3. Move to PostgreSQL (Supabase) for multi-school hosting, with row-level security as a second safety net
4. Timetabling, and an SBA-compliant assessment programme per subject
5. Installable PWA with offline mark capture and sync
