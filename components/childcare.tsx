import { AlertTriangle } from "lucide-react";
import type { Allergy } from "@/lib/childcare";

/** Allergy chips beside a child's name: severe ones in red with a warning sign, so nobody misses them. */
export function AllergyChips({ allergies, compact = false }: { allergies: Pick<Allergy, "id" | "allergen" | "severity">[]; compact?: boolean }) {
  if (!allergies.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {allergies.map((a) => (
        <span key={a.id} title={`${a.severity} allergy: ${a.allergen}`}
          className={`chip ${a.severity === "Severe" ? "chip-red ring-1 ring-rose-400" : a.severity === "Moderate" ? "chip-butter" : "chip-slate"} ${compact ? "!text-[0.68rem] !py-0" : ""}`}>
          {a.severity === "Severe" && <AlertTriangle className="w-3 h-3" />}{a.allergen}
        </span>
      ))}
    </span>
  );
}

/** "14 months" or "3 years 2 months" from a date of birth (YYYY-MM-DD), on a given day. */
export function ageText(dob: string | null, on: string): string {
  if (!dob) return "-";
  const [y, m, d] = dob.split("-").map(Number), [ty, tm, td] = on.split("-").map(Number);
  let months = (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0);
  if (months < 0) months = 0;
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const yrs = Math.floor(months / 12), rest = months % 12;
  return `${yrs} years${rest ? ` ${rest} month${rest === 1 ? "" : "s"}` : ""}`;
}

/** Today's state for a child: not arrived, in since..., or gone home at... */
export function todayStatus(c: { in_at: string | null; out_at: string | null }) {
  return !c.in_at ? { label: "Not in today", tone: "chip-slate" } : c.out_at ? { label: `Home ${c.out_at}`, tone: "chip-info" } : { label: `In since ${c.in_at}`, tone: "chip-green" };
}
