const PALETTE = [
  ["#bae6fd", "#0369a1"], ["#ddd6fe", "#6d28d9"], ["#fde68a", "#854d0e"], ["#a7f3d0", "#047857"], ["#fecdd3", "#be123c"], ["#c7d2fe", "#4338ca"],
];

export default function Avatar({ first, last, size = 36, online = false }: { first: string; last: string; size?: number; online?: boolean }) {
  const name = `${first}${last}`;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = PALETTE[h % PALETTE.length];
  return (
    <span className="relative inline-grid place-items-center rounded-full font-semibold shrink-0 ring-2 ring-white/70 dark:ring-white/10" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }} aria-hidden>
      {(first[0] ?? "").toUpperCase()}{(last[0] ?? "").toUpperCase()}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />}
    </span>
  );
}
