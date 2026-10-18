import LoginForm from "./LoginForm";
import { GraduationCap, ShieldCheck, LineChart, Users } from "lucide-react";
import LoginBackdrop from "@/components/LoginBackdrop";

export const metadata = { title: "Sign in" };

// The sign-in page is shared by every school on the platform, so it carries no school branding.
export default function LoginPage() {
  return (
    <>
      <LoginBackdrop />
      <main className="relative z-10 min-h-screen grid lg:grid-cols-2 gap-6 p-4 sm:p-8">
        <section className="hidden lg:flex glass flex-col justify-between p-10 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="w-11 h-11" />
            <span className="text-2xl font-bold tracking-tight">Sekolo</span>
          </div>
          <div>
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight max-w-lg">
              Learning today, <span className="bg-gradient-to-r from-brand-500 via-gold-500 to-berry-500 bg-clip-text text-transparent">leading tomorrow</span>.
            </h1>
            <p className="muted mt-4 max-w-md">CAPS-aligned results, report cards, attendance and fees in Rand, built for South African schools from Grade R to Grade 12.</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md text-sm">
              {[
                [GraduationCap, "CAPS 7-point scale", "text-brand-500"],
                [LineChart, "Results & reports", "text-gold-500"],
                [Users, "Parent access", "text-berry-500"],
                [ShieldCheck, "POPIA-minded", "text-brand-500"],
              ].map(([Icon, label, tone], i) => {
                const I = Icon as typeof GraduationCap;
                return (
                  <li key={i} className="glass-strong rounded-2xl px-4 py-3 flex items-center gap-2 font-medium">
                    <I className={`w-4 h-4 ${tone as string}`} /> {label as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs muted">Copyright © Infinite Q Graphics</p>
        </section>

        <section className="flex items-center justify-center">
          <div className="glass w-full max-w-md p-8 sm:p-10">
            <div className="flex items-center gap-3 lg:hidden mb-6">
              <img src="/icon.svg" alt="" className="w-10 h-10" />
              <span className="text-xl font-bold">Sekolo</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="muted text-sm mt-1">Sign in with your school email address.</p>
            <LoginForm />
            <p className="text-xs muted mt-6">Demo accounts are listed in the README. Your information is processed in line with POPIA.</p>
          </div>
        </section>
      </main>
    </>
  );
}
