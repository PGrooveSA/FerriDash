/**
 * Classes and style for a box showing a user's banner picture: the picture fills it, darkened on the left
 * so the white text on top stays readable. Null when there is no banner (the box keeps its own colours).
 */
export function bannerStyle(url: string | null | undefined): { className: string; style: React.CSSProperties } | null {
  if (!url) return null;
  return {
    className: "bg-cover bg-center text-white [&_.muted]:!text-white/85",
    style: { backgroundImage: `linear-gradient(90deg, rgb(15 23 42 / 0.78), rgb(15 23 42 / 0.45)), url("${url}")` },
  };
}
