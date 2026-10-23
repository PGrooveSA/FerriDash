/**
 * FerriDash product logo ("Rising sun" emblem + wordmark), SVG in public/brand.
 * Files are named for the background they suit: ferridash-logo-light.svg has charcoal ink for light
 * backgrounds, ferridash-logo-dark.svg has white ink for dark ones.
 * - onDark: always the white-ink version.
 * - auto: follows the light/dark theme.
 * Width is set by the caller (responsive classes); height follows the 563x132 artwork.
 */
export default function BrandLogo({ variant = "auto", className = "" }: { variant?: "auto" | "onDark"; className?: string }) {
  const img = (src: string, extra = "") => (
    <img src={src} alt="FerriDash" width={563} height={132} className={`block w-full h-auto select-none ${extra}`} draggable={false} />
  );
  return (
    <span className={`inline-block shrink-0 ${className}`}>
      {variant === "onDark"
        ? img("/brand/ferridash-logo-dark.svg")
        : <>{img("/brand/ferridash-logo-light.svg", "dark:hidden")}{img("/brand/ferridash-logo-dark.svg", "hidden dark:block")}</>}
    </span>
  );
}

/** Small FerriDash emblem for document footers. Prints in the light (charcoal) version. */
export function BrandMark({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <span className={`inline-block shrink-0 align-[-0.15em] ${className}`} aria-hidden>
      <img src="/brand/ferridash-emblem-light.svg" alt="" className="w-full h-full dark:hidden print:!block" />
      <img src="/brand/ferridash-emblem-dark.svg" alt="" className="w-full h-full hidden dark:block print:!hidden" />
    </span>
  );
}
