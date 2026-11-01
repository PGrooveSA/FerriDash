import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all } from "@/lib/db";
import { fmtDate, gradeLabel } from "@/lib/format";
import { today } from "@/lib/today";
import { Card, PageHeader, Empty, StatusChip, StatCard } from "@/components/ui/kit";
import { FormDialog, Filters, CsvButton, ConfirmButton } from "@/components/ui/forms";
import { saveReenrolment, remindReenrolment, answerReenrolment } from "@/app/actions/admissions";
import { UserCheck, UserX, HelpCircle, Clock } from "lucide-react";
import ReenrolForm from "./ReenrolForm";

export const metadata = { title: "Re-enrolment" };

type R = { id: number; first_name: string; last_name: string; admission_number: string; className: string | null; grade: number | null; status: string | null; reason: string | null; responded_at: string | null; parents: string | null };

export default async function ReenrolPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin", "parent"]);
  const s = ctx.school, next = s.current_year + 1, year = s.reenrol_year;

  // ---- Parents: one answer per child ----
  if (!ctx.isAdmin) {
    if (!year) return <><PageHeader title="Re-enrolment" /><Card><Empty title="Re-enrolment is not open" hint="The school will let you know when it opens." /></Card></>;
    const ids = (await ownLearnerIds(ctx)) ?? [];
    const kids = ids.length ? await all<R>(`SELECT l.id, l.first_name, l.last_name, l.admission_number, c.name className, c.grade, r.status, r.reason, r.responded_at, NULL parents
      FROM learners l LEFT JOIN classes c ON c.id = l.class_id LEFT JOIN reenrolments r ON r.learner_id = l.id AND r.year = ? WHERE l.id IN (${ids.map(() => "?").join(",")}) AND l.status = 'Active' AND COALESCE(c.grade, 0) < 12 ORDER BY l.first_name`, year, ...ids) : [];
    const closed = !!s.reenrol_deadline && today() > s.reenrol_deadline;
    return (
      <>
        <PageHeader title={`Re-enrolment for ${year}`} subtitle={s.reenrol_deadline ? `Please answer by ${fmtDate(s.reenrol_deadline)}.` : "Please let the school know whether each child will return next year."} />
        {/* Grade 12s finish school this year, so there is nothing to ask about them. */}
        {kids.length === 0 ? <Card><Empty title="Nothing to answer" hint="Your children are finishing Grade 12 this year, or none are linked to your account." /></Card> : (
          <div className="grid md:grid-cols-2 gap-5">
            {kids.map((k) => (
              <Card key={k.id} title={`${k.first_name} ${k.last_name}`}>
                <p className="text-sm muted mb-3">{k.grade != null ? `${gradeLabel(k.grade)} · ${k.className}` : ""}</p>
                {k.status && <p className="text-sm mb-3">Your answer: <StatusChip status={k.status} /> <span className="muted">{fmtDate(k.responded_at?.slice(0, 10))}</span></p>}
                {closed ? <p className="text-sm muted">The closing date has passed. Please contact the school office to change your answer.</p>
                  : <ReenrolForm learnerId={k.id} status={k.status} reason={k.reason} year={year} />}
              </Card>
            ))}
          </div>
        )}
      </>
    );
  }

  // ---- School admin ----
  const sp = await searchParams;
  const show = sp.status ?? "";
  const rows = year ? await all<R>(`
    SELECT l.id, l.first_name, l.last_name, l.admission_number, c.name className, c.grade, r.status, r.reason, r.responded_at,
      (SELECT string_agg(u.first_name || ' ' || u.last_name || COALESCE(' ' || u.phone, ''), ', ') FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = l.id) parents
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id LEFT JOIN reenrolments r ON r.learner_id = l.id AND r.year = ?1
    WHERE l.school_id = ?2 AND l.status = 'Active' AND COALESCE(c.grade, 0) < 12
    ORDER BY c.grade, c.name, l.last_name, l.first_name`, year, ctx.schoolId) : [];
  const count = (st: string | null) => rows.filter((r) => r.status === st).length;
  const shown = rows.filter((r) => !show || (show === "none" ? !r.status : r.status === show));
  const csv = [["Learner", "Admission no.", "Class", "Answer", "Reason", "Answered", "Parents"], ...shown.map((r) => [`${r.first_name} ${r.last_name}`, r.admission_number, r.className, r.status ?? "No answer", r.reason, r.responded_at?.slice(0, 10) ?? "", r.parents])];

  return (
    <>
      <PageHeader title="Re-enrolment" subtitle={year ? `Who returns in ${year}${s.reenrol_deadline ? ` · closes ${fmtDate(s.reenrol_deadline)}` : ""}` : `Ask parents whether their children return in ${next}`}>
        {year && <Filters filters={[{ name: "status", label: "Answer", value: show, allLabel: "All answers", options: [{ value: "Returning", label: "Returning" }, { value: "Leaving", label: "Leaving" }, { value: "Unsure", label: "Unsure" }, { value: "none", label: "No answer yet" }] }]} />}
        {year && <CsvButton filename={`re-enrolment-${year}.csv`} rows={csv} />}
        {year && count(null) > 0 && <ConfirmButton action={remindReenrolment} label="Remind non-responders" confirmText="Send a phone notification to every parent who hasn't answered yet?" />}
        <FormDialog trigger={year ? "button" : "add"} triggerLabel={year ? "Re-enrolment settings" : `Open re-enrolment for ${next}`} title={`Re-enrolment for ${next}`} action={saveReenrolment} fields={[
          { name: "open", label: "Re-enrolment", type: "select", required: true, defaultValue: year ? 1 : 1, options: [{ value: 1, label: "Open: parents answer in FerriDash" }, { value: 0, label: "Closed" }], half: true },
          { name: "deadline", label: "Closing date", type: "date", defaultValue: s.reenrol_deadline, half: true, help: "Opening it notifies every parent on the FerriDash app. Grade 12 learners are left out." },
        ]} />
      </PageHeader>
      {!year ? <Card><Empty title="Re-enrolment is closed" hint={`Open it to ask every family whether their children will return in ${next}. Parents answer in FerriDash; you see the answers here and can plan classes and fees for next year.`} /></Card> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Returning" value={count("Returning")} icon={UserCheck} tone="green" hint={rows.length ? `${Math.round((count("Returning") / rows.length) * 100)}% of learners` : undefined} />
            <StatCard label="Leaving" value={count("Leaving")} icon={UserX} tone="orange" />
            <StatCard label="Unsure" value={count("Unsure")} icon={HelpCircle} tone="gold" />
            <StatCard label="No answer yet" value={count(null)} icon={Clock} tone="sky" />
          </div>
          <Card>
            {shown.length === 0 ? <Empty title="Nobody here" /> : (
              <div className="overflow-x-auto"><table className="table">
                <thead><tr><th>Learner</th><th>Class</th><th>Answer</th><th>Reason</th><th>Parents</th><th className="text-right" /></tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.id}>
                    <td><p className="font-medium">{r.first_name} {r.last_name}</p><p className="text-xs muted font-mono">{r.admission_number}</p></td>
                    <td>{r.className ?? "-"}</td>
                    <td><StatusChip status={r.status ?? "No answer"} />{r.responded_at && <p className="text-xs muted">{fmtDate(r.responded_at.slice(0, 10))}</p>}</td>
                    <td className="text-sm max-w-xs">{r.reason ?? ""}</td>
                    <td className="text-xs muted max-w-[14rem]">{r.parents ?? "No parent linked"}</td>
                    <td className="text-right"><FormDialog trigger="button" triggerLabel="Record" title={`Re-enrolment · ${r.first_name} ${r.last_name}`} hidden={{ learner_id: r.id }} action={answerReenrolment} fields={[
                      { name: "status", label: "Answer", type: "select", required: true, defaultValue: r.status ?? "Returning", options: ["Returning", "Leaving", "Unsure"].map((v) => ({ value: v, label: v })) },
                      { name: "reason", label: "Reason / new school", type: "textarea", defaultValue: r.reason, help: "For an answer given at the office or by phone." },
                    ]} /></td>
                  </tr>))}
                </tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
