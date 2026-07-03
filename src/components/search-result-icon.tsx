import type { SearchResult } from '@/lib/usau/search-nav';

// Leading icon for a search result row. Shared by search-bar and search-modal
// so both render logos identically.
//
//   - team WITH a logo   → white tile + the logo image (plain <img>, so remote
//     R2 logo URLs work without next/image domain config)
//   - team WITHOUT a logo → dark square with the team's initials (monogram),
//     matching the league logo components' fallback
//   - tournament          → neutral "TY" tile
//   - player              → accent "PL" tile
//
// aria-hidden throughout — the visible team/player name is the accessible label.

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function SearchResultIcon({ result }: { result: SearchResult }) {
  const base =
    'inline-flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 overflow-hidden';

  if (result.kind === 'team' && result.logoUrl) {
    return (
      <span aria-hidden="true" className={`${base} bg-white border border-border`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.logoUrl}
          alt=""
          className="w-full h-full object-contain p-0.5"
          loading="lazy"
        />
      </span>
    );
  }

  if (result.kind === 'team') {
    return (
      <span
        aria-hidden="true"
        className={`${base} bg-ink text-bg text-[9px] font-bold tracking-[0.02em]`}
      >
        {initials(result.name)}
      </span>
    );
  }

  if (result.kind === 'tournament') {
    return (
      <span
        aria-hidden="true"
        className={`${base} bg-surface border border-border text-muted`}
      >
        <CalendarGlyph />
      </span>
    );
  }

  // Player → accent tile with name initials.
  return (
    <span
      aria-hidden="true"
      className={`${base} bg-accent text-accent-ink text-[9px] font-bold tracking-[0.04em]`}
    >
      {initials(result.name)}
    </span>
  );
}

function CalendarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
