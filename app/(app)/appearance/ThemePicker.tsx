"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Check, Eye } from "lucide-react";
import { saveTheme } from "@/app/actions/appearance";
import type { ActionResult } from "@/lib/action-utils";
import type { Theme, ThemeId } from "@/lib/themes";

const FONT: Record<ThemeId, string> = {
  classic: '"Segoe UI Variable Text", "Segoe UI", sans-serif', citrus: "var(--font-urbanist)", slate: "var(--font-inter)",
  lavender: "var(--font-poppins)", mono: "var(--font-jakarta)", forest: "var(--font-manrope)", honey: "var(--font-outfit)",
};

/** Shows the theme on the whole page straight away; colours glide for a moment while it changes. */
function applySkin(id: ThemeId) {
  const root = document.querySelector<HTMLElement>(".skin-root");
  if (!root || root.dataset.skin === id) return;
  const html = document.documentElement;
  html.classList.add("skin-fade");
  root.dataset.skin = id;
  window.setTimeout(() => html.classList.remove("skin-fade"), 600);
}

export default function ThemePicker({ themes, current }: { themes: Theme[]; current: ThemeId }) {
  const [picked, setPicked] = useState<ThemeId>(current);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTheme, {});
  const saved = useRef(current);
  useEffect(() => { saved.current = current; }, [current]);
  // Leaving without saving puts the saved theme back.
  useEffect(() => () => applySkin(saved.current), []);

  const pick = (id: ThemeId) => { setPicked(id); applySkin(id); };
  const save = () => { const fd = new FormData(); fd.set("theme", picked); startTransition(() => action(fd)); };
  const dirty = picked !== current;

  return (
    <div className="space-y-5">
      <div className="glass-solid !rounded-2xl sticky top-3 z-20 flex flex-wrap items-center gap-3 px-5 py-3">
        <p className="text-sm flex-1 min-w-[12rem] flex items-center gap-2">
          {dirty ? <><Eye className="w-4 h-4 text-brand-600" />Previewing <b>{themes.find((t) => t.id === picked)?.name}</b>. Save it to keep it.</>
            : state.message ? state.message : "Click a theme to preview it on this page."}
        </p>
        {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
        {dirty && <button type="button" className="btn btn-ghost" onClick={() => pick(current)} disabled={pending}>Cancel</button>}
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || pending}>{pending ? "Saving..." : "Save theme"}</button>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {themes.map((t) => {
          const [bg, card, primary, accent, ink] = t.swatch;
          const on = picked === t.id;
          return (
            <button key={t.id} type="button" onClick={() => pick(t.id)} aria-pressed={on}
              className={`glass tile relative overflow-hidden text-left p-3 transition-all ${on ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-transparent" : ""}`}>
              {/* A small dashboard drawn in the theme's colours. */}
              <div className="rounded-2xl p-2.5 flex gap-2 h-36" style={{ background: bg }} aria-hidden>
                <div className="w-14 rounded-xl p-1.5 space-y-1.5" style={{ background: card }}>
                  <div className="h-2.5 rounded-full w-8" style={{ background: ink, opacity: 0.8 }} />
                  <div className="h-4 rounded-full" style={{ background: t.id === "citrus" || t.id === "classic" ? accent : ink }} />
                  {[0, 1, 2].map((i) => <div key={i} className="h-2 rounded-full" style={{ background: ink, opacity: 0.15 }} />)}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1 h-12 rounded-xl p-1.5" style={{ background: primary }}><div className="h-2 w-6 rounded-full bg-white/80" /><div className="mt-2 h-3 w-8 rounded-full bg-white" /></div>
                    <div className="flex-1 h-12 rounded-xl p-1.5" style={{ background: card }}><div className="h-2 w-6 rounded-full" style={{ background: ink, opacity: 0.3 }} /><div className="mt-2 h-3 w-8 rounded-full" style={{ background: ink }} /></div>
                  </div>
                  <div className="flex-1 rounded-xl p-2 flex items-end gap-1" style={{ background: card }}>
                    {[45, 70, 55, 90, 60, 80, 40].map((h, i) => <div key={i} className="flex-1 rounded-full" style={{ height: `${h}%`, background: i === 3 ? primary : i % 2 ? accent : ink, opacity: i === 3 ? 1 : i % 2 ? 0.9 : 0.18 }} />)}
                  </div>
                </div>
              </div>
              <div className="flex items-start justify-between gap-2 mt-3 px-1">
                <div>
                  <p className="font-semibold text-lg leading-tight" style={{ fontFamily: FONT[t.id] }}>{t.name}</p>
                  <p className="text-xs muted mt-0.5" style={{ fontFamily: FONT[t.id] }}>{t.font} · Aa Bb 123</p>
                </div>
                <span className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${on ? "bg-brand-500 text-white" : "border border-line"}`}>{on && <Check className="w-4 h-4" />}</span>
              </div>
              <p className="text-sm muted px-1 mt-1.5 mb-1">{t.description}</p>
              <div className="flex gap-1.5 px-1 pb-1">{t.swatch.map((c, i) => <span key={i} className="w-5 h-5 rounded-full border border-black/10" style={{ background: c }} />)}</div>
              {current === t.id && <span className="chip chip-green absolute top-5 right-5">In use</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
