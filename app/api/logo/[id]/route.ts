import { getFile, storageKey } from "@/lib/storage";
import { get } from "@/lib/db";
import { imageHeaders, imageType } from "@/lib/uploads";

// School logos are public branding: they appear on the sign-in page before anyone logs in.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const s = await get<{ logo_updated_at: string | null }>("SELECT logo_updated_at FROM schools WHERE id = ? AND active = 1", id);
  if (!s?.logo_updated_at) return new Response("Not found", { status: 404 });
  try {
    const buf = await getFile(storageKey.logo(id));
    if (!buf) return new Response("Not found", { status: 404 });
    const type = imageType(buf);
    if (!type) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(buf), { headers: imageHeaders(type, "public") });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
