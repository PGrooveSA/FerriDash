import LoginForm from "./LoginForm";
import { GraduationCap, ShieldCheck, LineChart, Users } from "lucide-react";
import LoginBackdrop from "@/components/LoginBackdrop";
import BrandLogo from "@/components/BrandLogo";

export const metadata = { title: "Sign in" };

// The sign-in page is shared by every school on the platform, so it carries no school branding.
export default function LoginPage() {
  return (
    <>
      <LoginBackdrop />
      <main className="relative z-10 min-h-screen grid lg:grid-cols-2 gap-6 p-4 sm:p-8">
        <section className="hidden lg:flex login-hero flex-col justify-between p-10 relative overflow-hidden">
          {/* Large on desktop, scaling with the screen; never smaller than 15rem here. */}
          <BrandLogo variant="onDark" className="w-[clamp(15rem,30vw,28rem)] drop-shadow-[0_6px_24px_rgb(0_0_0/0.35)]" />
          <div>
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight max-w-lg text-white">
              Learning today, <span className="bg-gradient-to-r from-gold-300 via-brand-300 to-sky-300 bg-clip-text text-transparent">leading tomorrow</span>.
            </h1>
            <p className="text-sky-100/80 mt-4 max-w-md">CAPS-aligned results, report cards, attendance and fees in Rand, built for South African schools from Grade R to Grade 12.</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md text-sm">
              {[
                [GraduationCap, "CAPS 7-point scale", "text-gold-300"],
                [LineChart, "Results & reports", "text-sky-300"],
                [Users, "Parent access", "text-brand-300"],
                [ShieldCheck, "POPIA-minded", "text-gold-300"],
              ].map(([Icon, label, tone], i) => {
                const I = Icon as typeof GraduationCap;
                return (
                  <li key={i} className="rounded-2xl px-4 py-3 flex items-center gap-2 font-medium text-white bg-white/10 border border-white/15 backdrop-blur-md">
                    <I className={`w-4 h-4 ${tone as string}`} /> {label as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-sky-100/60">Copyright © Infinite Q Graphics</p>
        </section>

        <section className="flex items-center justify-center">
          <div className="glass login-card w-full max-w-md p-8 sm:p-10">
            {/* Phones and tablets (the welcome panel is hidden): smaller on phones, larger on tablets. */}
            <div className="lg:hidden mb-7 flex justify-center">
              <BrandLogo className="w-[clamp(11rem,55vw,18rem)]" />
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
