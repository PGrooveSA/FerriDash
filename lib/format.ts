const zarFmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const zarWhole = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

export const zar = (n: number | null | undefined, whole = false) => (whole ? zarWhole : zarFmt).format(n ?? 0);

export const gradeLabel = (g: number) => (g === 0 ? "Grade R" : `Grade ${g}`);

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "-";
  // Plain dates are calendar days; SQLite datetimes ("YYYY-MM-DD HH:MM:SS") are stored in UTC.
  if (d.length === 10) return new Date(d + "T00:00:00Z").toLocaleDateString("en-ZA", { ...opts, timeZone: "UTC" });
  const iso = /[TZ+]/.test(d.slice(10)) ? d : d.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleDateString("en-ZA", { ...opts, timeZone: "Africa/Johannesburg" });
}

export const fullName = (u: { title?: string | null; first_name: string; last_name: string }, withTitle = false) =>
  `${withTitle && u.title ? u.title + " " : ""}${u.first_name} ${u.last_name}`;

export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

export const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Platform Admin", school_admin: "School Admin", teacher: "Educator", learner: "Learner", parent: "Parent / Guardian",
};

/** Validates a South African ID number (13 digits, Luhn checksum) and decodes it. */
export function parseSaId(id: string): { valid: boolean; dob?: string; gender?: "Male" | "Female"; citizen?: boolean } {
  if (!/^\d{13}$/.test(id)) return { valid: false };
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = Number(id[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  if ((10 - (sum % 10)) % 10 !== Number(id[12])) return { valid: false };
  const yy = Number(id.slice(0, 2)), mm = id.slice(2, 4), dd = id.slice(4, 6);
  const century = yy > new Date().getFullYear() % 100 ? 1900 : 2000;
  return { valid: true, dob: `${century + yy}-${mm}-${dd}`, gender: Number(id.slice(6, 10)) < 5000 ? "Female" : "Male", citizen: id[10] === "0" };
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}

/** URL of a user's profile photo, or null when they have none. The version busts caches after a new upload. */
export const avatarUrl = (userId: number | null | undefined, version: string | null | undefined) =>
  userId && version ? `/api/avatar/${userId}?v=${encodeURIComponent(version)}` : null;

/** URL of a school's logo, or null when it has none. */
/** A user's banner picture, or null when they haven't added one. */
export const bannerUrl = (userId: number | null | undefined, version: string | null | undefined) =>
  userId && version ? `/api/banner/${userId}?v=${encodeURIComponent(version)}` : null;

export const logoUrl = (schoolId: number | null | undefined, version: string | null | undefined) =>
  schoolId && version ? `/api/logo/${schoolId}?v=${encodeURIComponent(version)}` : null;
