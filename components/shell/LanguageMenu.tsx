"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
import { setLanguage } from "@/app/actions/people";
import { LANGUAGES } from "@/lib/i18n/core";
import { useT } from "@/components/I18nProvider";

/** Top-bar language switcher: the same per-user setting as Settings → Language. */
export default function LanguageMenu({ current }: { current: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const choose = (code: string) => {
    if (code === current) { setOpen(false); return; }
    const f = new FormData();
    f.set("language", code);
    start(async () => {
      const r = await setLanguage({}, f);
      if (r?.error) { setError(r.error); return; }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="icon-btn" aria-label={t("Language")} title={t("Language")} aria-haspopup="menu" aria-expanded={open}>
        <Languages className="w-[1.1rem] h-[1.1rem]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-56 max-h-[70vh] overflow-y-auto glass-solid !bg-[var(--bg)] !rounded-2xl p-1 shadow-xl">
          <p className="px-3 pt-2 pb-1 text-xs muted">{t("Language")}</p>
          {LANGUAGES.map((l) => (
            <button key={l.code} type="button" role="menuitemradio" aria-checked={l.code === current} disabled={pending} onClick={() => choose(l.code)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60 ${l.code === current ? "font-semibold text-brand-600" : ""}`}>
              <span className="flex-1">{l.name}</span>
              {l.code === current && <Check className="w-4 h-4" />}
            </button>
          ))}
          {error && <p className="px-3 py-2 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
