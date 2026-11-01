/**
 * Colour, font and style themes. A school admin picks one for the whole school (schools.theme); the platform admin
 * picks their own (users.theme). The look itself lives in app/globals.css under [data-skin="..."].
 */
export type ThemeId = "classic" | "citrus" | "slate" | "lavender" | "mono" | "forest" | "honey";

export type Theme = {
  id: ThemeId; name: string; description: string; font: string;
  /** Background, card, primary, accent, ink: drawn on the picker. */
  swatch: [string, string, string, string, string];
};

export const THEMES: Theme[] = [
  { id: "classic", name: "Tangerine", description: "FerriDash's own warm orange and sunshine glass.", font: "Plus Jakarta Sans", swatch: ["#eef3fb", "#ffffff", "#f4600c", "#fcca1c", "#3b3531"] },
  { id: "citrus", name: "Citrus Mint", description: "Lime highlights and deep teal on a soft blush backdrop.", font: "Urbanist", swatch: ["#eef0ea", "#fbfdf5", "#1a9683", "#dff57a", "#14201e"] },
  { id: "slate", name: "Slate Ember", description: "Cool slate panels, navy text and an ember-orange accent.", font: "Inter", swatch: ["#dfe3ea", "#ffffff", "#e5532d", "#7ea8dc", "#1f2a3c"] },
  { id: "lavender", name: "Lavender Dusk", description: "Midnight navy with lavender, peach and sky pastels.", font: "Poppins", swatch: ["#e3e7f3", "#f7f6fd", "#8b5cf6", "#f59673", "#2a2155"] },
  { id: "mono", name: "Monochrome Mist", description: "Misty periwinkle with bold black pills and coral dots.", font: "Plus Jakarta Sans", swatch: ["#dde3ef", "#f4f6fb", "#5c74c4", "#e7767a", "#0b0b0f"] },
  { id: "forest", name: "Forest", description: "Calm whites with layered evergreen and mint.", font: "Manrope", swatch: ["#eef0ee", "#ffffff", "#238a57", "#a6d166", "#0f3d2a"] },
  { id: "honey", name: "Honey Charcoal", description: "Creamy honey glow with charcoal pills and light type.", font: "Outfit", swatch: ["#f3efe2", "#fdfbf4", "#e0a80b", "#f9d64a", "#2b2b2b"] },
];

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
export const themeOr = (v: unknown): ThemeId => (isTheme(v) ? v : "classic");
