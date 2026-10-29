import LoginForm from "./LoginForm";
import LoginBackdrop from "@/components/LoginBackdrop";
import BrandLogo from "@/components/BrandLogo";

export const metadata = { title: "Sign in" };

// The sign-in page is shared by every school on the platform, so it carries no school branding.
// One card over the animated dawn sky: the form on the left, a glass panel with 3D education art
// (generated with Higgsfield, public/brand/login-art-*.webp) on the right.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ended = (await searchParams).ended === "1";
  return (
    <>
      <LoginBackdrop />
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-6 p-4 sm:p-8">
        <div className="login-shell w-full max-w-5xl grid lg:grid-cols-2 overflow-hidden">
          <section className="login-form-side px-6 py-9 sm:px-12 sm:py-10 flex flex-col justify-center">
            <div className="w-full max-w-sm mx-auto">
              <div className="flex justify-center"><BrandLogo className="w-52" /></div>
              <h1 className="text-2xl font-semibold tracking-tight text-center mt-7">Sign in</h1>
              {ended && <p className="text-sm text-center mt-4 rounded-xl px-3 py-2 bg-brand-500/10">You have been signed out. If you can&apos;t sign in, contact your school office.</p>}
              <LoginForm />
              <p className="text-sm text-center muted mt-6">New to FerriDash? <span className="text-[var(--ink)] font-medium">Your school office creates your login.</span></p>
              <p className="text-xs text-center muted mt-3">Your information is processed in line with POPIA.</p>
            </div>
          </section>

          {/* Top and bottom clusters of the art frame the headline, so they never cover it. */}
          <section className="login-art-side hidden lg:flex flex-col justify-between gap-4 px-10 py-9" aria-label="Learning today, leading tomorrow">
            <img src="/brand/login-art-top.webp" alt="" width={1000} height={679} className="login-art w-[88%] self-center h-auto select-none" draggable={false} />
            <div className="text-white">
              <h2 className="text-[2.6rem] font-bold leading-[1.05] tracking-tight drop-shadow-[0_4px_18px_rgb(15_23_42/0.45)]">
                Learning today,<br /><span className="text-gold-300">leading tomorrow.</span>
              </h2>
              <p className="mt-3 text-base text-white/90 drop-shadow-[0_2px_10px_rgb(15_23_42/0.5)] max-w-sm">CAPS results, report cards, attendance and fees in Rand, for South African schools.</p>
            </div>
            <img src="/brand/login-art-bottom.webp" alt="" width={1000} height={520} className="login-art login-art-2 w-[78%] self-end h-auto select-none" draggable={false} />
          </section>
        </div>
        <p className="text-xs text-white/70">Copyright © Infinite Q Graphics</p>
      </main>
    </>
  );
}
