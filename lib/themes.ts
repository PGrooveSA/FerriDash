/**
 * Colour themes. A school admin picks one for the whole school (schools.theme); the platform admin picks their own
 * (users.theme). Every theme is flat and uses Sora with Source Serif 4; only the colours change. The look lives in app/globals.css under
 * [data-skin="..."] (generated with these values: change both together).
 */
export type ThemeId = "classic" | "royal" | "evergreen" | "teal" | "burgundy" | "indigo" | "grey-yellow" | "grey-brown" | "grey-orange" | "grey-green" | "grey-purple" | "grey-red";

export type Theme = {
  id: ThemeId; name: string; description: string; font: string;
  /** Background, card, primary, accent, heading: drawn on the picker. */
  swatch: [string, string, string, string, string];
  /** Text colour on the primary colour (dark on yellow, white otherwise). */
  onPrimary: string;
};

export const THEMES: Theme[] = [
  { id: "classic", name: "Navy & Tangerine", description: "FerriDash's own colours: deep navy with a tangerine highlight.", font: "Sora", swatch: ["#f4f5f7", "#ffffff", "#1d2b51", "#e8590c", "#1d2b51"], onPrimary: "#ffffff" },
  { id: "royal", name: "Royal Blue & Amber", description: "Classic corporate blue with a warm amber highlight.", font: "Sora", swatch: ["#f4f6fa", "#ffffff", "#1d4ed8", "#f59e0b", "#1d4ed8"], onPrimary: "#ffffff" },
  { id: "evergreen", name: "Evergreen & Gold", description: "Traditional school colours: calm green with gold.", font: "Sora", swatch: ["#f3f5f2", "#ffffff", "#166534", "#ca8a04", "#166534"], onPrimary: "#ffffff" },
  { id: "teal", name: "Slate & Teal", description: "Cool slate with a modern teal.", font: "Sora", swatch: ["#f2f4f6", "#ffffff", "#0f766e", "#f59e0b", "#0f766e"], onPrimary: "#ffffff" },
  { id: "burgundy", name: "Burgundy & Brass", description: "Formal burgundy with brass, like a school crest.", font: "Sora", swatch: ["#f6f4f3", "#ffffff", "#8b1e3f", "#b8902a", "#8b1e3f"], onPrimary: "#ffffff" },
  { id: "indigo", name: "Graphite & Indigo", description: "Sleek graphite with indigo and an orange highlight.", font: "Sora", swatch: ["#f4f4f6", "#ffffff", "#4338ca", "#f97316", "#4338ca"], onPrimary: "#ffffff" },
  { id: "grey-yellow", name: "Grey & Yellow", description: "Neutral greys with a bright, sunny yellow.", font: "Sora", swatch: ["#eceef1", "#ffffff", "#eab308", "#64748b", "#1f2937"], onPrimary: "#1f2937" },
  { id: "grey-brown", name: "Grey & Brown", description: "Neutral greys with a warm, earthy brown.", font: "Sora", swatch: ["#eceef1", "#ffffff", "#7c5a3c", "#94a3b8", "#1f2937"], onPrimary: "#ffffff" },
  { id: "grey-orange", name: "Grey & Orange", description: "Neutral greys with an energetic orange.", font: "Sora", swatch: ["#eceef1", "#ffffff", "#ea580c", "#64748b", "#1f2937"], onPrimary: "#ffffff" },
  { id: "grey-green", name: "Grey & Green", description: "Neutral greys with a fresh green.", font: "Sora", swatch: ["#eceef1", "#ffffff", "#15803d", "#64748b", "#1f2937"], onPrimary: "#ffffff" },
  { id: "grey-purple", name: "Grey & Purple", description: "Neutral greys with a rich purple.", font: "Sora", swatch: ["#eceef1", "#ffffff", "#6d28d9", "#64748b", "#1f2937"], onPrimary: "#ffffff" },
  { id: "grey-red", name: "Grey & Red", description: "Neutral greys with a strong crimson red.", font: "Sora", swatch: ["#eceef1", "#ffffff", "#b91c1c", "#64748b", "#1f2937"], onPrimary: "#ffffff" },
];

/** Navy & Tangerine. */
export const DEFAULT_THEME: ThemeId = "classic";
export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
export const themeOr = (v: unknown): ThemeId => (isTheme(v) ? v : DEFAULT_THEME);
