"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ActionResult } from "@/components/ui/forms";

export default function GenerateInvoicesButton({ action }: { action: () => Promise<ActionResult> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-ghost" disabled={pending} onClick={() => {
      if (!confirm("Create this year's invoice for every learner who does not have one yet?")) return;
      start(async () => { const r = await action(); alert(r.error ?? r.message); router.refresh(); });
    }}>{pending ? "Generating…" : "Generate invoices"}</button>
  );
}
