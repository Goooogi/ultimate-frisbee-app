'use client';

import { useEffect, useState } from 'react';
import { type Theme, DEFAULT_THEME, THEME_STORAGE_KEY, isTheme } from '@/lib/theme';

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
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (_) {}
  }

  return [theme, setTheme];
}
