"use client";
import { startTransition, useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitApplication } from "@/app/actions/admissions";

const LANGUAGES = ["English", "Afrikaans", "isiZulu", "isiXhosa", "isiNdebele", "Sepedi", "Sesotho", "Setswana", "siSwati", "Tshivenda", "Xitsonga", "Other"];
const grade = (g: number) => (g === 0 ? "Grade R" : `Grade ${g}`);

export default function ApplyForm({ code, grades, year }: { code: string; grades: number[]; year: number }) {
  const [state, action, pending] = useActionState(submitApplication.bind(null, code), {});
  if (state.ok && state.reference) return (
    <section className="glass-solid p-8 text-center">
      <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
      <h2 className="text-2xl font-semibold mt-3">Application received</h2>
      <p className="muted mt-2">Thank you. The school will contact you about the next steps.</p>
      {state.reference !== "-" && <p className="mt-4">Your reference: <b className="font-mono">{state.reference}</b></p>}
    </section>
  );
  const field = (name: string, label: string, opts: { type?: string; required?: boolean; half?: boolean; placeholder?: string; auto?: string } = {}) => (
    <div className={opts.half === false ? "col-span-2" : "col-span-2 sm:col-span-1"}>
      <label className="label" htmlFor={name}>{label}{opts.required && <span className="text-rose-500"> *</span>}</label>
      <input id={name} name={name} type={opts.type ?? "text"} required={opts.required} placeholder={opts.placeholder} autoComplete={opts.auto} className="input" />
    </div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="glass-solid p-6 space-y-6">
      <section>
        <h2 className="font-semibold text-lg mb-3">The child</h2>
        <div className="grid grid-cols-2 gap-3">
          {field("first_name", "First name(s)", { required: true })}
          {field("last_name", "Surname", { required: true })}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="grade">Grade applied for ({year})<span className="text-rose-500"> *</span></label>
            <select id="grade" name="grade" required className="input" defaultValue=""><option value="" disabled>Choose…</option>{grades.map((g) => <option key={g} value={g}>{grade(g)}</option>)}</select>
          </div>
          {field("date_of_birth", "Date of birth", { type: "date", required: true })}
          {field("id_number", "SA ID number (if they have one)", { placeholder: "13 digits" })}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="gender">Gender</label>
            <select id="gender" name="gender" className="input" defaultValue=""><option value="">-</option><option>Female</option><option>Male</option></select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="home_language">Home language</label>
            <select id="home_language" name="home_language" className="input" defaultValue=""><option value="">-</option>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select>
          </div>
          {field("previous_school", "Current or previous school")}
        </div>
      </section>
      <section>
        <h2 className="font-semibold text-lg mb-3">Parent or guardian</h2>
        <div className="grid grid-cols-2 gap-3">
          {field("parent_first_name", "First name", { required: true, auto: "given-name" })}
          {field("parent_last_name", "Surname", { required: true, auto: "family-name" })}
          {field("parent_email", "Email address", { type: "email", required: true, auto: "email" })}
          {field("parent_phone", "Cell number", { type: "tel", required: true, auto: "tel", placeholder: "082 123 4567" })}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="relationship">Relationship to the child</label>
            <select id="relationship" name="relationship" className="input" defaultValue="Parent">{["Parent", "Mother", "Father", "Guardian", "Grandparent", "Other"].map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          {field("address", "Home address", { auto: "street-address" })}
          <div className="col-span-2">
            <label className="label" htmlFor="notes">Anything the school should know</label>
            <textarea id="notes" name="notes" rows={3} className="input" placeholder="Siblings at the school, learning support, medical needs…" />
          </div>
        </div>
      </section>
      {/* Hidden from people; bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" value="1" required className="mt-1" />I confirm the information is correct, and I agree that the school may use it to process this application (POPIA).</label>
      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Sending..." : "Submit application"}</button>
    </form>
  );
}
