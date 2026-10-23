import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCtx } from "@/lib/auth";
import { IMPORT_TEMPLATES } from "@/lib/importer";

// Blank CSV import templates (from templates/import) for school administrators.
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  if (!ctx.isAdmin) return new Response("Not found", { status: 404 });
  const name = (await params).name;
  if (!Object.values(IMPORT_TEMPLATES).includes(name)) return new Response("Not found", { status: 404 });
  const buf = await readFile(join(process.cwd(), "templates", "import", name));
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
