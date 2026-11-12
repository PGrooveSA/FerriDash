import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { isChildcare } from "@/lib/org";
import { LEFT_STATUSES, leftLabel } from "@/lib/leavers";
import { Card, PageHeader, Pager, TableWrap, Empty, hrefWith } from "@/components/ui/kit";
import { Filters, ConfirmButton, DeleteButton, CsvButton } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { readmit } from "@/app/actions/leavers";
import { deleteLearner } from "@/app/actions/people";

export const metadata = { title: "Passed Out Archive" };
const PER_PAGE = 20;

type P = { id: number; first_name: string; last_name: string; admission_number: string; status: string; left_on: string | null; left_reason: string | null;
  className: string | null; enrolled_on: string | null; outcome: string | null; parents: string | null; logins_on: number };

/**
 * Everyone who has left (graduated, transferred, withdrawn): their records stay, read-only, with when and why they
 * left. They can be re-admitted. Their own and their parents' logins are off (lib/leavers.ts).
 */
export default async function PastPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const childcare = isChildcare(ctx.school);
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1);
  const status = ["Graduated", "Transferred", "Withdrawn"].includes(sp.status ?? "") ? sp.status! : "";
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : "";
  const where = `l.school_id = ?1 AND l.status <> 'Active' AND (?2 = '' OR l.status = ?2) AND (?3 = '' OR substr(COALESCE(l.left_on, ''), 1, 4) = ?3)
    AND (?4 = '' OR l.first_name || ' ' || l.last_name LIKE '%' || ?4 || '%' OR l.admission_number LIKE '%' || ?4 || '%')`;
  const args = [ctx.schoolId, status, year, q] as const;
  const total = (await get<{ n: number }>(`SELECT COUNT(*) n FROM learners l WHERE ${where}`, ...args))!.n;
  const rows = await all<P>(`
    SELECT l.id, l.first_name, l.last_name, l.admission_number, l.status, l.left_on, l.left_reason, l.enrolled_on, c.name className,
      (SELECT e.outcome_note FROM enrolments e WHERE e.learner_id = l.id ORDER BY e.year DESC LIMIT 1) outcome,
      (SELECT string_agg(u.first_name || ' ' || u.last_name, ', ') FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = l.id) parents,
      (SELECT COUNT(*) FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = l.id AND u.active = 1) logins_on
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE ${where}
    ORDER BY l.left_on DESC NULLS LAST, l.last_name, l.first_name LIMIT ?5 OFFSET ?6`, ...args, PER_PAGE, (page - 1) * PER_PAGE);
  const years = await all<{ y: string }>("SELECT DISTINCT substr(left_on, 1, 4) y FROM learners WHERE school_id = ? AND status <> 'Active' AND left_on IS NOT NULL ORDER BY y DESC", ctx.schoolId);
  const who = childcare ? "children" : "learners";
  const record = (id: number) => (childcare ? `/children/${id}` : `/learners/${id}`);
  const csv = [[childcare ? "Child" : "Learner", childcare ? "Child no." : "Admission no.", childcare ? "Last classroom" : "Last class", "Status", "Joined", "Last day", "Reason / outcome", "Parents"],
    ...rows.map((r) => [`${r.first_name} ${r.last_name}`, r.admission_number, r.className, leftLabel(r.status, childcare), r.enrolled_on, r.left_on, r.left_reason ?? r.outcome, r.parents])];

  return (
    <>
      <PageHeader title="Passed Out Archive"
        subtitle={`${total} ${total === 1 ? (childcare ? "child" : "learner") : who} who left. Records are kept; their logins and their parents' are switched off.`}>
        <Filters search={{ name: "q", placeholder: "Search name or number", value: q }}
          filters={[{ name: "status", label: "Status", value: status, allLabel: "All reasons", options: LEFT_STATUSES[childcare ? "childcare" : "school"] },
            { name: "year", label: "Year left", value: year || "", allLabel: "Any year", options: years.map((y) => ({ value: y.y, label: y.y })) }]} />
        {rows.length > 0 && <CsvButton filename={`past-${who}.csv`} rows={csv} />}
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty title={`No past ${who}`} hint={`When someone leaves, use "Leaves" on the ${childcare ? "Children" : "Learners"} page. They appear here with their full record.`} /> : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>{childcare ? "Child" : "Learner"}</th><th>{childcare ? "Last classroom" : "Last class"}</th><th>Left</th><th>Reason / outcome</th><th>Parents</th><th className="text-right">Action</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="flex items-center gap-3"><Avatar first={r.first_name} last={r.last_name} size={36} />
                    <div><Link href={record(r.id)} className="font-semibold hover:underline">{r.first_name} {r.last_name}</Link><p className="text-xs muted font-mono">{r.admission_number}</p></div></div></td>
                  <td>{r.className ?? "-"}{r.enrolled_on && <p className="text-xs muted">Joined {fmtDate(r.enrolled_on)}</p>}</td>
                  <td className="whitespace-nowrap"><span className="chip chip-slate">{leftLabel(r.status, childcare)}</span><p className="text-xs muted mt-0.5">{r.left_on ? fmtDate(r.left_on) : "Date not recorded"}</p></td>
                  <td className="text-sm max-w-[16rem]">{r.left_reason ?? r.outcome ?? <span className="muted">-</span>}</td>
                  <td className="text-xs">{r.parents ?? <span className="muted">None linked</span>}{r.parents && <p className="muted">{r.logins_on ? "Login still on (another current child)" : "Login off"}</p>}</td>
                  <td><div className="flex justify-end gap-1.5">
                    <Link href={record(r.id)} className="btn btn-ghost btn-sm">Record</Link>
                    <ConfirmButton action={readmit.bind(null, r.id)} label="Re-admit"
                      confirmText={`Re-admit ${r.first_name} ${r.last_name}? They become a current ${childcare ? "child" : "learner"} again, their and their parents' logins are switched back on, and fees are billed from the current instalment.`} />
                    <DeleteButton action={deleteLearner.bind(null, r.id)} label={`${r.first_name} ${r.last_name}`}
                      confirmText={`Permanently delete ${r.first_name} ${r.last_name}'s record? Their marks, attendance, fee statements and payments are erased too, and this cannot be undone. Keep the record unless it was added by mistake.`} />
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/past", sp, { page: p })} />
      </Card>
    </>
  );
}
