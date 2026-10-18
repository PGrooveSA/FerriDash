import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

export function Card({ title, action, children, className = "", bodyClass = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`glass p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="muted text-sm mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const TONES = {
  sky: "from-brand-200/80 to-brand-100/40 dark:from-brand-500/25 dark:to-brand-500/5",
  lilac: "from-lilac-200/80 to-lilac-100/40 dark:from-lilac-500/25 dark:to-lilac-500/5",
  butter: "from-butter-300/80 to-butter-100/40 dark:from-butter-500/25 dark:to-butter-500/5",
  green: "from-emerald-200/70 to-emerald-50/40 dark:from-emerald-500/20 dark:to-emerald-500/5",
} as const;

export function StatCard({ label, value, icon: Icon, tone = "sky", delta, hint }: { label: string; value: React.ReactNode; icon?: LucideIcon; tone?: keyof typeof TONES; delta?: number; hint?: string }) {
  return (
    <div className={`glass p-5 bg-gradient-to-br ${TONES[tone]} relative overflow-hidden`}>
      <div className="flex items-start justify-between">
        {Icon && <span className="icon-btn !w-10 !h-10"><Icon className="w-5 h-5" /></span>}
        {delta != null && (
          <span className={`chip ${delta >= 0 ? "chip-green" : "chip-red"} bg-white/70 dark:bg-white/10`}>
            {delta >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="text-3xl font-bold tracking-tight mt-4">{value}</p>
      <p className="text-sm font-medium mt-1">{label}</p>
      {hint && <p className="text-xs muted mt-0.5">{hint}</p>}
    </div>
  );
}

export function Empty({ title = "Nothing here yet", hint }: { title?: string; hint?: string }) {
  return (
    <div className="text-center py-12">
      <Inbox className="w-10 h-10 mx-auto muted" />
      <p className="font-semibold mt-3">{title}</p>
      {hint && <p className="text-sm muted mt-1">{hint}</p>}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto -mx-1 px-1">{children}</div>;
}

const STATUS_TONE: Record<string, string> = {
  paid: "chip-sky", published: "chip-green", approved: "chip-sky", submitted: "chip-butter", draft: "chip-slate",
  pending: "chip-butter", partial: "chip-butter", overdue: "chip-red", available: "chip-sky", "checked out": "chip-red",
  active: "chip-green", promoted: "chip-green", "not promoted": "chip-red", present: "chip-sky", absent: "chip-red", late: "chip-butter", excused: "chip-lilac",
  exempt: "chip-lilac",
};
export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${STATUS_TONE[status.toLowerCase()] ?? "chip-slate"}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{status}</span>;
}

export function Pager({ page, pages, makeHref }: { page: number; pages: number; makeHref: (p: number) => string }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div className="flex items-center justify-between mt-5">
      <Link aria-disabled={page <= 1} href={makeHref(Math.max(1, page - 1))} className={`btn btn-ghost btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}><ChevronLeft className="w-4 h-4" /> Previous</Link>
      <div className="flex items-center gap-1 text-sm">
        {nums.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && nums[i - 1] !== p - 1 && <span className="muted px-1">…</span>}
            <Link href={makeHref(p)} className={`w-8 h-8 grid place-items-center rounded-full ${p === page ? "bg-brand-200/80 dark:bg-brand-500/30 font-semibold" : "muted hover:bg-white/50"}`}>{p}</Link>
          </span>
        ))}
      </div>
      <Link aria-disabled={page >= pages} href={makeHref(Math.min(pages, page + 1))} className={`btn btn-ghost btn-sm ${page >= pages ? "pointer-events-none opacity-40" : ""}`}>Next <ChevronRight className="w-4 h-4" /></Link>
    </div>
  );
}

export function LevelBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="muted">-</span>;
  const p = Math.round(pct);
  const lvl = p >= 80 ? 7 : p >= 70 ? 6 : p >= 60 ? 5 : p >= 50 ? 4 : p >= 40 ? 3 : p >= 30 ? 2 : 1;
  const tone = lvl >= 6 ? "chip-green" : lvl >= 4 ? "chip-sky" : lvl === 3 ? "chip-butter" : "chip-red";
  return <span className={`chip ${tone}`} title={`CAPS level ${lvl}`}>L{lvl}</span>;
}

/** Builds a URL that keeps current search params and overrides some. */
export function hrefWith(base: string, params: Record<string, string | number | undefined | null>, override: Record<string, string | number | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...override })) if (v != null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
