"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setResultStatus, publishAllApproved } from "@/app/actions/results";

type S = "draft" | "submitted" | "approved" | "published";

export function WorkflowButtons({ csId, term, status, isAdmin, compact = false }: { csId: number; term: number; status: S; isAdmin: boolean; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (to: S, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await setResultStatus(csId, term, to);
      if (r.error) alert(r.error); else router.refresh();
    });
  };
  const cls = `btn ${compact ? "btn-sm" : ""}`;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && <button disabled={pending} className={`${cls} btn-primary`} onClick={() => go("submitted", "Submit these marks for moderation? You will not be able to edit them afterwards.")}>Submit for moderation</button>}
      {isAdmin && status === "submitted" && <button disabled={pending} className={`${cls} btn-primary`} onClick={() => go("approved")}>Approve</button>}
      {isAdmin && (status === "approved" || status === "submitted") && <button disabled={pending} className={`${cls} btn-butter`} onClick={() => go("published", "Publish? Learners and parents will be able to see these results.")}>Publish</button>}
      {isAdmin && status !== "draft" && <button disabled={pending} className={`${cls} btn-ghost`} onClick={() => go("draft", "Return to draft so the educator can make changes?")}>Return to draft</button>}
    </div>
  );
}

export function PublishAll({ term, count }: { term: number; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button disabled={pending || count === 0} className="btn btn-butter" onClick={() => {
      if (!confirm(`Publish ${count} approved mark sheet(s) for Term ${term}?`)) return;
      start(async () => { const r = await publishAllApproved(term); alert(r.error ?? r.message); router.refresh(); });
    }}>Publish all approved ({count})</button>
  );
}
