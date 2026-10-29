"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, type Dict, type T } from "@/lib/i18n/core";

const Ctx = createContext<T>(makeT({}));

/** Gives client components the signed-in user's dictionary (only that one language is sent to the browser). */
export function I18nProvider({ dict, children }: { dict: Dict; children: React.ReactNode }) {
  const t = useMemo(() => makeT(dict), [dict]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

/** t("English text") in client components. */
export const useT = () => useContext(Ctx);
