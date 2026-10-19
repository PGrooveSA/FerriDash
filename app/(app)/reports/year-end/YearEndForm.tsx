"use client";
import { startTransition, useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, RotateCcw, GraduationCap, LogOut, AlertTriangle } from "lucide-react";
import { runYearEnd } from "@/app/actions/yearend";
import type { PlanClass, YearEndAction } from "@/lib/yearend";

const LABEL: Record<YearEndAction, string> = { promote: "Promote", repeat: "Repeat grade", graduate: "Graduate", leave: "Leaves school" };
const TONE: Record<YearEndAction, string> = { promote: "chip-green", repeat: "chip-butter", graduate: "chip-info", leave: "chip-slate" };

export default function YearEndForm({ plan, year }: { plan: PlanClass[]; year: number }) {
  const [state, action, pending] = useActionState(runYearEnd, {});
  const [choice, setChoice] = useState<Record<number, YearEndAction>>(() => Object.fromEntries(plan.flatMap((c) => c.learners.map((l) => [l.id, l.action]))));
  const [confirmText, setConfirmText] = useState("");
  const router = useRouter();

  const counts = useMemo(() => {
    const c = { promote: 0, repeat: 0, graduate: 0, leave: 0 } as Record<YearEndAction, number>;
    Object.values(choice).forEach((a) => c[a]++);
    return c;
  }, [choice]);
  const incomplete = plan.reduce((n, c) => n + c.learners.filter((l) => l.incomplete).length, 0);
  const provisional = plan.some((c) => c.learners.some((l) => l.provisional));
  const total = Object.values(choice).length;

  if (state.ok) return (
    <div className="glass p-8 text-center">
      <GraduationCap className="w-12 h-12 mx-auto text-brand-500" />
      <p className="text-xl font-semibold mt-3">{state.message}</p>
      <p className="muted text-sm mt-1">Past report cards stay available under Reports → Report cards (choose the year).</p>
      <button className="btn btn-primary mt-5" onClick={() => router.push("/dashboard")}>Go to dashboard</button>
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([["promote", ArrowUpCircle, "to the next grade"], ["repeat", RotateCcw, "stay in the same grade"], ["graduate", GraduationCap, "Grade 12 completed"], ["leave", LogOut, "removed from class lists"]] as const).map(([k, Icon, hint]) => (
          <div key={k} className="glass p-5"><Icon className="w-6 h-6" /><p className="text-3xl font-bold mt-2">{counts[k]}</p><p className="font-medium">{LABEL[k]}</p><p className="text-xs muted">{hint}</p></div>
        ))}
      </div>

      {(provisional || incomplete > 0) && (
        <div className="glass p-4 flex gap-3 text-sm border-l-4 border-butter-500">
          <AlertTriangle className="w-5 h-5 text-butter-500 shrink-0" />
          <div>
            {provisional && <p>Some outcomes are <b>provisional</b>: final examination marks are not all captured yet. Ideally run year-end after the final results are published.</p>}
            {incomplete > 0 && <p>{incomplete} learner{incomplete === 1 ? " has" : "s have"} <b>incomplete marks</b> and default to repeating. Check and change their action if needed.</p>}
          </div>
        </div>
      )}

      {plan.map((c) => (
        <section key={c.id} className="glass p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold">Class {c.name}</h2>
            <p className="text-xs muted">{c.grade < 12 ? <>Promoted learners go to <b>{c.promoteTo}</b> · repeating learners to <b>{c.repeatIn}</b> in {year + 1}</> : <>Grade 12: learners who achieved the NSC graduate · others can repeat in <b>{c.repeatIn}</b></>}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Learner</th><th>Year average</th><th>CAPS outcome</th><th>Action for {year + 1}</th></tr></thead>
              <tbody>{c.learners.map((l) => (
                <tr key={l.id}>
                  <td><p className="font-medium">{l.name}</p><p className="text-xs muted font-mono">{l.admission_number}</p></td>
                  <td>{l.average != null ? `${l.average}%` : "-"}</td>
                  <td className="text-sm">
                    <span className={l.incomplete ? "text-butter-500" : l.promoted ? "text-emerald-600" : "text-rose-600"}>{l.outcome}</span>
                    {l.provisional && <span className="chip chip-slate ml-2">provisional</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <select name={`action_${l.id}`} value={choice[l.id]} onChange={(e) => setChoice((s) => ({ ...s, [l.id]: e.target.value as YearEndAction }))} className="input !py-1.5 !w-44" aria-label={`Action for ${l.name}`}>
                        {c.grade < 12 && <option value="promote">Promote</option>}
                        <option value="repeat">Repeat grade</option>
                        {c.grade === 12 && <option value="graduate">Graduate</option>}
                        <option value="leave">Leaves school</option>
                      </select>
                      {choice[l.id] !== l.action && <span className={`chip ${TONE[choice[l.id]]}`}>changed</span>}
                    </div>
                  </td>
                </tr>))}
                {!c.learners.length && <tr><td colSpan={4} className="muted text-sm">No learners in this class.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div className="glass p-6 space-y-3">
        <h2 className="text-lg font-semibold">Close {year} and start {year + 1}</h2>
        <ul className="text-sm muted list-disc pl-5 space-y-1">
          <li>Every learner&apos;s {year} class and outcome is saved, so {year} report cards stay viewable.</li>
          <li>{year + 1} classes are created where needed, with the same subjects, teachers and register teachers as this year.</li>
          <li>Learners move as chosen above; graduates and leavers no longer appear in class lists.</li>
          <li>Term dates and fee structures are copied to {year + 1} (adjust them in Settings and Fees). The school moves to Term 1 of {year + 1}.</li>
        </ul>
        <p className="text-sm text-rose-600">This cannot be undone. Make a backup of the <code>data</code> folder first.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="confirm_year">Type {year} to confirm</label>
            <input id="confirm_year" name="confirm_year" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} inputMode="numeric" className="input !w-40" placeholder={String(year)} />
          </div>
          <button className="btn btn-primary" disabled={pending || confirmText !== String(year) || total === 0}>{pending ? "Working…" : `Complete year-end for ${total} learners`}</button>
        </div>
        {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      </div>
    </form>
  );
}
