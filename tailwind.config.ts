import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens — values come from CSS variables on :root[data-theme]
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-hi': 'rgb(var(--surface-hi) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        live: 'rgb(var(--live) / <alpha-value>)',
        notify: 'rgb(var(--notify) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink) / <alpha-value>)',
        'bg-warm': 'rgb(var(--bg-warm) / <alpha-value>)',
      },
      // v2 "Editorial Calm" — elevation replaces hairline borders. Values are
      // per-theme CSS variables (dark adds a faint ring; see globals.css).
      boxShadow: {
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-soft)',
        hero: 'var(--shadow-hero)',
        lift: 'var(--shadow-lift)',
      },
      // v2 radius scale (design tokens R.sm/md/lg/xl)
      borderRadius: {
        'card-sm': '12px',
        card: '18px',
        'card-lg': '24px',
        'card-xl': '32px',
      },
      fontFamily: {
        // Wired up via next/font in app/layout.tsx
        tight: ['var(--font-tight)', 'ui-sans-serif', 'system-ui'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.05em',
        'extra-wide': '0.18em',
        'mega-wide': '0.22em',
      },
      keyframes: {
        'pulse-out': {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '80%': { transform: 'scale(2.8)', opacity: '0' },
          '100%': { transform: 'scale(2.8)', opacity: '0' },
        },
        'pulse-once': {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
        // UTCG pack-open reveal flourish — brief expanding glow behind a
        // high/mid tier pull, then fades. See pack-open-animation.tsx.
        'pulse-burst': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '35%': { transform: 'scale(1.05)', opacity: '1' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // UTCG pack-store / pack-open foil flourishes.
        'pack-bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'foil-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'charge-flash': {
          '0%': { opacity: '0' },
          '40%': { opacity: '0.85' },
          '100%': { opacity: '0' },
        },
        'mote-drift': {
          '0%, 100%': { transform: 'translateY(0) translateX(0)', opacity: '0.3' },
          '50%': { transform: 'translateY(-10px) translateX(4px)', opacity: '0.9' },
        },
        'pack-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        'pack-tear-scale': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.4)' },
        },
        'flash-white': {
          '0%': { opacity: '0' },
          '25%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'card-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-4px)' },
          '40%': { transform: 'translateX(4px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(3px)' },
        },
        'ray-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'particle-burst': {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '100%': { transform: 'var(--particle-end, translate(40px, -40px) scale(0))', opacity: '0' },
        },
        'card-flip-in': {
          '0%': { transform: 'scale(0.9) rotateY(12deg)', opacity: '0.4' },
          '60%': { transform: 'scale(1.03) rotateY(0deg)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Added for the mock-faithful UTCG suite (squad-builder, pack-store,
        // pack-opening, match-result — Claude Design project mocks).
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'snap-in': {
          '0%': { transform: 'scale(0.35) translateY(-14px)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        'link-in': {
          from: { strokeDashoffset: '1' },
          to: { strokeDashoffset: '0' },
        },
        'team-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'play-glow': {
          '0%, 100%': { boxShadow: '0 12px 30px rgba(255,61,0,0.36)' },
          '50%': { boxShadow: '0 12px 44px rgba(255,61,0,0.6)' },
        },
        'to-pack-scale': {
          '0%': { transform: 'scale(0.7)', opacity: '0' },
          '18%': { transform: 'scale(1)', opacity: '1' },
          '70%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1.5)', opacity: '0', filter: 'brightness(2.4)' },
        },
        'cue-pulse': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        'burst-fly': {
          '0%': { transform: 'rotate(var(--a)) translateY(-6px) scale(1.4)', opacity: '1' },
          '100%': { transform: 'rotate(var(--a)) translateY(-220px) scale(0.2)', opacity: '0' },
        },
        'orb-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        slam: {
          '0%': { transform: 'scale(2.15)', opacity: '0', filter: 'blur(7px)' },
          '55%': { transform: 'scale(0.95)', opacity: '1', filter: 'blur(0)' },
          '78%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        'conf-fly': {
          '0%': { transform: 'translate(0,0) rotate(0)', opacity: '1' },
          '100%': { transform: 'translate(var(--dx), calc(var(--dy) + 640px)) rotate(540deg)', opacity: '0' },
        },
        'gold-drift': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '25%': { opacity: '0.9' },
          '100%': { transform: 'translateY(-120px)', opacity: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'pulse-out': 'pulse-out 1.5s ease-out infinite',
        'pulse-once': 'pulse-once 600ms ease-out 1',
        'pulse-burst': 'pulse-burst 900ms ease-out 1',
        'fade-in': 'fade-in 150ms ease-out 1',
        'pack-bob': 'pack-bob 3.2s ease-in-out infinite',
        'foil-sweep': 'foil-sweep 2.6s ease-in-out infinite',
        'spin-slow': 'spin-slow 12s linear infinite',
        'charge-flash': 'charge-flash 260ms ease-out 1',
        'mote-drift': 'mote-drift 4s ease-in-out infinite',
        'pack-breathe': 'pack-breathe 2.4s ease-in-out infinite',
        'pack-tear-scale': 'pack-tear-scale 380ms ease-in 1 forwards',
        'flash-white': 'flash-white 420ms ease-out 1',
        'card-shake': 'card-shake 420ms ease-in-out 1',
        'ray-spin': 'ray-spin 8s linear infinite',
        'particle-burst': 'particle-burst 700ms ease-out 1 forwards',
        'card-flip-in': 'card-flip-in 420ms cubic-bezier(0.25,0.7,0.25,1.06) 1',
        'sheet-up': 'sheet-up 340ms cubic-bezier(0.2,0.9,0.2,1) 1 both',
        'snap-in': 'snap-in 420ms cubic-bezier(0.3,1.3,0.5,1) 1 both',
        'link-in': 'link-in 550ms ease 1 forwards',
        'team-pulse': 'team-pulse 2.4s ease-in-out 550ms infinite',
        'play-glow': 'play-glow 2.2s ease-in-out infinite',
        'to-pack-scale': 'to-pack-scale 2.4s ease 1 both',
        'cue-pulse': 'cue-pulse 1.8s ease-in-out infinite',
        'burst-fly': 'burst-fly 900ms cubic-bezier(0.1,0.7,0.3,1) 1 both',
        'orb-spin': 'orb-spin 1.1s linear infinite',
        slam: 'slam 620ms cubic-bezier(0.2,0.8,0.2,1.05) 1 both',
        'conf-fly': 'conf-fly 1.5s cubic-bezier(0.1,0.6,0.4,1) 1 forwards',
        'gold-drift': 'gold-drift 3.4s ease-in-out infinite',
        'fade-up': 'fade-up 550ms cubic-bezier(0.2,0.7,0.2,1) 1 both',
      },
    },
  },
  plugins: [],
};

export default config;
