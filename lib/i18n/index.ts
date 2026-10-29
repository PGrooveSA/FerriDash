// Interface languages. English is the source: every on-screen text is written in English and looked up in the
// chosen language's dictionary (lib/i18n/dict/<code>.ts). Anything not translated yet shows in English, so
// screens can be translated a few at a time. Placeholders such as {name} are filled in after the lookup.
import af from "./dict/af";
import zu from "./dict/zu";
import xh from "./dict/xh";
import nr from "./dict/nr";
import nso from "./dict/nso";
import st from "./dict/st";
import tn from "./dict/tn";
import ss from "./dict/ss";
import ve from "./dict/ve";
import ts from "./dict/ts";

import { makeT, type Dict, type Lang, type T } from "./core";
export * from "./core";

const DICTS: Record<Lang, Dict> = { en: {}, af, zu, xh, nr, nso, st, tn, ss, ve, ts };

export const isLang = (v: unknown): v is Lang => typeof v === "string" && v in DICTS;
export const dictFor = (lang: string | null | undefined): Dict => DICTS[isLang(lang) ? lang : "en"];

/** Server components: the signed-in user's language. */
export const tFor = (user: { language?: string | null } | null | undefined): T => makeT(dictFor(user?.language));
