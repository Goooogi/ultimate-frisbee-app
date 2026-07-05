'use server';

// Server actions for UFA player search.
//
// The upstream UFA API has no name-search param — only year, team, and
// sort. To find a player by partial name we have to walk the entire
// season leaderboard (paged, ~30 rows per page) and filter on this side.
//
// We cap at `getAllPlayerStats`'s default (30 pages × 30 = 900 rows),
// which comfortably covers every player who's logged a 2026 minute. The
// upstream caches each page for 1h via the call() helper, so repeated
// searches within the same hour are cheap.

import { getAllPlayerStats, currentSeasonYear } from '@/lib/ufa/client';
import type { UfaPlayerStat } from '@/lib/ufa/types';
import { search as searchUsau, type SearchResult } from '@/lib/usau/data';
import { namesMatch } from '@/lib/name-match';
import { allUfaTeams } from '@/lib/ufa/teams';
import { listPulTeams, listPulPlayers } from '@/lib/pul/data';
import { listWulTeams, listWulPlayers } from '@/lib/wul/data';
import { searchWfdfTeams, searchWfdfPlayersForSearch, searchWfdfEvents } from '@/lib/wfdf/data';

/**
 * Search the year's full UFA leaderboard for players whose name includes
 * the needle (case-insensitive). Returns at most `limit` results, sorted
 * by scores descending so the highest-impact matches come first.
 *
 * Empty / very short queries return [] — let the client keep showing the
 * default top-200 view in that case.
 */
