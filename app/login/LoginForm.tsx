"use client";
import { useActionState, useState } from "react";
import { login } from "../actions/auth";
import { Mail, Lock, Eye, EyeOff, Info } from "lucide-react";

export default function LoginForm({ state: loginState }: { state: string }) {
  const [state, action, pending] = useActionState(login, {});
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  return (
    <form action={action} className="login-form-card mt-7 space-y-4">
      <input type="hidden" name="state" value={loginState} />
      <div>
        <label className="login-label" htmlFor="email">Email</label>
        <div className="relative">
          <Mail className="w-5 h-5 text-[#475467] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input id="email" name="email" type="email" required autoComplete="username" className="login-input" placeholder="Enter your email" />
        </div>
      </div>
      <div>
        <label className="login-label" htmlFor="password">Password</label>
        <div className="relative">
          <Lock className="w-5 h-5 text-[#475467] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className="login-input !pr-12" placeholder="Enter your password" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full text-[#475467] hover:bg-black/5" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 text-sm sm:text-base pt-1">
        
        <button type="button" onClick={() => setForgot((f) => !f)} className="text-[#e8590c] underline underline-offset-2 font-semibold hover:text-[#c2410c]">Forgot password?</button>
      </div>
      {forgot && (
        <p className="text-xs rounded-xl px-3 py-2.5 bg-[#f4600c]/10 flex gap-2">
          <Info className="w-4 h-4 shrink-0 text-[#e8590c]" />
          For your security, passwords are reset by your school. Ask the school office or your school admin to set a new one for you.
        </p>
      )}
      {state?.error && <p role="alert" className="text-sm text-rose-600">{state.error}{state.expired && <> <a href="/login" className="underline font-medium">Reload the page</a></>}</p>}
      <button className="login-submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
