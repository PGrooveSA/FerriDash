/**
 * FerriDash product logo (graduation cap + wordmark), cropped tight to the artwork.
 * - onDark: the original white-and-orange logo, for dark backgrounds.
 * - auto: navy-and-orange on light theme, white-and-orange on dark theme.
 * Width is set by the caller (responsive classes); height follows the 1586x500 aspect ratio.
 */
export default function BrandLogo({ variant = "auto", className = "" }: { variant?: "auto" | "onDark"; className?: string }) {
  const img = (src: string, extra = "") => (
    <img src={src} alt="FerriDash" width={1586} height={500} className={`block w-full h-auto select-none ${extra}`} draggable={false} />
  );
  return (
    <span className={`inline-block shrink-0 ${className}`}>
      {variant === "onDark"
        ? img("/brand/logo-light.webp")
        : <>{img("/brand/logo-dark.webp", "dark:hidden")}{img("/brand/logo-light.webp", "hidden dark:block")}</>}
    </span>
  );
}
