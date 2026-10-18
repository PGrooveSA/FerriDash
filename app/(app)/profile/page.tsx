import { requireCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { ROLE_LABEL, fullName, avatarUrl, fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui/kit";
import PhotoUploader from "./PhotoUploader";
import ProfileForms from "./ProfileForms";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await requireCtx();
  const u = get<{ last_login: string | null; created_at: string }>("SELECT last_login, created_at FROM users WHERE id = ?", ctx.user.id)!;
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6">
        <Card>
          <div className="text-center">
            <PhotoUploader first={ctx.user.first_name} last={ctx.user.last_name} photo={avatarUrl(ctx.user.id, ctx.user.avatar_updated_at)} />
            <h2 className="text-xl font-semibold mt-3">{fullName(ctx.user, true)}</h2>
            <p className="muted text-sm">{ROLE_LABEL[ctx.user.role]} · {ctx.school.name}</p>
          </div>
          <dl className="text-sm mt-6 space-y-3">
            <div className="flex justify-between gap-3"><dt className="muted">Email</dt><dd className="truncate">{ctx.user.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="muted">Phone</dt><dd>{ctx.user.phone ?? "-"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="muted">Member since</dt><dd>{fmtDate(u.created_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="muted">Last sign-in</dt><dd>{u.last_login ? fmtDate(u.last_login, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}</dd></div>
          </dl>
        </Card>
        <ProfileForms title={ctx.user.title} phone={ctx.user.phone} />
      </div>
    </>
  );
}
