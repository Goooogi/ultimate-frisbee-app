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
