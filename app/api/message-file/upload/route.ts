import { getCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { putFile } from "@/lib/storage";
import { MAX_MESSAGE_FILE_BYTES, MESSAGE_FILE_TYPES } from "@/lib/uploads";

// Development only: takes a message attachment when there is no Supabase Storage to upload to directly
// (production uploads go from the browser straight to storage; see prepareAttachment).
const KEY = /^messages\/(\d+)\/[0-9a-f-]{36}\.([a-z0-9]+)$/;

export async function PUT(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response("Not found", { status: 404 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const m = KEY.exec(key);
  if (!m || !MESSAGE_FILE_TYPES[m[2]]) return new Response("Bad request", { status: 400 });
  const isMember = await get("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?", Number(m[1]), ctx.user.id);
  if (!isMember) return new Response("Not found", { status: 404 });
  const file = [...(await req.formData()).values()].find((v): v is File => typeof v !== "string");
  if (!file || file.size > MAX_MESSAGE_FILE_BYTES) return new Response("Too large", { status: 413 });
  await putFile(key, new Uint8Array(await file.arrayBuffer()), MESSAGE_FILE_TYPES[m[2]]);
  return Response.json({ ok: true });
}
