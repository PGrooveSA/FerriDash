import { logoUrl } from "@/lib/format";

type SchoolLike = { id: number; name: string; logo_updated_at: string | null };

/** Initials such as "SS" for "Sunnyside Secondary School" (ignores small words). */
export const schoolInitials = (name: string) =>
  name.split(/\s+/).filter((w) => /^[A-Z]/.test(w) && !/^(School|The)$/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2).toUpperCase();

/** The school's uploaded logo, or a colourful initials badge when it has none. */
export default function SchoolCrest({ school, size = 64, className = "" }: { school: SchoolLike; size?: number; className?: string }) {
  const url = logoUrl(school.id, school.logo_updated_at);
  return (
    <span className={`inline-grid place-items-center shrink-0 rounded-[28%] overflow-hidden ${url ? "bg-white/80 dark:bg-white/10 ring-1 ring-white/70 dark:ring-white/10 shadow-sm" : "bg-gradient-to-br from-brand-400 via-berry-400 to-gold-400 text-white shadow-md"} ${className}`}
      style={{ width: size, height: size }} title={school.name}>
      {url
        ? <img src={url} alt={`${school.name} logo`} className="w-[86%] h-[86%] object-contain" />
        : <span className="font-black tracking-tight" style={{ fontSize: size * 0.38 }}>{schoolInitials(school.name)}</span>}
    </span>
  );
}

/** Banner strip with crest, school name and motto for the top of dashboards. */
export function SchoolBanner({ school, children }: { school: SchoolLike & { motto: string | null; province: string; current_term: number; current_year: number }; children?: React.ReactNode }) {
  return (
    <div className="glass p-5 sm:p-6 flex flex-wrap items-center gap-5 bg-gradient-to-r from-brand-200/60 via-gold-100/50 to-berry-100/60 dark:from-brand-500/15 dark:via-transparent dark:to-berry-500/15">
      <SchoolCrest school={school} size={76} />
      <div className="flex-1 min-w-[14rem]">
        <h1 className="text-2xl font-bold tracking-tight">{school.name}</h1>
        {school.motto && <p className="text-sm italic muted">“{school.motto}”</p>}
        <p className="text-xs muted mt-1">{school.province} · Term {school.current_term}, {school.current_year}</p>
      </div>
      {children}
    </div>
  );
}

/** Crest with the school name underneath, for the right side of welcome banners. */
export function SchoolMark({ school }: { school: SchoolLike }) {
  return (
    <div className="text-center shrink-0 ml-auto">
      <SchoolCrest school={school} size={84} />
      <p className="text-xs font-semibold mt-2 max-w-[9rem] leading-snug">{school.name}</p>
    </div>
  );
}
