import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { visibleAssignments, markAssignmentsSeen } from "@/lib/assignments";
import { Card, Empty, PageHeader } from "@/components/ui/kit";
import { PdfDownload, PdfViewer } from "@/components/PdfViewer";
import { tFor } from "@/lib/i18n";

export const metadata = { title: "Assignment" };

/** One assignment with its PDF shown on the page, so it opens on phones and in the FerriDash app too. */
export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const tr = tFor(ctx.user);
  const [a] = await visibleAssignments(ctx, { id: Number((await params).id) || -1 });
  if (!a) notFound();
  if (ctx.user.role === "learner" || ctx.user.role === "parent") await markAssignmentsSeen(ctx.user.id);
  const src = `/api/assignment-doc/${a.id}`;

  return (
    <>
      <div className="no-print">
        <Link href="/assignments" className="inline-flex items-center gap-1.5 text-sm muted hover:text-[var(--ink)] mb-3"><ArrowLeft className="w-4 h-4" />{tr("Assignments")}</Link>
        <PageHeader title={a.title} subtitle={`${a.subject} · ${tr("Class {name}", { name: a.class_name })} · ${tr("Due {date}", { date: fmtDate(a.due_date, { weekday: "long", day: "numeric", month: "long" }) })}${a.author ? ` · ${tr("set by {name}", { name: a.author })}` : ""}`}>
          {a.document_name && <PdfDownload src={src} name={a.document_name} />}
        </PageHeader>
        {a.instructions && <Card className="mb-5"><p className="text-sm whitespace-pre-line">{a.instructions}</p></Card>}
      </div>
      {a.document_name ? <div className="max-w-3xl mx-auto"><PdfViewer src={src} /></div> : <Card className="no-print"><Empty title={tr("No PDF attached")} hint={tr("Follow the instructions above.")} /></Card>}
    </>
  );
}
