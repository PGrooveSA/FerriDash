"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";

export type ActionResult = { error?: string; ok?: boolean; message?: string };
export type FormAction = (state: ActionResult, form: FormData) => Promise<ActionResult>;

export type Field = {
  name: string; label: string;
  type?: "text" | "email" | "number" | "date" | "time" | "select" | "textarea" | "password" | "tel" | "checkboxes";
  /** For checkboxes: group (e.g. class) and hint (e.g. current teacher) are optional. */
  options?: { value: string | number; label: string; group?: string; hint?: string }[];
  /** Pre-ticked values for a checkboxes field. */
  defaultValues?: (string | number)[];
  required?: boolean; defaultValue?: string | number | null; placeholder?: string; half?: boolean; step?: string; help?: string;
};

export function FormDialog({ title, fields, action, hidden = {}, trigger = "add", triggerLabel, submitLabel = "Save", size = "md" }: {
  title: string; fields: Field[]; action: FormAction; hidden?: Record<string, string | number>;
  trigger?: "add" | "edit" | "button"; triggerLabel?: string; submitLabel?: string; size?: "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal(); else ref.current?.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) { setOpen(false); router.refresh(); }
  }, [state, router]);

  return (
    <>
      {trigger === "add" && <button type="button" onClick={() => setOpen(true)} className="btn btn-primary"><Plus className="w-4 h-4" />{triggerLabel ?? "Add"}</button>}
      {trigger === "button" && <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">{triggerLabel}</button>}
      {trigger === "edit" && <button type="button" onClick={() => setOpen(true)} className="icon-btn !w-8 !h-8" aria-label={`Edit ${title}`}><Pencil className="w-3.5 h-3.5" /></button>}
      <dialog ref={ref} onClose={() => setOpen(false)} className={`m-auto w-[calc(100%-2rem)] ${size === "lg" ? "max-w-2xl" : "max-w-lg"} bg-transparent backdrop:bg-slate-900/30 backdrop:backdrop-blur-sm`}>
        {open && (
          <form action={formAction} className="glass-solid p-6 text-[var(--ink)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button type="button" className="icon-btn !w-8 !h-8" onClick={() => setOpen(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <div className="grid grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto p-0.5">
              {fields.map((f) => (
                <div key={f.name} className={f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
                  <label className="label" htmlFor={`f-${f.name}`}>{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>
                  {f.type === "select" ? (
                    <select id={`f-${f.name}`} name={f.name} required={f.required} defaultValue={f.defaultValue ?? ""} className="input">
                      {!f.required && <option value="">-</option>}
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "checkboxes" ? (
                    <CheckboxGroup field={f} />
                  ) : f.type === "textarea" ? (
                    <textarea id={`f-${f.name}`} name={f.name} required={f.required} defaultValue={f.defaultValue ?? ""} placeholder={f.placeholder} rows={4} className="input" />
                  ) : (
                    <input id={`f-${f.name}`} name={f.name} type={f.type ?? "text"} step={f.step} required={f.required} defaultValue={f.defaultValue ?? ""} placeholder={f.placeholder} className="input" />
                  )}
                  {f.help && <p className="text-xs muted mt-1">{f.help}</p>}
                </div>
              ))}
            </div>
            {state?.error && <p role="alert" className="text-sm text-rose-600 mt-3">{state.error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : submitLabel}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

export function DeleteButton({ action, label = "this record" }: { action: () => Promise<ActionResult | void>; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} className="icon-btn !w-8 !h-8 hover:!bg-rose-500/15 hover:text-rose-600" aria-label={`Delete ${label}`}
      onClick={async () => {
        if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
        setBusy(true);
        const r = await action();
        setBusy(false);
        if (r && "error" in r && r.error) alert(r.error); else router.refresh();
      }}>
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

/** A row of GET filters that updates the URL as soon as a value changes. */
export function Filters({ filters, search }: { filters: { name: string; label: string; options: { value: string | number; label: string }[]; value?: string | number | null; allLabel?: string }[]; search?: { name: string; placeholder: string; value?: string } }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const set = (name: string, value: string) => {
    const q = new URLSearchParams(params.toString());
    if (value) q.set(name, value); else q.delete(name);
    q.delete("page");
    router.push(`${path}?${q.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search && (
        <form onSubmit={(e) => { e.preventDefault(); set(search.name, String(new FormData(e.currentTarget).get(search.name) || "")); }}>
          <input name={search.name} defaultValue={search.value} placeholder={search.placeholder} className="input !rounded-full !py-2 w-56" aria-label={search.placeholder} />
        </form>
      )}
      {filters.map((f) => (
        <select key={f.name} aria-label={f.label} value={f.value ?? ""} onChange={(e) => set(f.name, e.target.value)} className="input !rounded-full !py-2 !w-auto">
          {f.allLabel !== undefined && <option value="">{f.allLabel}</option>}
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </div>
  );
}

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn btn-primary no-print">{label}</button>;
}

export function CsvButton({ filename, rows, label = "Export CSV" }: { filename: string; rows: (string | number | null)[][]; label?: string }) {
  return (
    <button type="button" className="btn btn-ghost no-print" onClick={() => {
      const csv = rows.map((r) => r.map((c) => { const s = c == null ? "" : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    }}>{label}</button>
  );
}

/** Grouped tick-box list with a quick filter; submits every ticked value under the field name. */
function CheckboxGroup({ field }: { field: Field }) {
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set((field.defaultValues ?? []).map(String)));
  const opts = field.options ?? [];
  const q = filter.trim().toLowerCase();
  const visible = q ? opts.filter((o) => `${o.group ?? ""} ${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : opts;
  const groups = [...new Set(visible.map((o) => o.group ?? ""))];
  const toggle = (v: string) => setPicked((p) => { const n = new Set(p); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  if (!opts.length) return <p className="text-sm muted">Nothing to choose yet. Add classes and subjects under Classes &amp; Subjects first.</p>;
  return (
    <div className="rounded-2xl border border-line bg-[var(--glass-solid)]">
      <div className="flex items-center gap-2 p-2 border-b border-line">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by class or subject" className="input !py-1.5 !text-sm" aria-label={`Filter ${field.label}`} />
        <span className="chip chip-info shrink-0">{picked.size} selected</span>
      </div>
      {/* Hidden inputs carry the ticked values, including ones filtered out of view. */}
      {[...picked].map((v) => <input key={v} type="hidden" name={field.name} value={v} />)}
      <div className="max-h-56 overflow-y-auto p-2 space-y-2">
        {groups.map((g) => (
          <div key={g}>
            {g && <p className="text-xs font-semibold muted px-1 mb-1">{g}</p>}
            <div className="grid sm:grid-cols-2 gap-1">
              {visible.filter((o) => (o.group ?? "") === g).map((o) => {
                const v = String(o.value);
                return (
                  <label key={v} className={`flex items-start gap-2 rounded-xl px-2 py-1.5 cursor-pointer text-sm ${picked.has(v) ? "bg-brand-100/70 dark:bg-brand-500/15" : "hover:bg-white/50 dark:hover:bg-white/5"}`}>
                    <input type="checkbox" className="mt-0.5 accent-[var(--color-brand-500)]" checked={picked.has(v)} onChange={() => toggle(v)} />
                    <span className="min-w-0"><span className="block">{o.label}</span>{o.hint && <span className="block text-[0.7rem] muted">{o.hint}</span>}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {!visible.length && <p className="text-sm muted px-1">No matches.</p>}
      </div>
    </div>
  );
}

