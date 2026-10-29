// The light part of lib/i18n, safe for the browser: language list and lookup (no dictionaries).
export type Dict = Record<string, string>;

/** The 11 official spoken languages of South Africa, each shown in its own name. */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "af", name: "Afrikaans" },
  { code: "zu", name: "isiZulu" },
  { code: "xh", name: "isiXhosa" },
  { code: "nr", name: "isiNdebele" },
  { code: "nso", name: "Sepedi" },
  { code: "st", name: "Sesotho" },
  { code: "tn", name: "Setswana" },
  { code: "ss", name: "siSwati" },
  { code: "ve", name: "Tshivenḓa" },
  { code: "ts", name: "Xitsonga" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];

export type T = (text: string, vars?: Record<string, string | number>) => string;

/** A lookup function for one dictionary: t("Welcome, {name}", { name }) */
export function makeT(dict: Dict): T {
  return (text, vars) => {
    const s = dict[text] || text;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}

