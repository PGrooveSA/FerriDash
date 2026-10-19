import {
  GraduationCap, BookOpen, Pencil, Lightbulb, Atom, Rocket, Calculator, Microscope, Sparkles, FlaskConical, Ruler, Telescope, Brain, Globe2, Music, Palette, Star, Cpu,
  type LucideIcon,
} from "lucide-react";

/**
 * Animated sign-in background: education symbols rising like ideas, an orbiting atom,
 * a learning path climbing toward a star, and a sunrise glow for the future.
 * Pure CSS animation (see .edu-* in globals.css); it stops for users who prefer reduced motion.
 */
type Glyph = { Icon: LucideIcon; left: number; size: number; dur: number; delay: number; tone: string; sway: number; rot: number; o: number };

// Light, glowing tones that read well on the dawn-sky blue.
const TONES = ["text-gold-300", "text-sky-200", "text-brand-300", "text-white", "text-gold-400", "text-sky-300"];
const ICONS = [GraduationCap, BookOpen, Pencil, Lightbulb, Atom, Rocket, Calculator, Microscope, FlaskConical, Ruler, Telescope, Brain, Globe2, Music, Palette, Cpu, GraduationCap, BookOpen, Lightbulb, Rocket];

// Fixed layout (not random) so server and client render identically.
const GLYPHS: Glyph[] = ICONS.map((Icon, i) => ({
  Icon,
  left: (i * 37 + 7) % 96,
  size: 22 + ((i * 13) % 4) * 10,
  dur: 22 + ((i * 7) % 6) * 4,
  delay: -((i * 5.3) % 30),
  tone: TONES[i % TONES.length],
  sway: ((i % 2 ? 1 : -1) * (20 + ((i * 11) % 40))),
  rot: (i % 2 ? 1 : -1) * (20 + ((i * 17) % 50)),
  o: 0.35 + ((i * 3) % 4) * 0.1,
}));

const STARS = Array.from({ length: 22 }, (_, i) => ({ left: (i * 43 + 11) % 100, top: (i * 29 + 5) % 70, delay: -((i * 0.7) % 4), size: i % 5 === 0 ? 4 : 2 }));

export default function LoginBackdrop() {
  return (
    <div className="edu-backdrop" aria-hidden>
      {/* Dawn sky: midnight blue brightening toward the horizon, with a faint blueprint grid */}
      <div className="edu-sky" />
      <div className="edu-grid" />
      {/* Sunrise on the horizon: the future */}
      <div className="edu-sun" />
      <div className="edu-horizon" />

      {/* Twinkling stars: aspiration */}
      {STARS.map((s, i) => <span key={i} className="edu-star" style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }} />)}

      {/* Learning path: a dashed road climbing from a book to a star */}
      <svg className="edu-path-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="eduPath" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-brand-400)" />
            <stop offset="0.5" stopColor="var(--color-gold-400)" />
            <stop offset="1" stopColor="#bae6fd" />
          </linearGradient>
        </defs>
        <path className="edu-path" d="M-40 760 C 220 700, 260 560, 470 560 S 760 640, 860 470 S 1010 200, 1180 120" fill="none" stroke="url(#eduPath)" strokeWidth="5" strokeLinecap="round" />
        <path className="edu-path-glow" d="M-40 760 C 220 700, 260 560, 470 560 S 760 640, 860 470 S 1010 200, 1180 120" fill="none" stroke="url(#eduPath)" strokeWidth="14" strokeLinecap="round" />
      </svg>
      <span className="edu-goal"><Star className="w-10 h-10" fill="currentColor" /></span>

      {/* Orbiting atom: knowledge and science */}
      <div className="edu-atom">
        <span className="edu-ring" />
        <span className="edu-ring edu-ring-2" />
        <div className="edu-orbit" style={{ ["--dur" as string]: "14s" }}><span className="edu-electron"><Rocket className="w-6 h-6" /></span></div>
        <div className="edu-orbit" style={{ ["--dur" as string]: "9s", animationDirection: "reverse" }}><span className="edu-electron edu-electron-sm" /></div>
        <span className="edu-nucleus"><Sparkles className="w-7 h-7" /></span>
      </div>

      {/* Rising ideas */}
      {GLYPHS.map(({ Icon, ...g }, i) => (
        <span key={i} className={`edu-float ${g.tone}`} style={{
          left: `${g.left}%`, animationDuration: `${g.dur}s`, animationDelay: `${g.delay}s`,
          ["--sway" as string]: `${g.sway}px`, ["--rot" as string]: `${g.rot}deg`, ["--o" as string]: g.o,
        }}>
          <Icon style={{ width: g.size, height: g.size }} strokeWidth={1.6} />
        </span>
      ))}
    </div>
  );
}
