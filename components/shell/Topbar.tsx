import Link from "next/link";
import { Search } from "lucide-react";
import { Suspense } from "react";
import type { Ctx } from "@/lib/auth";
import { ROLE_LABEL, fullName, avatarUrl } from "@/lib/format";
import ThemeToggle from "./ThemeToggle";
import Indicators from "./Indicators";
import { unreadNoticeCount } from "@/lib/notices";
import { unreadMessageCount } from "@/lib/messages";
import { unreadAssignmentCount } from "@/lib/assignments";
import Avatar from "../ui/Avatar";
import { tFor } from "@/lib/i18n";

export default async function Topbar({ ctx }: { ctx: Ctx }) {
  // The platform admin only manages schools: no school search, notices or messages.
  const platform = ctx.user.role === "super_admin";
  const t = tFor(ctx.user);
  const family = ctx.user.role === "learner" || ctx.user.role === "parent";
  const unread = platform ? null : { notices: await unreadNoticeCount(ctx), messages: await unreadMessageCount(ctx.user.id), assignments: family ? await unreadAssignmentCount(ctx) : null };
  return (
    <header className="flex flex-wrap items-center gap-3 pl-14 lg:pl-0">
      {platform ? (
        <p className="text-sm muted">{t("FerriDash platform administration")}</p>
      ) : (
        <form action="/search" className="relative flex-1 min-w-[12rem] max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 muted" />
          <input name="q" placeholder={t("Search learners, teachers, notices...")} className="input !rounded-full !pl-10 glass-strong" aria-label={t("Search")} />
        </form>
      )}
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {unread && <Suspense><Indicators initial={unread} /></Suspense>}
        <Link href="/profile" className="flex items-center gap-3 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold leading-tight">{fullName(ctx.user)}</p>
            <p className="text-xs muted">{t(ROLE_LABEL[ctx.user.role])}</p>
          </div>
          <Avatar first={ctx.user.first_name} last={ctx.user.last_name} size={42} online photo={avatarUrl(ctx.user.id, ctx.user.avatar_updated_at)} />
        </Link>
      </div>
    </header>
  );
}
