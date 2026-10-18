import Link from "next/link";
import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { all } from "@/lib/db";
import { Card, PageHeader, Empty } from "@/components/ui/kit";
import { avatarUrl } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx();
  const q = ((await searchParams).q ?? "").trim();
  const like = `%${q}%`;
  const staff = ctx.isAdmin || ctx.user.role === "teacher";
  const own = ownLearnerIds(ctx);
  const learners = q && staff ? all<{ id: number; first_name: string; last_name: string; admission_number: string; className: string | null; user_id: number | null; av: string | null }>(
    "SELECT l.id, l.first_name, l.last_name, l.admission_number, c.name className, l.user_id, (SELECT avatar_updated_at FROM users WHERE id = l.user_id) av FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE l.school_id = ? AND (l.first_name || ' ' || l.last_name LIKE ? OR l.admission_number LIKE ?) LIMIT 15", ctx.schoolId, like, like) : [];
  const teachers = q ? all<{ id: number; first_name: string; last_name: string; title: string | null; email: string; avatar_updated_at: string | null }>(
    "SELECT u.id, u.first_name, u.last_name, u.title, u.email, u.avatar_updated_at FROM users u WHERE u.school_id = ? AND u.role IN ('teacher','school_admin') AND (u.first_name || ' ' || u.last_name LIKE ? OR u.email LIKE ?) LIMIT 10", ctx.schoolId, like, like) : [];
  const books = q ? all<{ id: number; title: string; author: string | null }>("SELECT id, title, author FROM books WHERE school_id = ? AND (title LIKE ? OR author LIKE ? OR code LIKE ?) LIMIT 10", ctx.schoolId, like, like, like) : [];
  const notices = q ? all<{ id: number; title: string }>("SELECT id, title FROM notices WHERE school_id = ? AND (title LIKE ? OR body LIKE ?) LIMIT 10", ctx.schoolId, like, like) : [];
  const nothing = !learners.length && !teachers.length && !books.length && !notices.length;

  return (
    <>
      <PageHeader title="Search" subtitle={q ? `Results for “${q}”` : "Type in the search box above."} />
      {q && nothing && <Card><Empty title="No matches" /></Card>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {learners.length > 0 && <Card title="Learners"><ul className="space-y-3">{learners.map((l) => (
          <li key={l.id}><Link href={`/learners?q=${encodeURIComponent(l.admission_number)}`} className="flex items-center gap-3 hover:underline"><Avatar first={l.first_name} last={l.last_name} size={34} photo={avatarUrl(l.user_id, l.av)} />{l.first_name} {l.last_name} <span className="muted text-sm">{l.className} · {l.admission_number}</span></Link></li>))}</ul></Card>}
        {teachers.length > 0 && <Card title="Staff"><ul className="space-y-3">{teachers.map((t) => (
          <li key={t.id} className="flex items-center gap-3"><Avatar first={t.first_name} last={t.last_name} size={34} photo={avatarUrl(t.id, t.avatar_updated_at)} />{t.title} {t.first_name} {t.last_name} <span className="muted text-sm">{t.email}</span></li>))}</ul></Card>}
        {books.length > 0 && <Card title="Library"><ul className="space-y-2">{books.map((b) => <li key={b.id}><Link className="hover:underline" href={`/library?q=${encodeURIComponent(b.title)}`}>{b.title}</Link> <span className="muted text-sm">{b.author}</span></li>)}</ul></Card>}
        {notices.length > 0 && <Card title="Notices"><ul className="space-y-2">{notices.map((n) => <li key={n.id}><Link className="hover:underline" href={`/notices?id=${n.id}`}>{n.title}</Link></li>)}</ul></Card>}
      </div>
      {own && q && <p className="text-xs muted mt-4">Learner records are only searchable by staff.</p>}
    </>
  );
}
