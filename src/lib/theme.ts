export type Theme = 'field' | 'broadcast';

export const THEME_STORAGE_KEY = 'the-layout.theme';
export const DEFAULT_THEME: Theme = 'field';

export function isTheme(v: unknown): v is Theme {
  return v === 'field' || v === 'broadcast';
}
