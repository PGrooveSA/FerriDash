"use client";
import { useActionState } from "react";
import { updateProfile } from "@/app/actions/people";
import { changePassword } from "@/app/actions/auth";
import { useT } from "@/components/I18nProvider";

export default function ProfileForms({ title, phone }: { title: string | null; phone: string | null }) {
  const [p, profileAction, p1] = useActionState(updateProfile, {});
  const [pw, passwordAction, p2] = useActionState(changePassword, {});
  const t = useT();
  return (
    <div className="space-y-6">
      <form action={profileAction} className="glass p-6">
        <h2 className="font-semibold text-lg mb-4">{t("Contact details")}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label" htmlFor="title">{t("Title")}</label>
            <select id="title" name="title" defaultValue={title ?? ""} className="input"><option value="">-</option>{["Mr", "Ms", "Mrs", "Dr", "Prof"].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label" htmlFor="phone">{t("Cell number")}</label><input id="phone" name="phone" type="tel" defaultValue={phone ?? ""} className="input" placeholder="+27 82 123 4567" /></div>
        </div>
        {p.error && <p className="text-sm text-rose-600 mt-3">{p.error}</p>}
        {p.ok && <p className="text-sm text-emerald-600 mt-3">{t("Saved.")}</p>}
        <button className="btn btn-primary mt-4" disabled={p1}>{t("Save")}</button>
      </form>
      <form action={passwordAction} className="glass p-6">
        <h2 className="font-semibold text-lg mb-4">{t("Change password")}</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="label" htmlFor="current">{t("Current password")}</label><input id="current" name="current" type="password" required className="input" autoComplete="current-password" /></div>
          <div><label className="label" htmlFor="next">{t("New password")}</label><input id="next" name="next" type="password" required className="input" autoComplete="new-password" /></div>
          <div><label className="label" htmlFor="confirm">{t("Confirm new password")}</label><input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" /></div>
        </div>
        <p className="text-xs muted mt-2">{t("At least 8 characters, including a capital letter and a number.")}</p>
        {pw.error && <p className="text-sm text-rose-600 mt-3">{pw.error}</p>}
        {pw.ok && <p className="text-sm text-emerald-600 mt-3">{pw.ok}</p>}
        <button className="btn btn-primary mt-4" disabled={p2}>{t("Update password")}</button>
      </form>
    </div>
  );
}
