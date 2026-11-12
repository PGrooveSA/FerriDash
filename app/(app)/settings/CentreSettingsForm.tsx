"use client";
import { useActionState } from "react";
import type { School } from "@/lib/auth";
import { saveCentreSettings } from "@/app/actions/childcare";

/** A childcare centre's profile and hours (no EMIS, quintile, terms or report card style). */
export default function CentreSettingsForm({ school, provinces }: { school: School; provinces: string[] }) {
  const [state, action, pending] = useActionState(saveCentreSettings, {});
  const input = (name: keyof School, label: string, type = "text", half = true) => (
    <div className={half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={String(school[name] ?? "")} className="input" />
    </div>
  );
  return (
    <form action={action} className="glass p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-lg mb-3">Centre profile</h2>
        <div className="grid grid-cols-2 gap-3">
          {input("name", "Centre name", "text", false)}
          {input("ecd_number", "ECD registration number")}
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="province">Province</label>
            <select id="province" name="province" defaultValue={school.province} className="input">{provinces.map((p) => <option key={p}>{p}</option>)}</select>
          </div>
          {input("district", "District")}
          {input("principal", "Owner / principal")}
          {input("phone", "Phone", "tel")}
          {input("email", "Office email", "email")}
          {input("address", "Physical address", "text", false)}
          {input("motto", "Motto", "text", false)}
        </div>
      </div>
      <div>
        <h2 className="font-semibold text-lg mb-3">Hours</h2>
        <div className="grid grid-cols-2 gap-3">
          {input("opens_at", "Opens at", "time")}
          {input("closes_at", "Closes at", "time")}
          {input("current_year", "Year", "number")}
          <p className="col-span-2 text-xs muted">Children still checked in after closing time are flagged on the check-in board and the dashboard.</p>
        </div>
      </div>
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Settings saved.</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
