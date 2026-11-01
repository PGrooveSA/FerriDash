import Link from "next/link";
import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { logoUrl } from "@/lib/format";
import ApplyForm from "./ApplyForm";

export const dynamic = "force-dynamic";

type S = { id: number; name: string; address: string | null; phone: string | null; email: string | null; logo_updated_at: string | null; school_type: string; admissions_open: number; admissions_year: number | null; admissions_info: string | null; current_year: number; active: number };

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const s = await get<{ name: string }>("SELECT name FROM schools WHERE admissions_code = ?", (await params).code);
  return { title: s ? `Apply to ${s.name}` : "Apply", robots: { index: false } };
}

/** A school's public online application form (the link is shown under Admissions). No sign-in needed. */
export default async function ApplyPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code;
  if (!/^[a-z0-9]{4,20}$/.test(code)) notFound();
  const s = await get<S>("SELECT id, name, address, phone, email, logo_updated_at, school_type, admissions_open, admissions_year, admissions_info, current_year, active FROM schools WHERE admissions_code = ?", code);
  if (!s || !s.active) notFound();
  const year = s.admissions_year ?? s.current_year + 1;
  const grades = s.school_type === "Primary" ? [0, 1, 2, 3, 4, 5, 6, 7] : s.school_type === "Secondary" ? [8, 9, 10, 11, 12] : Array.from({ length: 13 }, (_, g) => g);
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="glass-solid p-6 flex items-center gap-4">
          <img src={logoUrl(s.id, s.logo_updated_at) ?? "/icon.svg"} alt="" className="w-16 h-16 object-contain" />
          <div>
            <h1 className="text-2xl font-bold">{s.name}</h1>
            <p className="text-sm muted">Application for admission · {year}</p>
            <p className="text-xs muted">{[s.address, s.phone, s.email].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
        {s.admissions_open ? (
          <>
            {s.admissions_info && <section className="glass p-5 text-sm whitespace-pre-line">{s.admissions_info}</section>}
            <ApplyForm code={code} grades={grades} year={year} />
          </>
        ) : (
          <section className="glass p-8 text-center"><h2 className="text-xl font-semibold">Applications are closed</h2><p className="muted mt-2">{s.name} is not accepting applications online at the moment. Please contact the school office.</p></section>
        )}
        <p className="text-xs muted text-center">Your information is processed by the school under POPIA. <Link href="/legal/privacy" className="underline">Privacy policy</Link> · Powered by FerriDash</p>
      </div>
    </main>
  );
}
