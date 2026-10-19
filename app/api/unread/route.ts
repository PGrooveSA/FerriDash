import { getCtx } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices";
import { unreadMessageCount } from "@/lib/messages";

export const dynamic = "force-dynamic";

/** Fresh unread counts for the top-bar indicators. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return Response.json({ error: "Unauthorised" }, { status: 401 });
  return Response.json(
    { notices: unreadNoticeCount(ctx), messages: unreadMessageCount(ctx.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
