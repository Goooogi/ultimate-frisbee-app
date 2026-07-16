'use client';

import { useEffect, useState } from 'react';
import { type Theme, DEFAULT_THEME, THEME_STORAGE_KEY, THEME_BAR_COLOR, isTheme } from '@/lib/theme';

/** Keep the <meta name="theme-color"> (iOS/Android browser chrome) in sync with
 *  the active theme's background so the address bar blends into the page. */
function syncThemeBarColor(theme: Theme) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_BAR_COLOR[theme];
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    // Read the value that ThemeBootstrap already applied to <html>
    const attr = document.documentElement.getAttribute('data-theme');
    if (isTheme(attr)) setThemeState(attr);
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    syncThemeBarColor(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (_) {}
  }

  return [theme, setTheme];
}
