import { getFile, storageKey } from "@/lib/storage";
import { getCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { imageHeaders, imageType } from "@/lib/uploads";

// Serves a profile banner to signed-in users of the same school.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  const id = Number((await params).id);
  const u = await get<{ school_id: number | null; banner_updated_at: string | null }>("SELECT school_id, banner_updated_at FROM users WHERE id = ?", id);
  if (!u?.banner_updated_at) return new Response("Not found", { status: 404 });
  const allowed = ctx.user.role === "super_admin" || u.school_id === ctx.schoolId || u.school_id === null;
  if (!allowed) return new Response("Not found", { status: 404 });
  try {
    const buf = await getFile(storageKey.banner(id));
    if (!buf) return new Response("Not found", { status: 404 });
    const type = imageType(buf);
    if (!type) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(buf), { headers: imageHeaders(type, "private") });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
