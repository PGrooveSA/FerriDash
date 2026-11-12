import Link from "next/link";
import { requireChildcare, allergiesOf } from "@/lib/childcare";
import { ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate, zar } from "@/lib/format";
import { today } from "@/lib/today";
import { ageGroupLabel } from "@/lib/org";
import { Card, PageHeader, Pager, TableWrap, Empty, StatusChip, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import Avatar from "@/components/ui/Avatar";
import { AllergyChips, ageText, todayStatus } from "@/components/childcare";
import { saveLearner, deleteLearner } from "@/app/actions/people";
import LeaveButton from "@/components/LeaveButton";
import { feesOn } from "@/lib/fees";

export const metadata = { title: "Children" };
const PER_PAGE = 15;
const LANGS = ["English", "Afrikaans", "isiZulu", "isiXhosa", "Sepedi", "Setswana", "Sesotho", "Xitsonga", "siSwati", "Tshivenda", "isiNdebele"];

type C = { id: number; first_name: string; last_name: string; admission_number: string; id_number: string | null; gender: string | null; date_of_birth: string | null; class_id: number | null;
  className: string | null; age_group: string | null; fee_plan_id: number | null; plan: string | null; home_language: string | null; address: string | null; status: string; parents: string | null;
  in_at: string | null; out_at: string | null };

export default async function ChildrenPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireChildcare(["school_admin", "teacher", "parent"]);
  const sp = await searchParams, t = today();
  const own = await ownLearnerIds(ctx);
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1), room = Number(sp.room) || 0;
  const status = ["Active", "Withdrawn", "Graduated", "Transferred", "all"].includes(sp.status ?? "") ? sp.status! : "Active";
  // Parents see only their own children; staff see the whole centre.
  const mine = own ? `AND l.id IN (${own.length ? own.join(",") : "0"})` : "";
  const where = `l.school_id = ?1 AND (?2 = 0 OR l.class_id = ?2) AND (?3 = '' OR l.first_name || ' ' || l.last_name LIKE '%' || ?3 || '%' OR l.admission_number LIKE '%' || ?3 || '%') AND (?4 = 'all' OR l.status = ?4) ${mine}`;
  const args = [ctx.schoolId, room, q, own ? "all" : status] as const;
  const total = (await get<{ n: number }>(`SELECT COUNT(*) n FROM learners l WHERE ${where}`, ...args))!.n;
  const rows = await all<C>(`
    SELECT l.id, l.first_name, l.last_name, l.admission_number, l.id_number, l.gender, l.date_of_birth, l.class_id, l.fee_plan_id, l.home_language, l.address, l.status,
      c.name className, c.age_group, fp.name plan, k.in_at, k.out_at,
      (SELECT string_agg(u.first_name || ' ' || u.last_name || ' (' || COALESCE(u.phone, u.email) || ')', '; ') FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = l.id) parents
    FROM learners l LEFT JOIN classes c ON c.id = l.class_id LEFT JOIN fee_plans fp ON fp.id = l.fee_plan_id LEFT JOIN checkins k ON k.learner_id = l.id AND k.date = ?7
    WHERE ${where} ORDER BY c.name NULLS FIRST, l.first_name, l.last_name LIMIT ?5 OFFSET ?6`, ...args, PER_PAGE, (page - 1) * PER_PAGE, t);
  const allergies = await allergiesOf(rows.map((r) => r.id));
  const rooms = await all<{ id: number; name: string }>("SELECT id, name FROM classes WHERE school_id = ? AND year = ? ORDER BY name", ctx.schoolId, ctx.school.current_year);
  const plans = await all<{ id: number; name: string; monthly: number }>("SELECT id, name, monthly FROM fee_plans WHERE school_id = ? ORDER BY monthly DESC", ctx.schoolId);
  const next = `${ctx.school.current_year}-${String(((await get<{ n: number }>("SELECT COUNT(*) n FROM learners WHERE school_id = ?", ctx.schoolId))!.n + 1)).padStart(4, "0")}`;

  const fields = (c?: C): Field[] => [
    { name: "first_name", label: "First name(s)", required: true, defaultValue: c?.first_name, half: true },
    { name: "last_name", label: "Surname", required: true, defaultValue: c?.last_name, half: true },
    { name: "date_of_birth", label: "Date of birth", type: "date", required: true, defaultValue: c?.date_of_birth, half: true },
    { name: "gender", label: "Gender", type: "select", options: ["Female", "Male", "Other"].map((v) => ({ value: v, label: v })), defaultValue: c?.gender, half: true },
    { name: "class_id", label: "Classroom", type: "select", options: rooms.map((r) => ({ value: r.id, label: r.name })), defaultValue: c?.class_id, half: true },
    { name: "fee_plan_id", label: "Fee plan", type: "select", options: plans.map((p) => ({ value: p.id, label: `${p.name} (${zar(p.monthly, true)}/month)` })), defaultValue: c?.fee_plan_id, half: true,
      help: plans.length ? undefined : "Add fee plans under Finance → Fees Collection." },
    { name: "admission_number", label: "Child number", required: true, defaultValue: c?.admission_number ?? next, half: true },
    { name: "id_number", label: "Birth certificate / ID number", defaultValue: c?.id_number, half: true },
    { name: "home_language", label: "Home language", type: "select", options: LANGS.map((v) => ({ value: v, label: v })), defaultValue: c?.home_language, half: true },
    { name: "address", label: "Home address", defaultValue: c?.address, half: true },
    ...(c ? [{ name: "status", label: "Status", type: "select", required: true, options: [{ value: "Active", label: "Active" }, { value: "Withdrawn", label: "Left the centre" }, { value: "Graduated", label: "Went to school" }, { value: "Transferred", label: "Moved to another centre" }], defaultValue: c.status } as Field] : []),
    { name: "parent_email", label: "Parent / guardian email", type: "email", half: true, help: "Links an existing parent, or creates their FerriDash account so they can follow their child." },
    { name: "relationship", label: "Relationship", type: "select", options: ["Mother", "Father", "Guardian", "Grandparent", "Foster parent"].map((v) => ({ value: v, label: v })), half: true },
    { name: "parent_first_name", label: "Parent first name", half: true },
    { name: "parent_last_name", label: "Parent surname", half: true },
    { name: "parent_phone", label: "Parent cell number", type: "tel", half: true },
    { name: "parent_password", label: "Parent's initial password", type: "password", half: true },
  ];

  if (own) {
    // A parent: a card per child, opening their profile.
    return (
      <>
        <PageHeader title="My children" subtitle={ctx.school.name} />
        {rows.length === 0 ? <Card><Empty title="No children linked to your account" hint="Ask the centre to link your child to your email address." /></Card> : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((c) => {
              const st = todayStatus(c);
              return (
                <Link key={c.id} href={`/children/${c.id}`} className="glass tile relative overflow-hidden p-5 block">
                  <div className="flex items-center gap-3">
                    <Avatar first={c.first_name} last={c.last_name} size={48} />
                    <div className="min-w-0"><p className="font-semibold text-lg">{c.first_name} {c.last_name}</p><p className="text-sm muted">{ageText(c.date_of_birth, t)} · {c.className ?? "No classroom yet"}</p></div>
                  </div>
                  <p className="mt-3"><span className={`chip ${st.tone}`}>{st.label}</span></p>
                  <div className="mt-2"><AllergyChips allergies={allergies.filter((a) => a.learner_id === c.id)} /></div>
                </Link>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Children" subtitle={`${total} child${total === 1 ? "" : "ren"}${room ? "" : " at the centre"}`}>
        <Filters search={{ name: "q", placeholder: "Search name or child number", value: q }}
          filters={[{ name: "room", label: "Classroom", allLabel: "All classrooms", value: room || "", options: rooms.map((r) => ({ value: r.id, label: r.name })) },
            { name: "status", label: "Status", value: status, options: [{ value: "Active", label: "Current children" }, { value: "all", label: "Everyone (incl. past)" }] }]} />
        {ctx.isAdmin && <FormDialog title="Register a child" triggerLabel="Register child" fields={fields()} action={saveLearner} size="lg" />}
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty title="No children found" hint={ctx.isAdmin && !q ? "Register a child, then add their allergies and who may collect them on their profile." : undefined} /> : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Child</th><th>Age</th><th>Classroom</th><th>Allergies</th><th>Today</th><th>Parents</th>{ctx.isAdmin && <th>Fee plan</th>}{ctx.isAdmin && <th className="text-right">Action</th>}</tr></thead>
              <tbody>
                {rows.map((c) => {
                  const st = todayStatus(c);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar first={c.first_name} last={c.last_name} size={38} />
                          <div><Link href={`/children/${c.id}`} className="font-semibold hover:underline">{c.first_name} {c.last_name}</Link>
                            <p className="text-xs muted font-mono">{c.admission_number}{c.status !== "Active" && <span className="ml-2"><StatusChip status={c.status} /></span>}</p></div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-sm">{ageText(c.date_of_birth, t)}<p className="text-xs muted">{fmtDate(c.date_of_birth)}</p></td>
                      <td>{c.className ? <Link className="hover:underline" href={`/children?room=${c.class_id}`}>{c.className}</Link> : <span className="muted">-</span>}<p className="text-xs muted">{c.age_group ? ageGroupLabel(c.age_group) : ""}</p></td>
                      <td className="max-w-[14rem]"><AllergyChips allergies={allergies.filter((a) => a.learner_id === c.id)} compact />{!allergies.some((a) => a.learner_id === c.id) && <span className="text-xs muted">None recorded</span>}</td>
                      <td><span className={`chip ${st.tone}`}>{st.label}</span></td>
                      <td className="text-xs max-w-[14rem]">{c.parents ?? <span className="muted">None linked</span>}</td>
                      {ctx.isAdmin && <td className="text-sm">{c.plan ?? <span className="text-rose-600 text-xs">No plan</span>}</td>}
                      {ctx.isAdmin && (
                        <td><div className="flex justify-end gap-1.5">
                          <Link href={`/children/${c.id}`} className="btn btn-ghost btn-sm">Profile</Link>
                          <FormDialog trigger="edit" title={`Edit ${c.first_name}`} fields={fields(c)} hidden={{ id: c.id }} action={saveLearner} size="lg" />
                          {c.status === "Active" && <LeaveButton id={c.id} name={c.first_name} childcare fees={feesOn(ctx.school)} />}
                          <DeleteButton action={deleteLearner.bind(null, c.id)} label={`${c.first_name} ${c.last_name}`} confirmText={`Permanently delete ${`${c.first_name} ${c.last_name}`}? Their marks, attendance, fee statements and payments are erased too, and this cannot be undone.\n\nIf they left, cancel and use "Leaves" instead: the record is kept under Past children.`} />
                        </div></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/children", sp, { page: p })} />
      </Card>
    </>
  );
}
