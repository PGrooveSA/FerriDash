import { requireCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { ROLE_LABEL, fullName } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui/kit";
import Avatar from "@/components/ui/Avatar";
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
            <div className="inline-block"><Avatar first={ctx.user.first_name} last={ctx.user.last_name} size={104} online /></div>
            <h2 className="text-xl font-semibold mt-3">{fullName(ctx.user, true)}</h2>
            <p className="muted text-sm">{ROLE_LABEL[ctx.user.role]} · {ctx.school.name}</p>
          </div>
          <dl className="text-sm mt-6 space-y-3">
            <div className="flex justify-between gap-3"><dt className="muted">Email</dt><dd className="truncate">{ctx.user.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="muted">Phone</dt><dd>{ctx.user.phone ?? "-"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="muted">Member since</dt><dd>{u.created_at.slice(0, 10)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="muted">Last sign-in</dt><dd>{u.last_login ?? "-"}</dd></div>
          </dl>
        </Card>
        <ProfileForms title={ctx.user.title} phone={ctx.user.phone} />
      </div>
    </>
  );
}
