const PALETTE = [
  ["#ade6c6", "#135d41"], ["#fde3a3", "#8a5a06"], ["#fde68a", "#854d0e"], ["#a7f3d0", "#047857"], ["#fecdd3", "#be123c"], ["#f8cdb8", "#a3401c"],
];

/** Shows the user's profile photo when they have one, otherwise coloured initials. */
export default function Avatar({ first, last, size = 36, online = false, photo }: { first: string; last: string; size?: number; online?: boolean; photo?: string | null }) {
  const name = `${first}${last}`;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = PALETTE[h % PALETTE.length];
  return (
    <span className="relative inline-grid place-items-center rounded-full font-semibold shrink-0 ring-2 ring-white/70 dark:ring-white/10" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }} aria-hidden>
      {photo
        ? <img src={photo} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full rounded-full object-cover" />
        : <>{(first[0] ?? "").toUpperCase()}{(last[0] ?? "").toUpperCase()}</>}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" style={{ width: Math.max(10, size * 0.14), height: Math.max(10, size * 0.14) }} />}
    </span>
  );
}
