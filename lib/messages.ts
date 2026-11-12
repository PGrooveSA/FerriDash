import { get, run, tx } from "./db";

/** Messages from other people, in this user's conversations, newer than when they last read that conversation. */
export async function unreadMessageCount(userId: number): Promise<number> {
  return (await get<{ n: number }>(`
    SELECT COUNT(*) n FROM messages m
    JOIN conversation_members me ON me.conversation_id = m.conversation_id AND me.user_id = ?1
    WHERE m.sender_id <> ?1 AND m.created_at > COALESCE(me.last_read_at, '')`, userId))!.n;
}

/** Puts a message from a school user in someone's Messages, reusing their one-to-one chat (fee reminders, childcare collection alerts). */
export async function messageUser(schoolId: number, senderId: number, parentId: number, body: string) {
  const existing = await get<{ id: number }>(`SELECT c.id FROM conversations c WHERE c.is_group = 0 AND c.school_id = ?
    AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)
    AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = c.id AND user_id = ?)`, schoolId, senderId, parentId);
  const conv = existing?.id ?? (await tx(async () => {
    const c = (await run("INSERT INTO conversations (school_id, is_group) VALUES (?, 0)", schoolId)).id;
    await run("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?), (?,?)", c, senderId, c, parentId);
    return c;
  }));
  await run("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)", conv, senderId, body);
}
