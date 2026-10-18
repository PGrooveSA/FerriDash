"use client";
import { useState, useTransition } from "react";
import { Check, X, Clock, ShieldCheck } from "lucide-react";
import { setAttendance, markAllPresent } from "@/app/actions/attendance";
import { useRouter } from "next/navigation";

type Status = "P" | "A" | "L" | "E";
const NEXT: Record<string, Status | null> = { "": "P", P: "A", A: "L", L: "E", E: null };
const LABEL: Record<Status, string> = { P: "Present", A: "Absent", L: "Late", E: "Excused" };

export function StatusDot({ s }: { s: Status | "" }) {
  if (!s) return <span className="muted">-</span>;
  const cls = { P: "bg-brand-400 text-white", A: "bg-rose-500 text-white", L: "bg-butter-500 text-white", E: "bg-gold-500 text-white" }[s];
  const Icon = { P: Check, A: X, L: Clock, E: ShieldCheck }[s];
  return <span className={`inline-grid place-items-center w-7 h-7 rounded-full ${cls}`} title={LABEL[s]}><Icon className="w-4 h-4" strokeWidth={3} /></span>;
}

export default function AttendanceGrid({ classId, days, learners, initial, editableDays }: {
  classId: number; days: { date: string; label: string; weekday: string; weekend: boolean }[];
  learners: { id: number; name: string }[]; initial: Record<string, Status>; editableDays: string[];
}) {
  const [marks, setMarks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const editable = new Set(editableDays);

  const toggle = (learnerId: number, date: string) => {
    const key = `${learnerId}:${date}`;
    const next = NEXT[marks[key] ?? ""];
    setMarks((m) => { const c = { ...m }; if (next) c[key] = next; else delete c[key]; return c; });
    start(async () => {
      const r = await setAttendance(learnerId, date, next);
      if (r.error) { setError(r.error); setMarks((m) => ({ ...m, [key]: marks[key] })); }
    });
  };

  return (
    <div>
      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[12rem]">Learner</th>
              {days.map((d) => (
                <th key={d.date} className={`text-center !px-2 ${d.weekend ? "opacity-50" : ""}`}>
                  <div className="text-[0.65rem] uppercase">{d.weekday}</div><div className="text-sm text-[var(--ink)]">{d.label}</div>
                  {!d.weekend && editable.has(d.date) && (
                    <button className="text-[0.65rem] text-brand-600 hover:underline" onClick={() => start(async () => { await markAllPresent(classId, d.date); router.refresh(); })}>all ✓</button>
                  )}
                </th>
              ))}
              <th className="text-center">Rate</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => {
              const vals = days.filter((d) => !d.weekend).map((d) => marks[`${l.id}:${d.date}`]).filter(Boolean);
              const rate = vals.length ? Math.round((vals.filter((v) => v === "P" || v === "L").length / vals.length) * 100) : null;
              return (
                <tr key={l.id}>
                  <td className="sticky left-0 font-medium bg-[var(--glass-solid)]">{l.name}</td>
                  {days.map((d) => (
                    <td key={d.date} className={`text-center !px-2 ${d.weekend ? "bg-slate-500/5" : ""}`}>
                      {d.weekend ? <span className="muted">-</span> : editable.has(d.date) ? (
                        <button onClick={() => toggle(l.id, d.date)} className="rounded-full hover:ring-2 ring-brand-300 w-8 h-8 inline-grid place-items-center" aria-label={`${l.name} ${d.date}: ${LABEL[marks[`${l.id}:${d.date}`]] ?? "not marked"}`}>
                          <StatusDot s={marks[`${l.id}:${d.date}`] ?? ""} />
                        </button>
                      ) : <StatusDot s={marks[`${l.id}:${d.date}`] ?? ""} />}
                    </td>
                  ))}
                  <td className={`text-center font-semibold ${rate != null && rate < 85 ? "text-rose-600" : ""}`}>{rate != null ? `${rate}%` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 text-xs muted">
        {(Object.keys(LABEL) as Status[]).map((s) => <span key={s} className="flex items-center gap-1.5"><StatusDot s={s} /> {LABEL[s]}</span>)}
        <span>Click a cell to cycle Present → Absent → Late → Excused → clear. Changes save automatically.</span>
      </div>
    </div>
  );
}