export async function searchUfaPlayers(
  query: string,
  year: number,
  limit = 200,
): Promise<UfaPlayerStat[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  try {
    const all = await getAllPlayerStats({ year, per: 'total' });
    return all
      .filter((p) => p.name.toLowerCase().includes(needle))
      .sort((a, b) => (b.scores ?? 0) - (a.scores ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Unified search across USAU (teams + players) AND UFA players. The client
 * search bar calls THIS (not the USAU-only search()) so UFA-only players —
 * e.g. a UFA "Ben Harris" with no USAU row — are findable. This lives in a
 * 'use server' module because it pulls the server-only UFA client.
 *
 * Dedupe: a UFA player who is the SAME human as a USAU result (cross-league
 * name rule, handling Ben Harris ↔ Benjamin Harris) is dropped — the USAU
 * row already opens the unified /players/[id] profile which merges both careers.
 */
export async function searchAll(query: string, limit = 8): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const needle = q.toLowerCase();
  // Per-league contribution cap so a big roster table can't flood / slow the
  // dropdown. We over-fetch a little, then the final sort + slice trims.
  const cap = limit * 2;

  const usau = await searchUsau(q, limit);

  // Names already covered by a USAU player row — used to dedupe same-human
  // matches from the other leagues' player lists (the unified /players/[id]
  // profile merges every league, so one row is enough).
  const usauPlayerNames = usau.filter((r) => r.kind === 'player').map((r) => r.name);

  let ufaResults: SearchResult[] = [];
  try {
    const ufa = await searchUfaPlayers(q, currentSeasonYear(), limit * 3);
    const seen = new Set<string>();
    for (const p of ufa) {
      const key = p.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Same human as a USAU result already shown? Skip (profile merges them).
      if (usauPlayerNames.some((n) => namesMatch(n, p.name))) continue;
      ufaResults.push({ kind: 'player', id: p.playerID, name: p.name, hint: 'UFA', league: 'ufa' });
    }
  } catch {
    ufaResults = [];
  }

  // ── UFA teams (synchronous, in-memory) ────────────────────────────────
  // ALL teams (not just currently-active) so folded/historical franchises are
  // still findable. Match on team name OR city — "Boston" should surface
  // "Boston Glory" — and display the full "City Name" the way UFA brands teams.
  let ufaTeamResults: SearchResult[] = [];
  try {
    ufaTeamResults = allUfaTeams()
      .map((t) => ({ meta: t, mascot: t.name ?? t.abbr, city: t.city ?? '' }))
      .filter(
        (t) =>
          t.mascot.toLowerCase().includes(needle) ||
          t.city.toLowerCase().includes(needle) ||
          `${t.city} ${t.mascot}`.toLowerCase().includes(needle),
      )
      .slice(0, cap)
      .map((t) => ({
        kind: 'team' as const,
        id: t.meta.id,
        name: [t.city, t.mascot].filter(Boolean).join(' '),
        hint: 'UFA',
        league: 'ufa' as const,
        logoUrl: t.meta.logo ?? null,
        prominence: 3, // pro league — top-tier
      }));
  } catch {
    ufaTeamResults = [];
  }

  // ── PUL + WUL + WFDF (async — fan out in parallel) ────────────────────
  // WFDF teams/players/events are all DB-side fuzzy (trigram) searches.
  const [pulTeams, pulPlayers, wulTeams, wulPlayers, wfdfTeams, wfdfPlayers, wfdfEvents] =
    await Promise.all([
      listPulTeams().catch(() => []),
      listPulPlayers().catch(() => []),
      listWulTeams().catch(() => []),
      listWulPlayers().catch(() => []),
      searchWfdfTeams(query, cap).catch(() => []),
      searchWfdfPlayersForSearch(query, cap).catch(() => []),
      searchWfdfEvents(query, cap).catch(() => []),
    ]);

  // PUL teams — match on name OR city (so "Philadelphia" surfaces the Surge).
  const pulTeamResults: SearchResult[] = pulTeams
    .filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.city ?? '').toLowerCase().includes(needle),
    )
    .slice(0, cap)
    .map((t) => ({
      kind: 'team',
      id: t.id,
      name: t.name,
      hint: ['PUL', t.city].filter(Boolean).join(' · '),
      league: 'pul',
      logoUrl: t.logoUrl ?? null,
      prominence: 3, // pro league — top-tier
    }));

  // PUL players — dedupe same humans against USAU rows, then cap.
  const pulTeamName = new Map(pulTeams.map((t) => [t.id, t.name]));
  const pulPlayerResults: SearchResult[] = [];
  {
    const seen = new Set<string>();
    for (const p of pulPlayers) {
      if (pulPlayerResults.length >= cap) break;
      if (!p.playerName.toLowerCase().includes(needle)) continue;
      const key = p.playerName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (usauPlayerNames.some((n) => namesMatch(n, p.playerName))) continue;
      pulPlayerResults.push({
        kind: 'player',
        id: p.id,
        name: p.playerName,
        hint: ['PUL', pulTeamName.get(p.teamId)].filter(Boolean).join(' · '),
        league: 'pul',
      });
    }
  }

  // WUL teams — match on name OR city.
  const wulTeamResults: SearchResult[] = wulTeams
    .filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.city ?? '').toLowerCase().includes(needle),
    )
    .slice(0, cap)
    .map((t) => ({
      kind: 'team',
      id: t.id,
      name: t.name,
      hint: ['WUL', t.city].filter(Boolean).join(' · '),
      league: 'wul',
      logoUrl: t.logoUrl ?? null,
      prominence: 3, // pro league — top-tier
    }));

  // WUL players
  const wulTeamName = new Map(wulTeams.map((t) => [t.id, t.name]));
  const wulPlayerResults: SearchResult[] = [];
  {
    const seen = new Set<string>();
    for (const p of wulPlayers) {
      if (wulPlayerResults.length >= cap) break;
      if (!p.playerName.toLowerCase().includes(needle)) continue;
      const key = p.playerName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (usauPlayerNames.some((n) => namesMatch(n, p.playerName))) continue;
      wulPlayerResults.push({
        kind: 'player',
        id: p.id,
        name: p.playerName,
        hint: ['WUL', wulTeamName.get(p.teamId)].filter(Boolean).join(' · '),
        league: 'wul',
      });
    }
  }

  // WFDF teams — DB fuzzy-matched already; tag with the event for context.
  const wfdfTeamResults: SearchResult[] = wfdfTeams.map((t) => ({
    kind: 'team',
    id: t.id,
    name: t.name,
    hint: ['WFDF', t.eventName].filter(Boolean).join(' · '),
    league: 'wfdf',
    prominence: 2, // international event teams — neutral (not a standing club/pro team)
  }));

  // WFDF players — route via the by-name resolver (no anchor id). `id` carries
  // the full name. Dedupe against USAU rows so a US player already shown from
  // USAU (whose unified profile merges their WFDF stints) isn't listed twice.
  const wfdfPlayerResults: SearchResult[] = [];
  {
    const seen = new Set<string>();
    for (const p of wfdfPlayers) {
      if (wfdfPlayerResults.length >= cap) break;
      const key = p.fullName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (usauPlayerNames.some((n) => namesMatch(n, p.fullName))) continue;
      wfdfPlayerResults.push({
        kind: 'player',
        id: p.fullName, // by-name resolver route uses the name, not a UUID
        name: p.fullName,
        hint: ['WFDF', p.teamName].filter(Boolean).join(' · '),
        league: 'wfdf',
      });
    }
  }

  // WFDF events — tournaments (route to /wfdf/events/[slug] via resultHref).
  const wfdfEventResults: SearchResult[] = wfdfEvents.map((e) => ({
    kind: 'tournament',
    id: e.slug,
    name: e.name,
    hint: ['WFDF', String(e.year)].filter(Boolean).join(' · '),
    league: 'wfdf',
  }));

  const merged = [
    ...usau,
    ...ufaResults,
    ...ufaTeamResults,
    ...pulTeamResults,
    ...pulPlayerResults,
    ...wulTeamResults,
    ...wulPlayerResults,
    ...wfdfTeamResults,
    ...wfdfPlayerResults,
    ...wfdfEventResults,
  ];

  // Rank by: (1) match quality — exact (0) > starts-with (1) > contains (2);
  // then (2) prominence DESC — adult club + pro-league teams above college,
  // above youth/HS, so "Colorado" floats real clubs over U-20/Academy noise;
  // then (3) alphabetical. Missing prominence defaults to 2 (neutral — between
  // youth=1 and prominent=3), which is where bare players/tournaments land.
  const tier = (name: string): number => {
    const n = name.toLowerCase();
    if (n === needle) return 0;
    if (n.startsWith(needle)) return 1;
    return 2;
  };
  const prom = (r: SearchResult): number => r.prominence ?? 2;
  merged.sort((a, b) => {
    const ta = tier(a.name);
    const tb = tier(b.name);
    if (ta !== tb) return ta - tb;
    const pa = prom(a);
    const pb = prom(b);
    if (pa !== pb) return pb - pa; // higher prominence first
    return a.name.localeCompare(b.name);
  });

  return merged.slice(0, limit * 2);
}
