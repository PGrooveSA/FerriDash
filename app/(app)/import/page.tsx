import { requireCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { IMPORT_TEMPLATES } from "@/lib/importer";
import { PageHeader } from "@/components/ui/kit";
import ImportStep from "./ImportStep";

export const metadata = { title: "Import data" };

export default async function ImportPage() {
  const ctx = await requireCtx(["school_admin"]);
  const year = ctx.school.current_year;
  const n = async (sql: string, ...p: (string | number)[]) => (await get<{ n: number }>(sql, ...p))!.n;
  const counts = {
    teachers: await n("SELECT COUNT(*) n FROM teachers WHERE school_id = ? AND status = 'Active'", ctx.schoolId),
    classes: await n("SELECT COUNT(*) n FROM classes WHERE school_id = ? AND year = ?", ctx.schoolId, year),
    learners: await n("SELECT COUNT(*) n FROM learners WHERE school_id = ? AND status = 'Active'", ctx.schoolId),
  };
  return (
    <>
      <PageHeader title="Import data" subtitle={`Load ${ctx.school.name}'s records from CSV files. Each file is checked first and nothing is saved until you confirm. Importing a file again updates records instead of duplicating them.`} />
      <div className="space-y-6">
        <ImportStep step={1} kind="teachers" title="Teachers" template={IMPORT_TEMPLATES.teachers} current={`${counts.teachers} current teachers`}
          hint="Matched on email, which is each teacher's login. New teachers get a temporary password." />
        <ImportStep step={2} kind="classes" title="Classes & subjects" template={IMPORT_TEMPLATES.classes} current={`${counts.classes} classes in ${year}`}
          hint={`One row per subject per class. Classes are created for ${year}. Teacher emails must already be imported.`} />
        <ImportStep step={3} kind="learners" title="Learners & parents" template={IMPORT_TEMPLATES.learners} current={`${counts.learners} current learners`}
          hint="Matched on admission number. Up to two parents per learner; a parent email used on several rows becomes one account linked to each child." />
      </div>
      <p className="text-xs muted mt-6">
        Dates use YYYY-MM-DD. In Excel, set the ID number, PERSAL, SACE and cell columns to Text before typing, or Excel changes ID numbers to 1.2E+12.
        Save as &quot;CSV UTF-8 (comma delimited)&quot;.
      </p>
    </>
  );
}
