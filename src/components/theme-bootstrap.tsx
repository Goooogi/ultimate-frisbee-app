// Inline script in <head> that sets data-theme before paint to prevent FOUC.
import { DEFAULT_THEME, THEME_STORAGE_KEY, THEME_BAR_COLOR } from '@/lib/theme';

// The browser UI (iOS Safari address bar, Android status bar) is colored by the
// <meta name="theme-color"> tag. Our theme is app-controlled via data-theme
// (field/broadcast), NOT the OS prefers-color-scheme — so a media-query-based
// theme-color mismatches (e.g. an OS-dark phone showed a dark/grey bar behind a
// tan page). We instead write the meta to match the ACTIVE app theme's --bg
// (see THEME_BAR_COLOR): field = tan #F4F2EC, broadcast = near-black #0A0A09.
export function ThemeBootstrap() {
  const script = `
    (function () {
      try {
        var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
        var theme = (stored === 'field' || stored === 'broadcast') ? stored : ${JSON.stringify(DEFAULT_THEME)};
        document.documentElement.setAttribute('data-theme', theme);
        var colors = ${JSON.stringify(THEME_BAR_COLOR)};
        var color = colors[theme] || colors[${JSON.stringify(DEFAULT_THEME)}];
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'theme-color');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', color);
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
