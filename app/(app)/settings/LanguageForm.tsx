"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLanguage } from "@/app/actions/people";
import { LANGUAGES } from "@/lib/i18n/core";
import { useT } from "@/components/I18nProvider";

/** Every user's language choice: FerriDash's menus and screens switch to it on all their devices. */
export default function LanguageForm({ current }: { current: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(setLanguage, {});
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={action} className="glass p-5 sm:p-6">
      <h2 className="font-semibold flex items-center gap-2"><Languages className="w-5 h-5 text-brand-500" />{t("Language")}</h2>
      <p className="text-sm muted mt-1">{t("Choose the language FerriDash is shown in. It applies to you only, on all your devices.")}</p>
      <div className="flex flex-wrap gap-2 mt-4">
        <select name="language" defaultValue={current} className="input !w-auto min-w-[14rem]" aria-label={t("Language")}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <button className="btn btn-primary" disabled={pending}>{pending ? t("Saving…") : t("Save")}</button>
      </div>
      {state?.error && <p className="text-sm text-rose-600 mt-2">{state.error}</p>}
      <p className="text-xs muted mt-3">{t("Translations are being added screen by screen. Anything not translated yet is shown in English. Report cards and official documents stay in the school's language.")}</p>
    </form>
  );
}
