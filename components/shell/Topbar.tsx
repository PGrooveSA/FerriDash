import Link from "next/link";
import { Search } from "lucide-react";
import { Suspense } from "react";
import { all } from "@/lib/db";
import type { Ctx } from "@/lib/auth";
import { ROLE_LABEL, fullName, avatarUrl } from "@/lib/format";
import { switchSchool } from "@/app/actions/auth";
import ThemeToggle from "./ThemeToggle";
import Indicators from "./Indicators";
import { unreadNoticeCount } from "@/lib/notices";
import { unreadMessageCount } from "@/lib/messages";
import Avatar from "../ui/Avatar";

export default function Topbar({ ctx }: { ctx: Ctx }) {
  const unread = { notices: unreadNoticeCount(ctx), messages: unreadMessageCount(ctx.user.id) };
  const schools = ctx.user.role === "super_admin" ? all<{ id: number; name: string }>("SELECT id, name FROM schools ORDER BY name") : [];
  return (
    <header className="flex flex-wrap items-center gap-3 pl-14 lg:pl-0">
      <form action="/search" className="relative flex-1 min-w-[12rem] max-w-md">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 muted" />
        <input name="q" placeholder="Search learners, teachers, books..." className="input !rounded-full !pl-10 glass-strong" aria-label="Search" />
      </form>
      {schools.length > 0 && (
        <form action={switchSchool} className="flex items-center gap-2">
          <select name="school_id" defaultValue={ctx.schoolId} className="input !rounded-full !py-2 max-w-[14rem]" aria-label="Active school">
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm">Switch</button>
        </form>
      )}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <Suspense><Indicators initial={unread} /></Suspense>
        <Link href="/profile" className="flex items-center gap-3 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold leading-tight">{fullName(ctx.user)}</p>
            <p className="text-xs muted">{ROLE_LABEL[ctx.user.role]}</p>
          </div>
          <Avatar first={ctx.user.first_name} last={ctx.user.last_name} size={42} online photo={avatarUrl(ctx.user.id, ctx.user.avatar_updated_at)} />
        </Link>
      </div>
    </header>
  );
}
