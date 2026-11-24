import { get, run } from "./db";
import type { Ctx } from "./auth";

/** Notices for families: learners and parents both read and are notified of every one of them
 * (school trips, fee announcements...). "learners" and "parents" are older values kept for existing notices. */
export const FAMILY_AUDIENCES = ["families", "learners", "parents"];
export const NOTICE_AUDIENCES = ["all", "staff", ...FAMILY_AUDIENCES];

/** Notice audiences each role may read. */
export function noticeAudiences(ctx: Ctx): string[] {
  if (ctx.isAdmin) return NOTICE_AUDIENCES;
  if (ctx.user.role === "teacher") return ["all", "staff"];
  return ["all", ...FAMILY_AUDIENCES];
}

/** How a notice's audience is shown. */
export function audienceLabel(audience: string): string {
  return audience === "all" ? "Everyone" : audience === "staff" ? "Staff only" : "Learners and parents";
}

/** Notices for this user, posted by someone else since they last opened the notice board. */
export async function unreadNoticeCount(ctx: Ctx): Promise<number> {
  const aud = noticeAudiences(ctx);
  return (await get<{ n: number }>(`
    SELECT COUNT(*) n FROM notices
    WHERE school_id = ? AND audience IN (${aud.map(() => "?").join(",")})
      AND (author_id IS NULL OR author_id <> ?)
      AND created_at > COALESCE((SELECT notices_seen_at FROM users WHERE id = ?), '')`,
      ctx.schoolId, ...aud, ctx.user.id, ctx.user.id))!.n;
}

/** Called when the user opens the notice board: everything up to now counts as read. */
export async function markNoticesSeen(userId: number) {
  await run("UPDATE users SET notices_seen_at = datetime('now') WHERE id = ?", userId);
}
