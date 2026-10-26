"use client";
import { useActionState, useState } from "react";
import { login } from "../actions/auth";
import { LogIn, Mail, Lock, Eye, EyeOff, Info } from "lucide-react";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  return (
    <form action={action} className="mt-7 space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <div className="relative">
          <Mail className="w-4 h-4 muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input id="email" name="email" type="email" required autoComplete="username" className="input !pl-10" placeholder="Enter your school email address" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <Lock className="w-4 h-4 muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input id="password" name="password" type={show ? "text" : "password"} required autoComplete="current-password" className="input !pl-10 !pr-11" placeholder="Enter your password" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn !w-8 !h-8" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" name="remember" value="1" className="w-4 h-4 accent-[var(--color-brand-500)]" />
          Remember me
        </label>
        <button type="button" onClick={() => setForgot((f) => !f)} className="text-brand-600 dark:text-brand-300 hover:underline font-medium">Forgot password?</button>
      </div>
      {forgot && (
        <p className="text-xs rounded-xl px-3 py-2.5 bg-brand-500/10 text-[var(--ink)] flex gap-2">
          <Info className="w-4 h-4 shrink-0 text-brand-600" />
          For your security, passwords are reset by your school. Ask the school office or your school admin to set a new one for you.
        </p>
      )}
      {state?.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      <button className="btn btn-primary w-full !py-3" disabled={pending}>
        <LogIn className="w-4 h-4" /> {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
