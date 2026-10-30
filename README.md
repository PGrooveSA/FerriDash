# FerriDash – School Management for South Africa

A multi-school management system for South African public and independent schools, Grade R to Grade 12.
It covers learners, educators, parents, attendance, **CAPS results**, **report generation**, **class timetables**,
assignments, school expenses in **ZAR**, notices, calendar and messaging, with a modern glass interface in light and dark mode.

Copyright © Infinite Q Graphics

**Live:** https://ferridash.autogration.co.za (Vercel, region Paris, deploys automatically from `main`; also at https://ferri-dash.vercel.app). Android and iOS
apps in `mobile/` open the same site.

## Database: Supabase (PostgreSQL)

FerriDash stores everything in Supabase: PostgreSQL for the data, and uploaded logos,
profile photos and expense PDFs in a private Storage bucket (`ferridash-uploads`, created on first upload).

`.env.local` (never committed) holds:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase connection string, transaction pooler (port 6543). Percent-encode special characters in the password (`@` is `%40`). |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | For Storage (server side only, never sent to browsers) |
| `SESSION_SECRET` | Long random string that signs session cookies; use a new one per installation |

Row-level security is on for every table with no policies, so Supabase's public API exposes nothing; the app connects
as the database owner and scopes every query to the signed-in user's school.

### Go live with an empty database

1. Put the variables above in `.env.local` (and in your host's environment settings).
2. Create the first platform administrator. This also creates the tables if the database is empty. It asks for name,
   email and password (hidden, at least 12 characters); there are no demo accounts:

   ```bash
   npm run db:admin
   ```

3. `npm run build` then `npm start` (or deploy to your host), sign in, and add the first school under **Dashboard**.

### Commands

```bash
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3100 (uses the database in `.env.local`) |
| `npm run build` then `npm start` | Production build and server |
| `npm run db:admin` | Create a platform administrator (`-- --another` to add one more) |
| `npm run db:password` | After changing the database password in Supabase: update it in `.env.local` (tests it first, then copies the new `DATABASE_URL` for Vercel) |
| `npm run typecheck` | TypeScript check |
| `node scripts/smoke.mjs <address>` | Loads every page as every role and checks role restrictions |

`.env.local` points at the live database, so `npm run dev` works on real school data. For development, create a
second Supabase project and use its connection string instead. `DB_DEBUG=1` logs failing SQL to the server log.

## Roles

| Role | Can do |
|---|---|
| **Platform admin** | Manages schools only: a dashboard to add, edit, suspend and reactivate schools, add school admins and reset their passwords. No access to anything inside a school (learners, results, finance, messages) |
| **School admin** | Everything in their school: staff, learners, parents, classes, allocation, moderation and publishing, finance, settings |
| **Educator** | Registers for their classes, mark capture for subjects they teach, reports for their classes, assignments, timetables, notices, calendar |
| **Learner** | Own dashboard, published results and report cards, attendance, assignments, timetable, messages to staff |
| **Parent** | Their own children only: published results, report cards, attendance, assignments, timetable, messages to staff |

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
2. Type the year to confirm. FerriDash then records every learner's class and outcome for the year, creates next year's classes (8A → 9A; same subjects, teachers and register teachers), moves learners, marks graduates, copies term dates, and moves the school to Term 1 of the new year.
3. Past report cards stay available: choose the year under **Report cards**. Graduates and their parents can still open them.

Back up the `data` folder before running it; it cannot be undone.

## School logo and profile photos

- **School logo**: school admins upload or remove it under **Settings** (no other role can). After sign-in it appears on every role's dashboard, in the sidebar, and on report cards. The sign-in page stays generic because all schools share it; its animated dawn-sky background (midnight blue to a tangerine sunrise) shows rising education symbols, an orbiting atom, a learning path and twinkling stars for the future.
- **Profile photos**: every user can upload one under **Profile**.
- Images are resized in the browser and stored in Supabase Storage (`data/uploads` when no Supabase keys are set). Logos are public; profile photos are only visible to signed-in users of the same school.

## South African details

ZAR currency (`en-ZA` formatting), SA ID number validation (Luhn check, with date of birth and gender read from the ID),
EMIS numbers, quintiles, the nine provinces, no-fee schools, PERSAL and SACE numbers, the 11 official spoken
languages, four-term calendar, and a POPIA privacy notice.

## Architecture

- **Next.js 15 (App Router) + React 19 + TypeScript**, server components and server actions
- **Tailwind CSS 4** glass design system (`app/globals.css`) in a sunrise palette (tangerine, sunshine yellow and warm charcoal): `.glass`, `.glass-strong`, `.glass-solid`, light and dark
  themes, and support for `prefers-reduced-transparency` and `prefers-reduced-motion`
- **PostgreSQL / Supabase** via `postgres` (`db/schema.pg.sql`, `lib/db.ts`). Every tenant table carries `school_id`; all
  queries are scoped to the signed-in user's school. Files are in Supabase Storage (`lib/storage.ts`).
- **Auth**: bcrypt password hashes, signed JWT session cookie (`jose`), middleware guard, a role check in every page
  and action, login throttling, audit log
- **Charts**: Recharts. **PDF**: browser print with dedicated print styles (works offline).

```
app/(app)/        authenticated pages (dashboard, results, reports, finance, ...)
app/actions/      server actions (all mutations, each role-checked)
lib/caps.ts       CAPS levels, weighting, promotion rules
lib/results.ts    term/year marks, rankings, class results
components/       shell, UI kit, charts, report card
db/schema.pg.sql  database schema
scripts/          admin bootstrap, database password helper, smoke test
```

## Suggested next steps

1. Bulk CSV/Excel import for learners, staff and marks (SA-SAMS export)
2. SMS/WhatsApp/email notifications to parents (needs an online gateway)
3. Move to PostgreSQL (Supabase) for multi-school hosting, with row-level security as a second safety net
4. Timetabling, and an SBA-compliant assessment programme per subject
5. Installable PWA with offline mark capture and sync
