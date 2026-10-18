import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { today } from "@/lib/today";
import { Card, PageHeader, Pager, Empty, StatusChip, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import { saveBook, deleteBook, issueBook, returnBook } from "@/app/actions/content";

export const metadata = { title: "Library" };
const PER_PAGE = 10;
type B = { id: number; code: string; title: string; author: string | null; subject: string | null; grades: string | null; publish_year: number | null; copies: number; out: number };
const COVERS = ["from-rose-400 to-rose-600", "from-pink-400 to-rose-600", "from-amber-300 to-orange-500", "from-emerald-400 to-teal-600", "from-amber-500 to-orange-700", "from-slate-500 to-slate-800"];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1), avail = sp.status ?? "";
  const staff = ctx.isAdmin || ctx.user.role === "teacher";
  const base = `SELECT b.*, (SELECT COUNT(*) FROM book_loans l WHERE l.book_id = b.id AND l.returned_on IS NULL) out FROM books b
    WHERE b.school_id = ?1 AND (?2 = '' OR b.title LIKE '%' || ?2 || '%' OR b.code LIKE '%' || ?2 || '%' OR b.subject LIKE '%' || ?2 || '%' OR b.author LIKE '%' || ?2 || '%')`;
  const filter = avail === "available" ? "WHERE out < copies" : avail === "out" ? "WHERE out >= copies" : "";
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM (${base}) ${filter}`, ctx.schoolId, q)!.n;
  const rows = all<B>(`SELECT * FROM (${base}) ${filter} ORDER BY title LIMIT ?3 OFFSET ?4`, ctx.schoolId, q, PER_PAGE, (page - 1) * PER_PAGE);
  const ids = ownLearnerIds(ctx);
  const loans = all<{ id: number; title: string; learner: string; className: string | null; borrowed_on: string; due_on: string }>(`
    SELECT bl.id, b.title, l.first_name || ' ' || l.last_name learner, c.name className, bl.borrowed_on, bl.due_on
    FROM book_loans bl JOIN books b ON b.id = bl.book_id JOIN learners l ON l.id = bl.learner_id LEFT JOIN classes c ON c.id = l.class_id
    WHERE bl.school_id = ? AND bl.returned_on IS NULL ${ids ? `AND bl.learner_id IN (${ids.map(() => "?").join(",") || "NULL"})` : ""} ORDER BY bl.due_on`, ctx.schoolId, ...(ids ?? []));
  const t = today();

  const fields = (b?: B): Field[] => [
    { name: "code", label: "Book ID", required: true, defaultValue: b?.code, placeholder: "2026-LIT-013", half: true },
    { name: "copies", label: "Copies", type: "number", required: true, defaultValue: b?.copies ?? 1, half: true },
    { name: "title", label: "Title", required: true, defaultValue: b?.title },
    { name: "author", label: "Author", defaultValue: b?.author, half: true },
    { name: "subject", label: "Subject", defaultValue: b?.subject, half: true },
    { name: "grades", label: "Grades", defaultValue: b?.grades, placeholder: "10-12", half: true },
    { name: "publish_year", label: "Published", type: "number", defaultValue: b?.publish_year, half: true },
  ];

  return (
    <>
      <PageHeader title="Library" subtitle={`${total} titles`}>
        <Filters search={{ name: "q", placeholder: "Search by ID, title, author or subject", value: q }}
          filters={[{ name: "status", label: "Availability", value: avail, allLabel: "All books", options: [{ value: "available", label: "Available" }, { value: "out", label: "Checked out" }] }]} />
        {ctx.isAdmin && <FormDialog title="Add book" triggerLabel="Add book" fields={fields()} action={saveBook} />}
      </PageHeader>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6">
        <Card>
          {rows.length === 0 ? <Empty title="No books found" /> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Book ID</th><th>Book</th><th>Author</th><th>Subject</th><th>Grades</th><th>Published</th><th>Status</th>{staff && <th className="text-right">Action</th>}</tr></thead>
                <tbody>{rows.map((b, i) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs">{b.code}</td>
                    <td><div className="flex items-center gap-3"><span className={`w-8 h-11 rounded-md bg-gradient-to-br ${COVERS[(b.id + i) % COVERS.length]} shadow-md shrink-0`} /><span className="font-medium">{b.title}</span></div></td>
                    <td>{b.author}</td><td>{b.subject}</td><td>{b.grades}</td><td>{b.publish_year}</td>
                    <td><StatusChip status={b.out >= b.copies ? "Checked out" : "Available"} /><p className="text-[0.7rem] muted mt-0.5">{b.copies - b.out} of {b.copies} on shelf</p></td>
                    {staff && (
                      <td><div className="flex justify-end gap-1.5">
                        {b.out < b.copies && <FormDialog trigger="button" triggerLabel="Issue" title={`Issue “${b.title}”`} hidden={{ book_id: b.id }} action={issueBook} submitLabel="Issue book"
                          fields={[{ name: "admission_number", label: "Learner admission number", required: true }, { name: "days", label: "Loan period (days)", type: "number", defaultValue: 14 }]} />}
                        {ctx.isAdmin && <><FormDialog trigger="edit" title="Edit book" fields={fields(b)} hidden={{ id: b.id }} action={saveBook} /><DeleteButton action={deleteBook.bind(null, b.id)} label={b.title} /></>}
                      </div></td>
                    )}
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/library", sp, { page: p })} />
        </Card>
        <Card title={ids ? "Books on loan" : `On loan (${loans.length})`}>
          {loans.length === 0 ? <p className="text-sm muted">No books out.</p> : (
            <ul className="space-y-3">{loans.map((l) => (
              <li key={l.id} className="text-sm">
                <div className="flex justify-between gap-2"><p className="font-medium">{l.title}</p>{staff && <form action={async () => { "use server"; await returnBook(l.id); }}><button className="btn btn-ghost btn-sm">Return</button></form>}</div>
                <p className="text-xs muted">{l.learner}{l.className ? ` · ${l.className}` : ""} · due <span className={l.due_on < t ? "text-rose-600 font-semibold" : ""}>{fmtDate(l.due_on)}</span></p>
              </li>))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
