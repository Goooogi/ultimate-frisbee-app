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
      },
      animation: {
        'pulse-out': 'pulse-out 1.5s ease-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
