// Pure season helpers — no server-only dependency, safe to import in client components.

/** Current UFA season year. Season runs ~April through August. */
export function currentSeasonYear(now: Date = new Date()): number {
  return now.getFullYear();
}

/** Default years dropdown — most recent down through 2022 (UFA rebrand window). */
export function recentSeasons(n: number = 5): number[] {
  const cur = currentSeasonYear();
  return Array.from({ length: n }, (_, i) => cur - i);
}
