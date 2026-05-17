// Inline script in <head> that sets data-theme before paint to prevent FOUC.
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme';

export function ThemeBootstrap() {
  const script = `
    (function () {
      try {
        var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
        var theme = (stored === 'field' || stored === 'broadcast') ? stored : ${JSON.stringify(DEFAULT_THEME)};
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
