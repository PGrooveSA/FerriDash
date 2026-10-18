import Link from "next/link";
import { Eye } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { fmtDate, fullName } from "@/lib/format";
import { Card, PageHeader, Empty, Pager, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, type Field } from "@/components/ui/forms";
import { saveNotice, deleteNotice } from "@/app/actions/content";

export const metadata = { title: "Notice board" };
const PER_PAGE = 6;
const TAG_TONES = ["chip-lilac", "chip-sky", "chip-butter", "chip-green"];
type N = { id: number; title: string; body: string; audience: string; tags: string | null; views: number; created_at: string; author_id: number; title_: string | null; first_name: string | null; last_name: string | null };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const role = ctx.user.role;
  const audiences = ctx.isAdmin ? ["all", "staff", "learners", "parents"] : role === "teacher" ? ["all", "staff"] : role === "learner" ? ["all", "learners"] : ["all", "parents"];
  const q = sp.q?.trim() ?? "", page = Math.max(1, Number(sp.page) || 1);
  const where = `n.school_id = ? AND n.audience IN (${audiences.map(() => "?").join(",")}) AND (? = '' OR n.title LIKE '%' || ? || '%' OR u.last_name LIKE '%' || ? || '%')`;
  const args = [ctx.schoolId, ...audiences, q, q, q];
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM notices n LEFT JOIN users u ON u.id = n.author_id WHERE ${where}`, ...args)!.n;
  const rows = all<N>(`SELECT n.*, u.title title_, u.first_name, u.last_name FROM notices n LEFT JOIN users u ON u.id = n.author_id WHERE ${where} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`, ...args, PER_PAGE, (page - 1) * PER_PAGE);
  const selectedId = Number(sp.id) || rows[0]?.id;
  const selected = selectedId ? get<N>(`SELECT n.*, u.title title_, u.first_name, u.last_name FROM notices n LEFT JOIN users u ON u.id = n.author_id WHERE n.id = ? AND n.school_id = ? AND n.audience IN (${audiences.map(() => "?").join(",")})`, selectedId, ctx.schoolId, ...audiences) : undefined;
  if (selected && sp.id) run("UPDATE notices SET views = views + 1 WHERE id = ?", selected.id);
  const staff = ctx.isAdmin || role === "teacher";
  const by = (n: N) => n.first_name ? fullName({ title: n.title_, first_name: n.first_name, last_name: n.last_name! }, true) : "School office";

  const fields = (n?: N): Field[] => [
    { name: "title", label: "Title", required: true, defaultValue: n?.title },
    { name: "body", label: "Message", type: "textarea", required: true, defaultValue: n?.body },
    { name: "audience", label: "Who can see it", type: "select", required: true, options: [{ value: "all", label: "Everyone" }, { value: "staff", label: "Staff only" }, { value: "learners", label: "Learners" }, { value: "parents", label: "Parents" }], defaultValue: n?.audience ?? "all", half: true },
    { name: "tags", label: "Tags (comma separated)", defaultValue: n?.tags, placeholder: "School, Academic", half: true },
  ];

  return (
    <>
      <PageHeader title="Notice board">
        <Filters filters={[]} search={{ name: "q", placeholder: "Search by title or author", value: q }} />
        {staff && <FormDialog title="New notice" triggerLabel="Post notice" fields={fields()} action={saveNotice} />}
      </PageHeader>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_26rem] gap-6">
        <div>
          {rows.length === 0 ? <Card><Empty title="No notices" /></Card> : (
            <div className="space-y-4">
              {rows.map((n) => (
                <Link key={n.id} href={hrefWith("/notices", sp, { id: n.id })} className={`glass block p-5 transition ${n.id === selected?.id ? "ring-2 ring-lilac-300 bg-lilac-100/40 dark:bg-lilac-500/10" : "hover:-translate-y-0.5"}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[12rem]">
                      <h2 className="text-lg font-semibold">{n.title}</h2>
                      <p className="text-sm muted">By {by(n)}{n.audience !== "all" && <> · <span className="capitalize">{n.audience}</span></>}</p>
                    </div>
                    <span className="chip chip-slate">{fmtDate(n.created_at)}</span>
                    <span className="chip chip-slate"><Eye className="w-3 h-3" />{n.views.toLocaleString("en-ZA")}</span>
                  </div>
                  <p className="text-sm mt-3 line-clamp-2">{n.body}</p>
                </Link>
              ))}
            </div>
          )}
          <Pager page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(p) => hrefWith("/notices", sp, { page: p })} />
        </div>
        {selected && (
          <Card className="xl:sticky xl:top-4 h-fit">
            <div className="rounded-2xl h-36 bg-gradient-to-br from-brand-300 via-lilac-300 to-butter-300 dark:from-brand-500/40 dark:via-lilac-500/40 dark:to-butter-500/30 grid place-items-center text-white text-5xl font-black">
              {selected.title.slice(0, 1)}
            </div>
            <h2 className="text-xl font-semibold mt-4">{selected.title}</h2>
            <p className="text-sm muted">By {by(selected)}</p>
            <div className="flex gap-2 mt-2"><span className="chip chip-slate">{fmtDate(selected.created_at)}</span><span className="chip chip-slate"><Eye className="w-3 h-3" />{selected.views}</span></div>
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{selected.body}</p>
            {selected.tags && <div className="mt-4"><p className="text-xs font-semibold mb-2">Tags</p><div className="flex flex-wrap gap-2">{selected.tags.split(",").map((t, i) => <span key={t} className={`chip ${TAG_TONES[i % 4]}`}>{t.trim()}</span>)}</div></div>}
            {staff && (ctx.isAdmin || selected.author_id === ctx.user.id) && (
              <div className="flex gap-2 mt-5"><FormDialog trigger="edit" title="Edit notice" fields={fields(selected)} hidden={{ id: selected.id }} action={saveNotice} /><DeleteButton action={deleteNotice.bind(null, selected.id)} label={selected.title} /></div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
