export type Theme = 'field' | 'broadcast';

export const THEME_STORAGE_KEY = 'the-layout.theme';
export const DEFAULT_THEME: Theme = 'field';

export function isTheme(v: unknown): v is Theme {
  return v === 'field' || v === 'broadcast';
}

// Browser-UI (theme-color meta) hex per theme — MUST equal each theme's --bg in
// globals.css so the iOS address bar / Android status bar blend into the page.
// field = #F4F2EC (tan), broadcast = #0A0A09 (near-black).
export const THEME_BAR_COLOR: Record<Theme, string> = {
  field: '#F4F2EC',
  broadcast: '#0A0A09',
};
