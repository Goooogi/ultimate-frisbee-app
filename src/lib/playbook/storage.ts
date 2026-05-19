// localStorage-backed play library. V1 only — once the backend lands this'll
// be replaced by a real API, but the on-disk shape matches the wire shape so
// migration is just "copy these blobs to the server."

import type { Play } from './types';

const KEY = 'the-layout.playbook.v1';

interface StoredShape {
  plays: Play[];
  /** Currently-open play id (rehydrates which play is in the editor on reload). */
  openPlayID?: string;
}

function read(): StoredShape {
  if (typeof window === 'undefined') return { plays: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { plays: [] };
    const parsed = JSON.parse(raw) as StoredShape;
    if (!parsed || !Array.isArray(parsed.plays)) return { plays: [] };
    return parsed;
  } catch {
    return { plays: [] };
  }
}

function write(data: StoredShape): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // QuotaExceeded or storage disabled — silently drop. The in-memory state
    // still works for the session.
  }
}

export function loadPlays(): Play[] {
  return read().plays;
}

export function loadOpenPlayID(): string | undefined {
  return read().openPlayID;
}

export function savePlays(plays: Play[], openPlayID?: string): void {
  write({ plays, openPlayID });
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}
