import { cookies } from "next/headers";
import LoginForm from "./LoginForm";
import { GraduationCap, ShieldCheck, LineChart, Users } from "lucide-react";
import { all, get } from "@/lib/db";
import { logoUrl } from "@/lib/format";
import { LAST_SCHOOL_COOKIE } from "@/lib/session";

export const metadata = { title: "Sign in" };

type LoginSchool = { id: number; name: string; motto: string | null; logo_updated_at: string | null };

/** Which school's logo to show: a ?school=<EMIS or id> link, else the last school on this device, else the only school. */
async function pickSchool(param: string | undefined): Promise<LoginSchool | null> {
  const cols = "SELECT id, name, motto, logo_updated_at FROM schools WHERE active = 1";
  if (param) {
    const s = get<LoginSchool>(`${cols} AND (emis_number = ? OR id = ?)`, param, Number(param) || -1);
    if (s) return s;
  }
  const last = Number((await cookies()).get(LAST_SCHOOL_COOKIE)?.value);
  if (last) {
    const s = get<LoginSchool>(`${cols} AND id = ?`, last);
    if (s) return s;
  }
  const only = all<LoginSchool>(`${cols} LIMIT 2`);
  return only.length === 1 ? only[0] : null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const school = await pickSchool((await searchParams).school);
  const logo = school ? logoUrl(school.id, school.logo_updated_at) : null;
  return (
    <main className="min-h-screen grid lg:grid-cols-2 gap-6 p-4 sm:p-8">
      <section className="hidden lg:flex glass flex-col justify-between p-10 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="w-11 h-11" />
          <span className="text-2xl font-bold tracking-tight">Sekolo</span>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-bold leading-tight tracking-tight max-w-md">
              Run your school with <span className="bg-gradient-to-r from-brand-500 to-gold-500 bg-clip-text text-transparent">clarity</span>.
            </h1>
            <p className="muted mt-4 max-w-md">CAPS-aligned results, report cards, attendance and fees in Rand, built for South African schools from Grade R to Grade 12.</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md text-sm">
              {[
                [GraduationCap, "CAPS 7-point scale"],
                [LineChart, "Results & reports"],
                [Users, "Parent access"],
                [ShieldCheck, "POPIA-minded"],
              ].map(([Icon, label], i) => {
                const I = Icon as typeof GraduationCap;
                return (
                  <li key={i} className="glass-strong rounded-2xl px-4 py-3 flex items-center gap-2 font-medium">
                    <I className="w-4 h-4 text-brand-500" /> {label as string}
                  </li>
                );
              })}
            </ul>
          </div>
          {school && (
            <figure className="shrink-0 w-[clamp(9rem,16vw,15rem)] text-center">
              <div className="glass-strong aspect-square rounded-[2rem] grid place-items-center p-5">
                {logo
                  ? <img src={logo} alt={`${school.name} logo`} className="max-w-full max-h-full object-contain drop-shadow-sm" />
                  : <span className="w-full h-full rounded-[1.5rem] grid place-items-center text-5xl font-black text-white bg-gradient-to-br from-brand-400 to-gold-400">{school.name.split(" ").filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("")}</span>}
              </div>
              <figcaption className="mt-3">
                <p className="font-semibold leading-snug">{school.name}</p>
                {school.motto && <p className="text-xs muted italic mt-0.5">“{school.motto}”</p>}
              </figcaption>
            </figure>
          )}
        </div>
        <p className="text-xs muted">Copyright © Infinite Q Graphics</p>
      </section>

      <section className="flex items-center justify-center">
        <div className="glass w-full max-w-md p-8 sm:p-10">
          <div className="flex items-center gap-3 lg:hidden mb-6">
            {logo ? <img src={logo} alt="" className="w-12 h-12 object-contain" /> : <img src="/icon.svg" alt="" className="w-10 h-10" />}
            <span className="text-xl font-bold">{school?.name ?? "Sekolo"}</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="muted text-sm mt-1">{school ? <>Sign in to <b className="text-[var(--ink)]">{school.name}</b> with your school email address.</> : "Sign in with your school email address."}</p>
          <LoginForm />
          <p className="text-xs muted mt-6">Demo accounts are listed in the README. Your information is processed in line with POPIA.</p>
        </div>
      </section>
    </main>
  );
}
