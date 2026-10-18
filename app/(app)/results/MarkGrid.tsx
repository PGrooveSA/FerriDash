"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveMarks } from "@/app/actions/results";
import { capsLevel, termMark, type AssessmentLite, type MarkLite } from "@/lib/caps";

type A = AssessmentLite & { name: string };
type Learner = { id: number; name: string; admission_number: string };

const key = (l: number, a: number) => `${l}:${a}`;
const display = (m?: MarkLite) => (!m ? "" : m.absent ? "ab" : m.mark == null ? "" : String(m.mark));

export default function MarkGrid({ grade, term, assessments, learners, initial, locked }: {
  grade: number; term: number; assessments: A[]; learners: Learner[]; initial: Record<string, MarkLite>; locked: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, m]) => [k, display(m)])));
  const [saved, setSaved] = useState<Record<string, string>>(values);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [pending, start] = useTransition();
  const grid = useRef<HTMLTableElement>(null);

  const valid = (a: A, v: string) => { const s = v.trim().toLowerCase(); if (s === "" || s === "ab" || s === "a") return true; const n = Number(s.replace(",", ".")); return !Number.isNaN(n) && n >= 0 && n <= a.max_mark; };

  const persist = (cells: { assessmentId: number; learnerId: number; value: string }[]) => {
    const changed = cells.filter((c) => (saved[key(c.learnerId, c.assessmentId)] ?? "") !== c.value);
    if (!changed.length) return;
    start(async () => {
      const r = await saveMarks(changed);
      if (r.error) setMsg({ text: r.error, tone: "err" });
      else {
        setSaved((s) => ({ ...s, ...Object.fromEntries(changed.map((c) => [key(c.learnerId, c.assessmentId), c.value])) }));
        setMsg({ text: `Saved ${changed.length} mark${changed.length === 1 ? "" : "s"}.`, tone: "ok" });
      }
    });
  };

  const update = (l: number, a: A, v: string) => {
    setValues((s) => ({ ...s, [key(l, a.id)]: v }));
    setErrors((e) => ({ ...e, [key(l, a.id)]: !valid(a, v) }));
  };

  // Paste a block copied from Excel / Google Sheets starting at this cell.
  const onPaste = (e: React.ClipboardEvent, li: number, ai: number) => {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, "").split("\n").filter((r, i, arr) => r !== "" || i < arr.length - 1);
    const cells: { assessmentId: number; learnerId: number; value: string }[] = [];
    const next = { ...values }, errs = { ...errors };
    rows.forEach((row, r) => row.split("\t").forEach((v, c) => {
      const l = learners[li + r], a = assessments[ai + c];
      if (!l || !a) return;
      const val = v.trim();
      next[key(l.id, a.id)] = val;
      errs[key(l.id, a.id)] = !valid(a, val);
      if (valid(a, val)) cells.push({ assessmentId: a.id, learnerId: l.id, value: val });
    }));
    setValues(next); setErrors(errs);
    persist(cells);
  };

  const move = (e: React.KeyboardEvent, li: number, ai: number) => {
    const d = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    grid.current?.querySelector<HTMLInputElement>(`input[data-cell="${li + d[0]}-${ai + d[1]}"]`)?.focus();
  };

  const computed = useMemo(() => learners.map((l) => {
    const m = new Map<number, MarkLite>();
    for (const a of assessments) {
      const v = (values[key(l.id, a.id)] ?? "").trim().toLowerCase();
      if (v === "" || !valid(a, v)) continue;
      if (v === "ab" || v === "a") m.set(a.id, { mark: null, absent: 1 });
      else if (!Number.isNaN(Number(v.replace(",", ".")))) m.set(a.id, { mark: Number(v.replace(",", ".")), absent: 0 });
    }
    return termMark(grade, assessments, m, term);
  }), [values, learners, assessments, grade, term]);

  const filled = computed.filter((v) => v != null) as number[];
  const avg = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <span className="muted">Type a mark, <b>ab</b> for absent, or paste a block from Excel. Marks save when you leave a cell.</span>
        <span className="ml-auto">{pending ? <span className="chip chip-butter">Saving…</span> : msg && <span className={`chip ${msg.tone === "ok" ? "chip-green" : "chip-red"}`}>{msg.text}</span>}</span>
      </div>
      <div className="overflow-x-auto">
        <table ref={grid} className="table">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[13rem]">Learner</th>
              {assessments.map((a) => (
                <th key={a.id} className="text-center min-w-[7.5rem]">
                  <div className="text-[var(--ink)]">{a.name}</div>
                  <div className="text-[0.68rem] font-normal">{a.kind} · /{a.max_mark}{a.weight !== 1 ? ` · ×${a.weight}` : ""}</div>
                </th>
              ))}
              <th className="text-center">Term %</th>
              <th className="text-center">Level</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l, li) => {
              const pct = computed[li], lvl = capsLevel(pct);
              return (
                <tr key={l.id}>
                  <td className="sticky left-0 bg-[var(--glass-solid)]"><p className="font-medium">{l.name}</p><p className="text-[0.68rem] muted font-mono">{l.admission_number}</p></td>
                  {assessments.map((a, ai) => {
                    const k = key(l.id, a.id), dirty = (values[k] ?? "") !== (saved[k] ?? "");
                    return (
                      <td key={a.id} className="text-center !py-1.5">
                        <input data-cell={`${li}-${ai}`} value={values[k] ?? ""} disabled={locked} inputMode="decimal"
                          onChange={(e) => update(l.id, a, e.target.value)}
                          onBlur={(e) => valid(a, e.target.value) && persist([{ assessmentId: a.id, learnerId: l.id, value: e.target.value.trim() }])}
                          onPaste={(e) => onPaste(e, li, ai)} onKeyDown={(e) => move(e, li, ai)}
                          aria-label={`${l.name} - ${a.name}`}
                          className={`input !w-20 !py-1.5 text-center ${errors[k] ? "!border-rose-500 !bg-rose-50 dark:!bg-rose-500/10" : dirty ? "!border-butter-500" : ""} ${locked ? "opacity-70" : ""}`} />
                      </td>
                    );
                  })}
                  <td className="text-center font-semibold">{pct == null ? "-" : `${Math.round(pct)}%`}</td>
                  <td className="text-center">{lvl ? <span className={`chip ${lvl.level >= 6 ? "chip-green" : lvl.level >= 4 ? "chip-info" : lvl.level === 3 ? "chip-butter" : "chip-red"}`} title={lvl.descriptor}>{lvl.level}</span> : "-"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-3 font-semibold">Class average</td>
              {assessments.map((a) => {
                const vals = learners.map((l) => Number((values[key(l.id, a.id)] ?? "").replace(",", "."))).filter((v, i) => !Number.isNaN(v) && (values[key(learners[i].id, a.id)] ?? "").trim() !== "" && values[key(learners[i].id, a.id)] !== "ab");
                return <td key={a.id} className="text-center text-sm muted">{vals.length ? `${Math.round((vals.reduce((x, y) => x + y, 0) / vals.length / a.max_mark) * 100)}%` : "-"}</td>;
              })}
              <td className="text-center font-bold">{avg != null ? `${avg}%` : "-"}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
