import { getCtx } from "@/lib/auth";
import { get } from "@/lib/db";
import { familyClassIds } from "@/lib/assignments";
import { getFile, storageKey } from "@/lib/storage";
import { isPdf } from "@/lib/uploads";

// An assignment's PDF: for the school's staff, and for learners and parents of that class.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorised", { status: 401 });
  const id = Number((await params).id);
  const a = await get<{ document_name: string | null; class_id: number }>(`SELECT a.document_name, cs.class_id FROM assignments a
    JOIN class_subjects cs ON cs.id = a.class_subject_id WHERE a.id = ? AND a.school_id = ?`, id, ctx.schoolId);
  if (!a?.document_name) return new Response("Not found", { status: 404 });
  const staff = ctx.isAdmin || ctx.user.role === "teacher";
  if (!staff && !(await familyClassIds(ctx)).includes(a.class_id)) return new Response("Not found", { status: 404 });
  const buf = await getFile(storageKey.assignmentDoc(id));
  if (!buf || !isPdf(buf)) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${a.document_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
