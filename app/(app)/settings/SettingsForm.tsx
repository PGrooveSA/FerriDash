"use client";
import { useActionState } from "react";
import type { School } from "@/lib/auth";
import { saveSchoolSettings } from "@/app/actions/academics";

export default function SettingsForm({ school, terms, provinces }: { school: School; terms: { number: number; start_date: string; end_date: string }[]; provinces: string[] }) {
  const [state, action, pending] = useActionState(saveSchoolSettings, {});
  const input = (name: keyof School, label: string, type = "text", half = true) => (
    <div className={half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={String(school[name] ?? "")} className="input" />
    </div>
  );
  return (
    <form action={action} className="glass p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-lg mb-3">School profile</h2>
        <div className="grid grid-cols-2 gap-3">
          {input("name", "School name", "text", false)}
          {input("emis_number", "EMIS number")}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="province">Province</label>
            <select id="province" name="province" defaultValue={school.province} className="input">{provinces.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          {input("district", "District")}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="quintile">Quintile</label>
            <select id="quintile" name="quintile" defaultValue={school.quintile} className="input">{[1, 2, 3, 4, 5].map((q) => <option key={q} value={q}>Quintile {q}</option>)}</select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="school_type">Type</label>
            <select id="school_type" name="school_type" defaultValue={school.school_type} className="input">{["Primary", "Secondary", "Combined"].map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="fee_paying">Fees</label>
            <select id="fee_paying" name="fee_paying" defaultValue={school.fee_paying} className="input"><option value={1}>Fee-paying</option><option value={0}>No-fee school</option></select>
          </div>
          {input("principal", "Principal")}
          {input("phone", "Phone", "tel")}
          {input("email", "Office email", "email")}
          {input("address", "Physical address", "text", false)}
          {input("motto", "Motto (shown on report cards)", "text", false)}
        </div>
      </div>
      <div>
        <h2 className="font-semibold text-lg mb-3">Academic calendar</h2>
        <div className="grid grid-cols-2 gap-3">
          {input("current_year", "Academic year", "number")}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="current_term">Current term</label>
            <select id="current_term" name="current_term" defaultValue={school.current_term} className="input">{[1, 2, 3, 4].map((t) => <option key={t} value={t}>Term {t}</option>)}</select>
          </div>
          {[1, 2, 3, 4].map((t) => {
            const row = terms.find((x) => x.number === t);
            return (
              // Phones: the term name on its own line, the two dates side by side below it. Date fields
              // don't shrink by themselves, so min-w-0 keeps them inside the card.
              <div key={t} className="col-span-2 grid grid-cols-2 sm:grid-cols-[5rem_1fr_1fr] items-end gap-x-3 gap-y-1">
                <span className="col-span-2 sm:col-span-1 text-sm font-semibold sm:pb-2.5">Term {t}</span>
                <div className="min-w-0"><label className="label">Starts</label><input type="date" name={`t${t}_start`} defaultValue={row?.start_date} className="input min-w-0 px-2.5 sm:px-[0.9rem]" /></div>
                <div className="min-w-0"><label className="label">Ends</label><input type="date" name={`t${t}_end`} defaultValue={row?.end_date} className="input min-w-0 px-2.5 sm:px-[0.9rem]" /></div>
              </div>
            );
          })}
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Settings saved.</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
