import { getCtx } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices";
import { unreadMessageCount } from "@/lib/messages";
import { unreadAssignmentCount } from "@/lib/assignments";
import { touchLastSeen } from "@/lib/presence";

export const dynamic = "force-dynamic";

/** Fresh unread counts for the top-bar indicators. Every open page asks about every 30 seconds, so this also marks the user as online. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return Response.json({ error: "Unauthorised" }, { status: 401 });
  await touchLastSeen(ctx.user.id);
  return Response.json(
    { notices: await unreadNoticeCount(ctx), messages: await unreadMessageCount(ctx.user.id),
      assignments: ctx.user.role === "learner" || ctx.user.role === "parent" ? await unreadAssignmentCount(ctx) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
