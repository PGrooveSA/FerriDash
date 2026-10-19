import { get, run } from "./db";
import type { Ctx } from "./auth";

/** Notice audiences each role may read. */
export function noticeAudiences(ctx: Ctx): string[] {
  if (ctx.isAdmin) return ["all", "staff", "learners", "parents"];
  if (ctx.user.role === "teacher") return ["all", "staff"];
  if (ctx.user.role === "learner") return ["all", "learners"];
  return ["all", "parents"];
}

/** Notices for this user, posted by someone else since they last opened the notice board. */
export function unreadNoticeCount(ctx: Ctx): number {
  const aud = noticeAudiences(ctx);
  return get<{ n: number }>(`
    SELECT COUNT(*) n FROM notices
    WHERE school_id = ? AND audience IN (${aud.map(() => "?").join(",")})
      AND (author_id IS NULL OR author_id <> ?)
      AND created_at > COALESCE((SELECT notices_seen_at FROM users WHERE id = ?), '')`,
    ctx.schoolId, ...aud, ctx.user.id, ctx.user.id)!.n;
}

/** Called when the user opens the notice board: everything up to now counts as read. */
export function markNoticesSeen(userId: number) {
  run("UPDATE users SET notices_seen_at = datetime('now') WHERE id = ?", userId);
}
