import { getFile, storageKey } from "@/lib/storage";
import { getCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { isPdf } from "@/lib/uploads";

// Serves an expense's PDF to school administrators of the same school (finance is admin-only).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  if (!ctx.isAdmin) return new Response("Not found", { status: 404 });
  const id = Number((await params).id);
  const e = await get<{ document_name: string | null }>("SELECT document_name FROM expenses WHERE id = ? AND school_id = ?", id, ctx.schoolId);
  if (!e?.document_name) return new Response("Not found", { status: 404 });
  try {
    const buf = await getFile(storageKey.expenseDoc(id));
    if (!buf) return new Response("Not found", { status: 404 });
    if (!isPdf(buf)) return new Response("Not found", { status: 404 });
    const download = new URL(req.url).searchParams.has("download");
    const name = e.document_name.replace(/"/g, "");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
