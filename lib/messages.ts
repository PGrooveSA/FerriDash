import { get } from "./db";

/** Messages from other people, in this user's conversations, newer than when they last read that conversation. */
export async function unreadMessageCount(userId: number): Promise<number> {
  return (await get<{ n: number }>(`
    SELECT COUNT(*) n FROM messages m
    JOIN conversation_members me ON me.conversation_id = m.conversation_id AND me.user_id = ?1
    WHERE m.sender_id <> ?1 AND m.created_at > COALESCE(me.last_read_at, '')`, userId))!.n;
}
