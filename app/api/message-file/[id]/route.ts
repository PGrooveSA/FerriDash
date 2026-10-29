import { getCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { getFile, signedDownloadUrl } from "@/lib/storage";

// A message's attachment, for members of that conversation only. In production the browser is sent to a
// short-lived storage link (files can be larger than the app server may return); in development the
// file is streamed from the local folder.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  const id = Number((await params).id);
  const a = await get<{ attachment_key: string; attachment_name: string; attachment_type: string }>(
    `SELECT m.attachment_key, m.attachment_name, m.attachment_type FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE m.id = ? AND m.attachment_key IS NOT NULL`, ctx.user.id, id);
  if (!a) return new Response("Not found", { status: 404 });
  const signed = await signedDownloadUrl(a.attachment_key, a.attachment_name);
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=240" } });
  const buf = await getFile(a.attachment_key);
  if (!buf) return new Response("Not found", { status: 404 });
  const image = a.attachment_type.startsWith("image/");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": a.attachment_type,
      "Content-Disposition": `${image ? "inline" : "attachment"}; filename="${a.attachment_name.replace(/[^\x20-\x7e]|"/g, "_")}"`,
      "Cache-Control": "private, max-age=240",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
