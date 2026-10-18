"use client";
import { useActionState } from "react";
import { login } from "../actions/auth";
import { LogIn } from "lucide-react";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input" placeholder="name@school.co.za" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        <LogIn className="w-4 h-4" /> {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
