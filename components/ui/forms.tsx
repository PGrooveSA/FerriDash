"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, FileText, Pencil, Plus, Trash2, X } from "lucide-react";

export type ActionResult = { error?: string; ok?: boolean; message?: string };
export type FormAction = (state: ActionResult, form: FormData) => Promise<ActionResult>;

export type Field = {
  name: string; label: string;
  type?: "text" | "email" | "number" | "date" | "time" | "select" | "textarea" | "password" | "tel" | "checkboxes" | "file";
  /** For file fields: allowed types (e.g. ".pdf,application/pdf") and size limit in MB. */
  accept?: string; maxMb?: number;
  /** For checkboxes: group (e.g. class) and hint (e.g. current teacher) are optional. */
  options?: { value: string | number; label: string; group?: string; hint?: string }[];
  /** Pre-ticked values for a checkboxes field. */
  defaultValues?: (string | number)[];
  /** For checkboxes: message shown when there is nothing to choose from. */
  emptyText?: string;
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
        {/* Submitting through onSubmit (not the action prop) stops React from clearing every field
            after the server replies, so entries survive a validation error. */}
        {open && (
          <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => formAction(data)); }} className="glass-solid p-6 text-[var(--ink)]">
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
                  ) : f.type === "file" ? (
                    <FileField field={f} />
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

/** A small button that runs a server action after the user confirms (e.g. "Reinstate"). */
export function ConfirmButton({ action, label, confirmText }: { action: () => Promise<ActionResult | void>; label: string; confirmText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} className="btn btn-ghost btn-sm"
      onClick={async () => {
        if (!confirm(confirmText)) return;
        setBusy(true);
        const r = await action();
        setBusy(false);
        if (r && "error" in r && r.error) alert(r.error); else router.refresh();
      }}>
      {busy ? "Working..." : label}
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

/**
 * Multi-select dropdown: a select-style button that opens a list of tick-boxes (with a filter).
 * Every ticked value is submitted under the field name.
 */
function CheckboxGroup({ field }: { field: Field }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set((field.defaultValues ?? []).map(String)));
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opts = field.options ?? [];
  const q = filter.trim().toLowerCase();
  const visible = q ? opts.filter((o) => `${o.group ?? ""} ${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : opts;
  const groups = [...new Set(visible.map((o) => o.group ?? ""))];
  const grouped = groups.some(Boolean);
  const toggle = (v: string) => setPicked((p) => { const n = new Set(p); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  // Close when clicking outside; keep the open panel in view inside the scrolling form.
  useEffect(() => {
    if (!open) return;
    panel.current?.scrollIntoView({ block: "nearest" });
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!opts.length) return <p className="text-sm muted rounded-2xl border border-dashed border-line px-3 py-2">{field.emptyText ?? "Nothing to choose yet."}</p>;

  const chosen = opts.filter((o) => picked.has(String(o.value)));
  const summary = chosen.length === 0 ? (field.placeholder ?? "Select…")
    : chosen.length <= 3 ? chosen.map((o) => (o.group && grouped ? `${o.group.replace(/^Class /, "").split(" ·")[0]} ${o.label}` : o.label)).join(", ")
    : `${chosen.length} selected`;

  return (
    <div ref={box} className="relative">
      {/* Hidden inputs carry the ticked values, even while the dropdown is closed. */}
      {[...picked].map((v) => <input key={v} type="hidden" name={field.name} value={v} />)}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={`input flex items-center gap-2 text-left ${open ? "ring-2 ring-brand-300" : ""}`}>
        <span className={`flex-1 truncate ${chosen.length ? "" : "muted"}`}>{summary}</span>
        {chosen.length > 0 && <span className="chip chip-info shrink-0">{chosen.length}</span>}
        <ChevronDown className={`w-4 h-4 shrink-0 muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={panel} role="listbox" aria-multiselectable
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}
          className="absolute z-30 left-0 right-0 mt-1 rounded-2xl border border-line bg-[var(--glass-solid)] backdrop-blur-xl shadow-xl">
          {opts.length > 6 && (
            <div className="p-2 border-b border-line">
              <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to filter" className="input !py-1.5 !text-sm" aria-label={`Filter ${field.label}`} />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-2 space-y-2">
            {groups.map((g) => (
              <div key={g}>
                {g && <p className="text-xs font-semibold muted px-1 mb-1">{g}</p>}
                <div className={`grid gap-0.5 ${field.half ? "" : "sm:grid-cols-2"}`}>
                  {visible.filter((o) => (o.group ?? "") === g).map((o) => {
                    const v = String(o.value);
                    return (
                      <label key={v} className={`flex items-start gap-2 rounded-xl px-2 py-1.5 cursor-pointer text-sm ${picked.has(v) ? "bg-brand-100/70 dark:bg-brand-500/15" : "hover:bg-white/60 dark:hover:bg-white/5"}`}>
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
          <div className="flex items-center justify-between gap-2 p-2 border-t border-line">
            <button type="button" className="text-xs muted hover:text-[var(--ink)] disabled:opacity-40" disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Paper-size picker (A4 / A5 portrait) and a Download PDF button.
 * Uses the browser's print dialog ("Save as PDF"), which works offline. The paper size is applied
 * with an @page rule and the document title becomes the suggested file name.
 */
export function PdfButtons({ filename, label = "Download PDF" }: { filename: string; label?: string }) {
  const [size, setSize] = useState<"A4" | "A5">("A4");
  const download = () => {
    const html = document.documentElement;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${size} portrait; margin: ${size === "A5" ? "8mm" : "12mm"}; }`;
    document.head.appendChild(style);
    html.classList.add(size === "A5" ? "print-a5" : "print-a4");
    const title = document.title;
    document.title = filename;
    const cleanup = () => {
      style.remove();
      html.classList.remove("print-a4", "print-a5");
      document.title = title;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };
  return (
    <div className="no-print flex items-center gap-2">
      <div className="glass-strong rounded-full p-1 flex" role="radiogroup" aria-label="Paper size">
        {(["A4", "A5"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)}
            className={`px-3 py-1.5 rounded-full text-sm ${size === s ? "bg-brand-500 text-white" : "muted hover:text-[var(--ink)]"}`}>{s}</button>
        ))}
      </div>
      <button type="button" onClick={download} className="btn btn-primary">{label}</button>
    </div>
  );
}

/** File picker that only accepts the given type (checked again on the server) and shows the chosen file. */
function FileField({ field }: { field: Field }) {
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pdfOnly = (field.accept ?? "").includes("pdf");
  return (
    <div>
      <label className={`flex items-center gap-3 rounded-2xl border border-dashed px-3 py-2.5 cursor-pointer transition ${error ? "border-rose-400 bg-rose-50/60 dark:bg-rose-500/10" : "border-line hover:border-brand-400 bg-[var(--glass-solid)]"}`}>
        <FileText className="w-5 h-5 shrink-0 text-rose-500" />
        <span className={`flex-1 truncate text-sm ${name ? "" : "muted"}`}>{name ?? field.placeholder ?? "Choose a file"}</span>
        <span className="btn btn-ghost btn-sm">Browse</span>
        <input id={`f-${field.name}`} name={field.name} type="file" accept={field.accept} className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setError(null); setName(file?.name ?? null);
            if (!file) return;
            const isPdfFile = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
            if (pdfOnly && !isPdfFile) { setError("Only PDF documents can be uploaded."); setName(null); e.target.value = ""; return; }
            if (field.maxMb && file.size > field.maxMb * 1024 * 1024) { setError(`That file is larger than ${field.maxMb} MB.`); setName(null); e.target.value = ""; }
          }} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
