import { cookies } from "next/headers";
import LoginForm from "./LoginForm";
import { LOGIN_NONCE_COOKIE, signLoginState } from "@/lib/session";

export const metadata = { title: "Sign in" };

// The sign-in page is shared by every school on the platform, so it carries no school branding.
// One flat, always-light card: learners illustration on the left (generated with Higgsfield,
// public/brand/login-learners.webp), "Welcome back" and the form on a cream panel on the right.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ended = (await searchParams).ended === "1";
  // Signed state for this browser's sign-in nonce (set by middleware.ts), checked by the sign-in action.
  const nonce = (await cookies()).get(LOGIN_NONCE_COOKIE)?.value;
  const state = nonce ? await signLoginState(nonce) : "";
  return (
    <main className="login-page min-h-screen flex flex-col items-center justify-center gap-5 p-4 sm:p-8">
      <div className="login-shell w-full max-w-6xl grid lg:grid-cols-[1.05fr_1fr] overflow-hidden">
        <section className="login-art-side flex flex-col px-6 pt-7 pb-6 sm:px-10 sm:pt-9 lg:pb-9" aria-label="Learning today, leading tomorrow">
          <img src="/brand/ferridash-logo-light.svg" alt="FerriDash" width={563} height={132} className="w-40 sm:w-48 h-auto select-none" draggable={false} />
          <img src="/brand/login-learners.webp" alt="" width={1200} height={1200} className="w-full max-w-[15rem] sm:max-w-[20rem] lg:max-w-[30rem] h-auto self-center mt-2 select-none" draggable={false} />
          <h2 className="hidden lg:block text-[1.75rem] font-bold tracking-tight text-center mt-auto">
            Learning today, <span className="text-[#f4600c]">leading tomorrow.</span>
          </h2>
        </section>

        <section className="login-form-side px-6 pb-9 pt-7 sm:px-12 lg:py-12 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#e8590c]">Welcome back</h1>
            <p className="mt-2 text-base sm:text-lg">Sign in with the login your school gave you.</p>
            {ended && <p className="text-sm mt-4 rounded-xl px-3 py-2 bg-[#f4600c]/10">You have been signed out. If you can&apos;t sign in, contact your school office.</p>}
            <LoginForm state={state} />
            <p className="text-sm sm:text-base text-center mt-6"><b>New to FerriDash?</b> Your school office creates your login.</p>
            <p className="text-xs text-center text-[#475467] mt-3">Your information is processed in line with POPIA.</p>
          </div>
        </section>
      </div>
      <p className="text-xs text-[#667085]">Copyright © Infinite Q Graphics</p>
    </main>
  );
}
