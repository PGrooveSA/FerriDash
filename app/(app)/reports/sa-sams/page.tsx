import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { gradeLabel } from "@/lib/format";
import { capsLevel } from "@/lib/caps";
import { classResults, parsePeriod, periodLabel } from "@/lib/results";
import { Card, PageHeader, StatCard } from "@/components/ui/kit";
import { Filters, CsvButton } from "@/components/ui/forms";
import { Users, BookOpen, Database } from "lucide-react";

export const metadata = { title: "SA-SAMS export" };

/**
 * Learner details and term marks as spreadsheets laid out with SA-SAMS's field names, so the office can bring
 * them into SA-SAMS (or check them against it) instead of capturing everything twice.
 */
export default async function SaSamsExport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const year = ctx.school.current_year;
  const period = parsePeriod(sp.term, Math.max(1, ctx.school.current_term - 1));
  const publishedOnly = sp.results !== "all";

  const learners = await all<{ id: number; admission_number: string; first_name: string; last_name: string; id_number: string | null; date_of_birth: string | null; gender: string | null;
    home_language: string | null; address: string | null; enrolled_on: string | null; grade: number | null; className: string | null;
    p_title: string | null; p_first: string | null; p_last: string | null; p_phone: string | null; p_email: string | null; relationship: string | null }>(`
    SELECT l.id, l.admission_number, l.first_name, l.last_name, l.id_number, l.date_of_birth, l.gender, l.home_language, l.address, l.enrolled_on, c.grade, c.name className,
      u.title p_title, u.first_name p_first, u.last_name p_last, u.phone p_phone, u.email p_email, g.relationship
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id
    LEFT JOIN LATERAL (SELECT parent_user_id, relationship FROM guardian_links WHERE learner_id = l.id ORDER BY parent_user_id LIMIT 1) g ON TRUE
    LEFT JOIN users u ON u.id = g.parent_user_id
    WHERE l.school_id = ? AND l.status = 'Active' ORDER BY c.grade, c.name, l.last_name, l.first_name`, ctx.schoolId);
  const learnerCsv = [
    ["Admission No", "Surname", "First Names", "ID Number", "Date of Birth", "Gender", "Grade", "Class", "Home Language", "Date of Admission", "Residential Address",
      "Parent Title", "Parent Surname", "Parent First Names", "Relationship", "Parent Cell No", "Parent E-mail"],
    ...learners.map((l) => [l.admission_number, l.last_name, l.first_name, l.id_number, l.date_of_birth, l.gender === "Male" ? "M" : l.gender === "Female" ? "F" : "",
      l.grade == null ? "" : l.grade === 0 ? "R" : l.grade, l.className, l.home_language, l.enrolled_on, l.address,
      l.p_title, l.p_last, l.p_first, l.relationship, l.p_phone, l.p_email]),
  ];

  // Marks: one row per learner per subject, with the percentage and the CAPS achievement level (1-7).
  const classes = await all<{ id: number }>("SELECT id FROM classes WHERE school_id = ? AND year = ? ORDER BY grade, name", ctx.schoolId, year);
  const marksCsv: (string | number | null)[][] = [["Admission No", "Surname", "First Names", "Grade", "Class", "Subject Code", "Subject", "Term", "Mark %", "Achievement Level"]];
  let subjects = 0;
  for (const c of classes) {
    const cr = await classResults(ctx.schoolId, c.id, year, period, { publishedOnly });
    if (!cr) continue;
    subjects += cr.subjects.length;
    for (const l of cr.learners) for (const s of cr.subjects) {
      const v = l.pct[s.csId];
      if (v == null) continue;
      marksCsv.push([l.admission_number, l.last_name, l.first_name, cr.grade === 0 ? "R" : cr.grade, cr.className, s.code, s.name, period === "year" ? "Final" : period, v, capsLevel(v)?.level ?? ""]);
    }
  }
  const missingId = learners.filter((l) => !l.id_number).length, unplaced = learners.filter((l) => l.grade == null).length;

  return (
    <>
      <PageHeader title="SA-SAMS export" subtitle={`${year} · spreadsheets with SA-SAMS field names, so nothing is captured twice`}>
        <Filters filters={[
          { name: "term", label: "Marks for", value: String(period), options: [...[1, 2, 3, 4].map((t) => ({ value: String(t), label: `Term ${t}` })), { value: "year", label: "Final (year)" }] },
          { name: "results", label: "Results", value: publishedOnly ? "" : "all", options: [{ value: "", label: "Published results only" }, { value: "all", label: "All captured marks" }] },
        ]} />
      </PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active learners" value={learners.length} icon={Users} tone="sky" hint={`${missingId} without an ID number · ${unplaced} not in a class`} />
        <StatCard label={`Marks · ${periodLabel(period)}`} value={(marksCsv.length - 1).toLocaleString("en-ZA")} icon={BookOpen} tone="gold" hint={`${subjects} class subjects · ${publishedOnly ? "published only" : "including unpublished"}`} />
        <StatCard label="Classes" value={classes.length} icon={Database} tone="green" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Learner and parent details">
          <p className="text-sm muted mb-4">Every active learner with grade, class, home language, admission date and the first linked parent&apos;s contact details. Use it to check or update learner records in SA-SAMS.</p>
          <CsvButton filename={`SA-SAMS learners ${year}.csv`} rows={learnerCsv} label="Download learners (CSV)" />
        </Card>
        <Card title={`Marks · ${periodLabel(period)}`}>
          <p className="text-sm muted mb-4">Each learner&apos;s percentage and CAPS achievement level per subject, for capturing the term&apos;s marks in SA-SAMS (Curriculum → Assessment) or comparing with it.</p>
          <CsvButton filename={`SA-SAMS marks ${year} ${periodLabel(period)}.csv`} rows={marksCsv} label="Download marks (CSV)" />
        </Card>
      </div>
      <p className="text-xs muted mt-6">The files open in Excel. Column names follow SA-SAMS&apos;s learner and assessment fields; check them against the import screen of your SA-SAMS version before importing, and keep SA-SAMS for the Department&apos;s returns (LURITS, surveys). {gradeLabel(0)} is written as &quot;R&quot;.</p>
    </>
  );
}
