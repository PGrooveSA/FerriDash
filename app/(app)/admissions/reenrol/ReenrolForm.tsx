"use client";
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { answerReenrolment } from "@/app/actions/admissions";

const CHOICES = [
  { value: "Returning", label: "Yes, returning", hint: "Keep their place for next year." },
  { value: "Leaving", label: "No, leaving", hint: "Tell us why, or the new school." },
  { value: "Unsure", label: "Not sure yet", hint: "We'll check with you again." },
];

/** A parent's answer for one child: returning, leaving or unsure. */
export default function ReenrolForm({ learnerId, status, reason, year }: { learnerId: number; status: string | null; reason: string | null; year: number }) {
  const router = useRouter();
  const [pick, setPick] = useState(status ?? "Returning");
  const [state, action, pending] = useActionState(async (prev: { error?: string; ok?: boolean; message?: string }, f: FormData) => {
    const r = await answerReenrolment(prev, f);
    if (r.ok) router.refresh();
    return r;
  }, {});
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-3">
      <input type="hidden" name="learner_id" value={learnerId} />
      <fieldset className="grid gap-2">
        <legend className="label">Will they return in {year}?</legend>
        {CHOICES.map((c) => (
          <label key={c.value} className={`flex gap-3 items-start rounded-2xl border p-3 cursor-pointer ${pick === c.value ? "border-brand-400 bg-brand-500/5" : "border-line"}`}>
            <input type="radio" name="status" value={c.value} checked={pick === c.value} onChange={() => setPick(c.value)} className="mt-1" />
            <span><b>{c.label}</b><span className="block text-xs muted">{c.hint}</span></span>
          </label>
        ))}
      </fieldset>
      {pick !== "Returning" && (
        <div>
          <label className="label" htmlFor={`reason-${learnerId}`}>{pick === "Leaving" ? "Reason or new school" : "Anything the school should know"}</label>
          <textarea id={`reason-${learnerId}`} name="reason" rows={2} defaultValue={reason ?? ""} className="input" required={pick === "Leaving"} />
        </div>
      )}
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Sending..." : status ? "Update answer" : "Send answer"}</button>
    </form>
  );
}
