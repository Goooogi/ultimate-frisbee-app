'use client';

import { useTheme } from '@/lib/use-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  const isField = theme === 'field';

  return (
    <button
      onClick={() => setTheme(isField ? 'broadcast' : 'field')}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border text-muted hover:text-ink hover:border-ink transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={`Switch to ${isField ? 'Broadcast' : 'Field'} theme`}
      title={`Switch to ${isField ? 'Broadcast' : 'Field'} theme`}
    >
      {isField ? (
        // Sun (currently in Field/light mode → click to go dark)
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="3" />
          <line x1="8" y1="1" x2="8" y2="3" />
          <line x1="8" y1="13" x2="8" y2="15" />
          <line x1="1" y1="8" x2="3" y2="8" />
          <line x1="13" y1="8" x2="15" y2="8" />
          <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
          <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
          <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" />
          <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" />
        </svg>
      ) : (
        // Moon (currently in Broadcast/dark mode → click to go light)
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M13 9A6 6 0 0 1 7 3a6 6 0 1 0 6 6z" />
        </svg>
      )}
    </button>
  );
}
