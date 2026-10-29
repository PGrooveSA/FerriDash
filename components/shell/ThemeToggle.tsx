"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18nProvider";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const t = useT();
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("sh-theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={toggle} className="icon-btn" aria-label={dark ? t("Switch to light mode") : t("Switch to dark mode")} title={dark ? t("Switch to light mode") : t("Switch to dark mode")}>
      {dark ? <Sun className="w-[1.1rem] h-[1.1rem]" /> : <Moon className="w-[1.1rem] h-[1.1rem]" />}
    </button>
  );
}
