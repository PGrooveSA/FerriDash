"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { previewImport, runImport, type ImportState } from "@/app/actions/import";
import type { ImportKind } from "@/lib/importer";
import { CsvButton } from "@/components/ui/forms";

export default function ImportStep({ step, kind, title, template, current, hint }: { step: number; kind: ImportKind; title: string; template: string; current: string; hint: string }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [state, setState] = useState<ImportState>({});
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const choose = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setState({ error: "Choose a .csv file. In Excel use File → Save As → CSV UTF-8." }); return; }
    const text = await f.text();
    setFile({ name: f.name, text });
    setOnlyErrors(false);
    start(async () => setState(await previewImport(kind, text)));
  };
  const reset = () => { setFile(null); setState({}); if (input.current) input.current.value = ""; };

  const p = state.preview;
  const blocked = !!p && (p.fileErrors.length > 0 || p.counts.errors > 0);
  const rows = p ? (onlyErrors ? p.rows.filter((r) => r.errors.length) : p.rows) : [];

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="w-9 h-9 shrink-0 rounded-full bg-brand-500 text-white font-semibold grid place-items-center">{step}</span>
          <div>
            <h2 className="text-lg font-semibold">{title} <span className="text-xs muted font-normal ml-1">{current}</span></h2>
            <p className="text-sm muted max-w-2xl">{hint}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/import-template/${template}`} className="btn btn-ghost"><Download className="w-4 h-4" />Template</a>
          <label className="btn btn-primary cursor-pointer">
            <FileUp className="w-4 h-4" />{file ? "Choose another file" : "Upload CSV"}
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {pending && <p className="text-sm muted mt-4">{state.preview ? "Importing…" : "Checking the file…"}</p>}
      {state.error && <p role="alert" className="text-sm text-rose-600 mt-4">{state.error}</p>}

      {state.done && (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-emerald-600 font-medium"><CheckCircle2 className="w-5 h-5" />{state.done.message}</p>
          {state.done.credentials.length > 0 && (
            <div className="rounded-2xl border border-butter-500/40 bg-butter-500/10 p-4">
              <p className="font-medium flex items-center gap-2"><KeyRound className="w-4 h-4" />{state.done.credentials.length} new login{state.done.credentials.length === 1 ? "" : "s"}: temporary passwords</p>
              <p className="text-sm muted mb-3">Download this list now and share each password privately. It is shown only once; after that, set a new password from the Teachers, Learners or Parents page.</p>
              <CsvButton filename={`${kind}-logins.csv`} label="Download logins (CSV)" rows={[["Role", "Name", "Email (login)", "Temporary password"], ...state.done.credentials.map((c) => [c.role, c.name, c.email, c.password])]} />
              <div className="overflow-x-auto mt-3 max-h-72 overflow-y-auto">
                <table className="table">
                  <thead><tr><th>Role</th><th>Name</th><th>Email (login)</th><th>Temporary password</th></tr></thead>
                  <tbody>{state.done.credentials.map((c) => <tr key={c.email}><td>{c.role}</td><td>{c.name}</td><td>{c.email}</td><td className="font-mono text-sm">{c.password}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={reset}>Import another file</button>
        </div>
      )}

      {p && !state.done && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{file?.name}</span>
            <span className="chip chip-green">{p.counts.new} new</span>
            <span className="chip chip-info">{p.counts.update} to update</span>
            {p.counts.errors > 0 && <span className="chip chip-red">{p.counts.errors} with errors</span>}
            {p.counts.errors > 0 && <label className="flex items-center gap-1.5 ml-2 muted"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />Show only rows with errors</label>}
          </div>
          {p.fileErrors.map((e) => <p key={e} role="alert" className="text-sm text-rose-600 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{e}</p>)}
          {rows.length > 0 && (
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="table">
                <thead><tr><th>Row</th><th>Record</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? "bg-rose-500/5" : ""}>
                    <td className="font-mono text-xs">{r.line}</td>
                    <td className="text-sm font-medium">{r.label}</td>
                    <td>{r.errors.length ? <span className="chip chip-red">Error</span> : r.action === "new" ? <span className="chip chip-green">New</span> : <span className="chip chip-info">Update</span>}</td>
                    <td className="text-sm">
                      {r.errors.map((e) => <p key={e} className="text-rose-600">{e}</p>)}
                      {!r.errors.length && (r.notes.length ? r.notes.map((n) => <p key={n} className={n.startsWith("⚠") ? "text-amber-600 font-medium" : "muted"}>{n}</p>) : <span className="muted">-</span>)}
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={blocked || pending || p.counts.new + p.counts.update === 0}
              onClick={() => file && start(async () => { const r = await runImport(kind, file.text); setState({ ...r, preview: p }); if (r.done) router.refresh(); })}>
              {pending ? "Importing…" : `Import ${p.counts.new + p.counts.update} record${p.counts.new + p.counts.update === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button>
            {blocked && <p className="text-sm text-rose-600">{p.fileErrors.length ? "Fix the file" : "Fix the rows marked Error"} in your spreadsheet, save, and upload it again. Nothing has been saved.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
