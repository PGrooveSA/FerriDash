import { readFile } from "node:fs/promises";
import { getCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { avatarFile, imageHeaders, imageType } from "@/lib/uploads";

// Serves a profile photo to signed-in users of the same school.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  const id = Number((await params).id);
  const u = get<{ school_id: number | null; avatar_updated_at: string | null }>("SELECT school_id, avatar_updated_at FROM users WHERE id = ?", id);
  if (!u?.avatar_updated_at) return new Response("Not found", { status: 404 });
  const allowed = ctx.user.role === "super_admin" || u.school_id === ctx.schoolId || u.school_id === null;
  if (!allowed) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(avatarFile(id));
    const type = imageType(buf);
    if (!type) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(buf), { headers: imageHeaders(type, "private") });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
