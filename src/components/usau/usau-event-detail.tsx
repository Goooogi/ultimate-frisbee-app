'use client';

// Shared event-detail body: pools + brackets for one USAU tournament.
// Used by /usau/events/[slug] and the /scores?league=usau view, which
// renders the most-recent club tournament with this same UI.
//
// Gender filter:
// The page reads the global `?div=men|women|mixed` URL param (managed by
// the top-of-page UsauDivisionSelect dropdown) and filters the entire
// view — pools, pool games, bracket tree, and bracket-play list — to that
// division. Each gender's bracket is independent, so showing both at once
// would mix unrelated games into the same pool cards.
//
// Single-division events (regional sectionals, regular-season tournaments)
// auto-fall-back to their available division so the URL filter doesn't
// accidentally hide everything.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { useDivision, type UsauDivision } from '@/lib/use-division';
import { useLevel, type UsauLevel } from '@/lib/use-level';
import { useViewParam } from '@/lib/use-view-param';
import { USAU_LEVELS } from '@/lib/league';
import { UsauBracketTree, UsauPlacementBracketTree, isChampionshipBracket, bracketGroupPrefix } from './usau-bracket-tree';
import { formatGameTime } from '@/lib/usau/venue-tz';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { DivisionPager } from '@/components/division-pager';
import { UsauLevelSelect } from '@/components/usau/usau-level-select';

// Masters combined events prefix every bracket with its group ("GM Women ·
// Pool A", "Masters Mixed · 1st Place"). Pool detection and display labels
// need the tail, not the raw name.
function bracketTail(name: string): string {
  const i = name.lastIndexOf('·');
  return i >= 0 ? name.slice(i + 1).trim() : name;
}

function isPoolBracket(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = bracketTail(name).toLowerCase();
  // A crossover is NOT a pool even if it says "Pool B-C Crossover".
  if (t.includes('crossover')) return false;
  return t.startsWith('pool');
}

/** Crossover games bridge pool play and the bracket (e.g. "Pool B-C Crossover",
 *  "9th Place Crossover X"). Identified by bracket_name — there's no crossover
 *  round type. Their own tab keeps them out of both Pool Games and Bracket. */
function isCrossoverBracket(name: string | null | undefined): boolean {
  if (!name) return false;
  return bracketTail(name).toLowerCase().includes('crossover');
}

/** Does a bracket_name read as a placement group? ("9th Place", "Placement",
 *  "21st (3 games each)"). Mirrors the scraper's isPlacementLabel so a
 *  placement-ish 'other' game never migrates into the Rounds tab. */
function isPlacementName(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = bracketTail(name).toLowerCase();
  return /placement/.test(t) || /\b\d+(st|nd|rd|th)\s+place\b/.test(t) || /^\s*\d+(st|nd|rd|th)\b/.test(t);
}

/** Matchup rounds — pool-less Saturday phases like Cooler Classic 37 Men's
 *  "Sat Round 1/2/3": stored round='other' with the tab label as bracket_name.
 *  Not a pool, not a crossover, not placement — they get their own Rounds tab. */
function isMatchupRound(g: { round: string; bracketName: string | null }): boolean {
  return (
    g.round === 'other' &&
    !isCrossoverBracket(g.bracketName) &&
    !isPoolBracket(g.bracketName) &&
    !isPlacementName(g.bracketName)
  );
}

type Game = UsauEventSummary['games'][number];
type Team = UsauEventSummary['teams'][number];

interface Props {
  event: UsauEventSummary;
}

export function UsauEventDetail({ event }: Props) {
  // ── Detect available competition levels ───────────────────────────────
  // Combined masters championships host Masters AND Grand Masters groups in
  // ONE event (each team is tagged per-group). Those must be viewed one
  // level at a time — mixing them would blend two unrelated brackets.
  // Single-level events (all club, all D-I, …) skip this entirely.
  const availableLevels = useMemo(() => {
    const set = new Set<string>();
    for (const t of event.teams) {
      if (t.competitionLevel) set.add(t.competitionLevel);
    }
    return USAU_LEVELS.filter((l) => set.has(l));
  }, [event.teams]);

  const [urlLevel] = useLevel();
  const level: UsauLevel | '' =
    availableLevels.length > 1
      ? (availableLevels.includes(urlLevel) ? urlLevel : availableLevels[0])
      : '';

  // Teams narrowed to the active level (no-op for single-level events).
  const levelTeams = useMemo(
    () => (level ? event.teams.filter((t) => t.competitionLevel === level) : event.teams),
    [event.teams, level],
  );

  // ── Detect available genders (within the active level) ────────────────
  const availableGenders = useMemo(() => {
    const set = new Set<string>();
    for (const t of levelTeams) {
      if (t.genderDivision) set.add(t.genderDivision);
    }
    return Array.from(set);
  }, [levelTeams]);

  // Source of truth: the global ?div URL param, set by the
  // UsauDivisionSelect dropdown at the top of the page.
  const [division] = useDivision();

  // Decide the active gender filter:
  //   - If the event has the URL-selected gender, use it.
  //   - Otherwise fall back to the event's only/first gender so we don't
  //     hide all content (e.g. ?div=men on a Women's-only sectional).
  const gender =
    availableGenders.includes(division)
      ? division
      : (availableGenders[0] ?? '');

  // Per-division derivation (teams/games filter, pools, brackets, tabs, …) is
  // pulled out into buildDivisionData() below, called once per division by
  // DivisionPager's renderDivision — this component no longer computes it for
  // a single closed-over "active" division.

  // Divisions this event actually fielded, in canonical order — drives the
  // scoped division switcher below (only shown when there's more than one).
  const eventDivisions = (['Men', 'Women', 'Mixed'] as const).filter((d) =>
    availableGenders.includes(d),
  ) as UsauDivision[];

  return (
    <EventTabsView
      event={event}
      level={level}
      availableLevels={availableLevels}
      levelTeams={levelTeams}
      eventDivisions={eventDivisions}
      gender={gender}
    />
  );
}

type ViewTab = 'pools' | 'bracket';

/** Everything derived FOR ONE DIVISION — pools, games, brackets, standings,
 *  and which view tabs it can fill. DivisionPager's renderDivision calls this
 *  for the active division every render, and for the neighbor division mid-
 *  swipe, so it must be a pure function of `division` (not the closed-over
 *  active gender that the pre-pager version relied on). */
function buildDivisionData(event: UsauEventSummary, levelTeams: Team[], division: string) {
  // ── Filter teams + games by gender ────────────────────────────────────
  // (Same logic/comments as the pre-pager version — see git history — just
  // parameterized on `division` instead of the closed-over `gender`.)
  const filteredTeams = division
    ? levelTeams.filter((t) => t.genderDivision === division)
    : levelTeams;
  let teams: Team[];
  let games: Game[];
  if (filteredTeams.length === event.teams.length) {
    teams = event.teams;
    games = event.games;
  } else {
    const teamIds = new Set(filteredTeams.map((t) => t.teamId));
    const inDivision = (g: Game) =>
      (g.teamAId != null && teamIds.has(g.teamAId)) ||
      (g.teamBId != null && teamIds.has(g.teamBId));
    const fieldCluster = (loc: string) =>
      loc.trim().toLowerCase().replace(/^(\d+)[a-z]$/, '$1');
    const divisionFields = new Map<string, Set<string>>();
    for (const g of event.games) {
      if (!g.bracketName || !g.location || !inDivision(g)) continue;
      const set = divisionFields.get(g.bracketName) ?? new Set<string>();
      set.add(fieldCluster(g.location));
      divisionFields.set(g.bracketName, set);
    }
    games = event.games.filter((g) => {
      if (inDivision(g)) return true;
      if (g.teamAId != null || g.teamBId != null) return false;
      if (!g.bracketName || !g.location) return false;
      return divisionFields.get(g.bracketName)?.has(fieldCluster(g.location)) ?? false;
    });
    teams = filteredTeams;
  }

  // ── Second-phase pools ("Pool E") ─────────────────────────────────────
  const poolToken = (name: string): string | null => {
    const m = name.trim().toLowerCase().match(/^pool\s+(\S+)/);
    return m ? m[1] : null;
  };
  const assignedPoolTokens = new Set<string>();
  let teamsWithoutPool = 0;
  for (const t of teams) {
    const tok = t.pool ? poolToken(t.pool) : null;
    if (tok) assignedPoolTokens.add(tok);
    else teamsWithoutPool++;
  }
  const poolAssignmentsComplete = assignedPoolTokens.size > 0 && teamsWithoutPool === 0;
  const isSecondPhasePool = (name: string | null | undefined): boolean => {
    if (!name || !poolAssignmentsComplete) return false;
    if (!isPoolBracket(name)) return false;
    const tok = poolToken(bracketTail(name));
    return tok != null && !assignedPoolTokens.has(tok);
  };

  // ── Group-prefix awareness ────────────────────────────────────────────
  const groupPrefixSet = new Set<string>();
  for (const g of games) {
    const p = bracketGroupPrefix(g.bracketName);
    if (p) groupPrefixSet.add(p);
  }
  const showGroupPrefixes = groupPrefixSet.size > 1;
  const bracketLabel = (name: string) => (showGroupPrefixes ? name : bracketTail(name));

  // ── Pools (from filtered teams) ───────────────────────────────────────
  let pools: Array<{ name: string; teams: Team[] }> = [];
  const teamsByPool = new Map<string, Team[]>();
  if (!showGroupPrefixes) {
    for (const t of teams) {
      if (!t.pool) continue;
      if (!teamsByPool.has(t.pool)) teamsByPool.set(t.pool, []);
      teamsByPool.get(t.pool)!.push(t);
    }
  }
  if (teamsByPool.size > 0) {
    pools = Array.from(teamsByPool.entries())
      .map(([name, ts]) => ({
        name,
        teams: ts.slice().sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const poolTeamIds = new Map<string, Set<string>>();
    for (const g of games) {
      if (!g.bracketName || !isPoolBracket(g.bracketName)) continue;
      if (!poolTeamIds.has(g.bracketName)) poolTeamIds.set(g.bracketName, new Set());
      if (g.teamAId) poolTeamIds.get(g.bracketName)!.add(g.teamAId);
      if (g.teamBId) poolTeamIds.get(g.bracketName)!.add(g.teamBId);
    }
    const teamById = new Map(teams.map((t) => [t.teamId, t] as const));
    pools = Array.from(poolTeamIds.entries())
      .map(([name, ids]) => ({
        name,
        teams: Array.from(ids)
          .map((id) => teamById.get(id))
          .filter((t): t is Team => !!t)
          .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Placement brackets (filtered games) ───────────────────────────────
  const bracketKey = (g: Game) => g.bracketName ?? 'Bracket';
  const byBracket = new Map<string, Game[]>();
  for (const g of games) {
    if (isPoolBracket(g.bracketName) && !isSecondPhasePool(g.bracketName)) continue;
    if (isMatchupRound(g)) continue;
    if (isChampionshipBracket(g)) continue;
    const k = bracketKey(g);
    if (!byBracket.has(k)) byBracket.set(k, []);
    byBracket.get(k)!.push(g);
  }
  const placementBrackets = Array.from(byBracket.entries())
    .map(([name, gs]) => ({
      name,
      games: gs.slice().sort((a, b) => roundOrder(a.round) - roundOrder(b.round)),
    }))
    .sort((a, b) => bracketOrder(a.name) - bracketOrder(b.name));

  // ── Matchup rounds ("Sat Round 1/2/3") — pool-less Saturday phases. ─────
  const roundGroupsMap = new Map<string, Game[]>();
  for (const g of games) {
    if (!isMatchupRound(g)) continue;
    const k = g.bracketName ?? 'Rounds';
    if (!roundGroupsMap.has(k)) roundGroupsMap.set(k, []);
    roundGroupsMap.get(k)!.push(g);
  }
  const roundGroups = Array.from(roundGroupsMap.entries())
    .map(([name, gs]) => ({
      name,
      games: gs.slice().sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')),
    }))
    .sort((a, b) => (a.games[0]?.scheduledAt ?? '').localeCompare(b.games[0]?.scheduledAt ?? ''));

  // ── Pool play games ───────────────────────────────────────────────────
  const poolGames = new Map<string, Game[]>();
  for (const g of games) {
    if (!g.bracketName || !isPoolBracket(g.bracketName)) continue;
    if (isSecondPhasePool(g.bracketName)) continue;
    if (!poolGames.has(g.bracketName)) poolGames.set(g.bracketName, []);
    poolGames.get(g.bracketName)!.push(g);
  }
  for (const gs of poolGames.values()) {
    gs.sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  }

  // ── Pool-play records (per team, from that pool's completed games) ──────
  const normName = (n: string | null | undefined) => (n ?? '').trim().toLowerCase();
  const nameRecords = new Map<string, { wins: number; losses: number; diff: number; name: string }>();
  const seenGameKeys = new Set<string>();
  for (const gs of poolGames.values()) {
    for (const g of gs) {
      if (g.status !== 'final') continue;
      if (g.scoreA == null || g.scoreB == null || g.scoreA === g.scoreB) continue;
      const na = normName(g.teamAName);
      const nb = normName(g.teamBName);
      if (!na || !nb) continue;
      const pair = [na, nb].sort();
      const scores = [g.scoreA, g.scoreB].sort((x, y) => x - y);
      const gkey = `${pair[0]}|${pair[1]}|${scores[0]}|${scores[1]}`;
      if (seenGameKeys.has(gkey)) continue;
      seenGameKeys.add(gkey);

      const aWon = g.scoreA > g.scoreB;
      const winName = aWon ? na : nb;
      const loseName = aWon ? nb : na;
      const winDisplay = aWon ? (g.teamAName ?? '') : (g.teamBName ?? '');
      const loseDisplay = aWon ? (g.teamBName ?? '') : (g.teamAName ?? '');
      const margin = Math.abs(g.scoreA - g.scoreB);
      const rw = nameRecords.get(winName) ?? { wins: 0, losses: 0, diff: 0, name: winDisplay };
      rw.wins += 1;
      rw.diff += margin;
      nameRecords.set(winName, rw);
      const rl = nameRecords.get(loseName) ?? { wins: 0, losses: 0, diff: 0, name: loseDisplay };
      rl.losses += 1;
      rl.diff -= margin;
      nameRecords.set(loseName, rl);
    }
  }
  const poolRecords = new Map<string, { wins: number; losses: number; diff: number }>();
  for (const t of teams) {
    const rec = nameRecords.get(normName(t.teamName));
    if (rec) poolRecords.set(t.teamId, { wins: rec.wins, losses: rec.losses, diff: rec.diff });
  }

  // ── Championship finals (for the top-of-page result banners) ───────────
  const championshipGames = games.filter(isChampionshipBracket);
  const isDecided = (g: Game) => {
    const status = g.status.toLowerCase();
    if (status === 'forfeit') return true;
    if (status !== 'final') return false;
    return g.scoreA != null && g.scoreB != null && g.scoreA !== g.scoreB;
  };

  const explicitFinals = championshipGames.filter((g) => g.round === 'final' && isDecided(g));

  const byGroupSemis = new Map<string, Game[]>();
  for (const g of championshipGames) {
    if (g.round !== 'semi') continue;
    const k = bracketGroupPrefix(g.bracketName);
    if (!byGroupSemis.has(k)) byGroupSemis.set(k, []);
    byGroupSemis.get(k)!.push(g);
  }
  const recoveredFinals: Game[] = [];
  for (const [k, semis] of byGroupSemis) {
    if (explicitFinals.some((g) => bracketGroupPrefix(g.bracketName) === k)) continue;
    const semiWinners = new Set(
      semis
        .map((g) =>
          g.scoreA != null && g.scoreB != null && g.scoreA !== g.scoreB
            ? (g.scoreA > g.scoreB ? g.teamAId : g.teamBId)
            : null,
        )
        .filter((id): id is string => !!id),
    );
    const recovered = championshipGames.find(
      (g) =>
        g.round !== 'prequarter' && g.round !== 'quarter' && g.round !== 'semi' && g.round !== 'final' &&
        bracketGroupPrefix(g.bracketName) === k &&
        !!g.teamAId && !!g.teamBId &&
        semiWinners.has(g.teamAId) && semiWinners.has(g.teamBId) &&
        isDecided(g),
    );
    if (recovered) recoveredFinals.push(recovered);
  }

  const finals = [...explicitFinals, ...recoveredFinals];
  const byGroup = new Map<string, Game>();
  for (const g of finals) {
    const k = bracketGroupPrefix(g.bracketName);
    const prev = byGroup.get(k);
    if (!prev || (g.scheduledAt ?? '') > (prev.scheduledAt ?? '')) byGroup.set(k, g);
  }
  const champFinals = Array.from(byGroup.entries())
    .map(([label, game]) => ({ label, game }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // ── Pool leader (fallback winner when there's no bracket final) ─────────
  let poolLeader: { team: Team; wins: number; losses: number } | null = null;
  if (champFinals.length === 0) {
    const teamByName = new Map(teams.map((t) => [normName(t.teamName), t] as const));
    const standings = Array.from(nameRecords.values())
      .map((r) => ({ team: teamByName.get(normName(r.name)) ?? null, name: r.name, wins: r.wins, losses: r.losses }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    const top = standings[0];
    if (top && !(top.wins === 0 && top.losses === 0) && top.team) {
      const tiedForFirst = standings.filter(
        (s) => s.wins === top.wins && s.losses === top.losses,
      ).length;
      if (tiedForFirst <= 1) poolLeader = { team: top.team, wins: top.wins, losses: top.losses };
    }
  }

  // ── View tabs (#6): Pools / Bracket ──────────────────────────────────────
  const bracketHasTeams = games.some(
    (g) =>
      (isChampionshipBracket(g) || isPlacementName(g.bracketName) || isCrossoverBracket(g.bracketName)) &&
      (g.teamAId != null || g.teamBId != null),
  );
  const hasBracket =
    (games.some((g) => isChampionshipBracket(g)) || placementBrackets.length > 0) &&
    bracketHasTeams;
  const hasPools = pools.length > 0 || poolGames.size > 0 || roundGroups.length > 0;
  const TABS: Array<{ key: ViewTab; label: string; show: boolean }> = [
    { key: 'pools',      label: 'Pools',      show: hasPools },
    { key: 'bracket',    label: 'Bracket',    show: hasBracket },
  ];
  const visibleTabs = TABS.filter((t) => t.show);
  const defaultTab: ViewTab = hasBracket ? 'bracket' : (visibleTabs[0]?.key ?? 'pools');

  return {
    teams, games, showGroupPrefixes, bracketLabel, pools, placementBrackets,
    roundGroups, poolGames, poolRecords, champFinals, poolLeader,
    visibleTabs, defaultTab,
  };
}

/**
 * Presentational tabbed body. Split out from UsauEventDetail so it can hold the
 * active-tab useState without complicating the data-derivation parent. Banners
 * + level/division switchers stay ABOVE the tabs; the four tab views render the
 * previously-stacked sections one at a time.
 */
function EventTabsView(props: {
  event: UsauEventSummary;
  level: UsauLevel | '';
  availableLevels: UsauLevel[];
  levelTeams: Team[];
  eventDivisions: UsauDivision[];
  gender: string;
}) {
  const { event, level, availableLevels, levelTeams, eventDivisions, gender } = props;

  // Tab lives in the URL (?tab=) so back-nav from a team page and hard refresh
  // both keep it (Hunter ruling 2026-08-16; div/level were already URL-backed).
  const [tabParam, setTabParam] = useViewParam('tab');
  const [, setDivision] = useDivision();
  const tabRequested = tabParam === 'pools' || tabParam === 'bracket' ? tabParam : null;

  const activeGender = eventDivisions.includes(gender as UsauDivision)
    ? (gender as UsauDivision)
    : null;

  // The ACTIVE division's view tabs render in the shared control row (left of
  // the division pills — Hunter's tournament-header layout, 2026-08-20), so
  // they're derived here rather than inside the per-division content.
  // buildDivisionData is pure and memoized; DivisionContent still runs it per
  // rendered division for the sections themselves.
  const effectiveDivision = activeGender ?? eventDivisions[0] ?? '';
  const { visibleTabs, defaultTab } = useMemo(
    () => buildDivisionData(event, levelTeams, effectiveDivision),
    [event, levelTeams, effectiveDivision],
  );
  const activeTab: ViewTab =
    tabRequested != null && visibleTabs.some((t) => t.key === tabRequested)
      ? tabRequested
      : defaultTab;

  return (
    <>
      {/* Row 1 — "View on USAU" link (left) + Level select (right). One
          compact header row on mobile. Level only renders when the event
          fielded 2+ (combined masters championships; writes the URL param
          read via useLevel() above). The Division switcher moved below the
          view tabs as centered pills (DivisionPager), mirroring the mobile
          app's layout. */}
      {(event.url || availableLevels.length > 1) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {event.url ? <UsauExternalLink url={event.url} name={event.name} /> : <span />}
          {availableLevels.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                Level
              </span>
              <UsauLevelSelect
                restrictTo={availableLevels}
                value={level || undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* Centered division pills + swipeable division content — tap a pill or
          swipe the content left/right on touch to change division (ported
          from the mobile app; replaces the header's Division dropdown).
          Writes the same ?div= URL param. renderDivision is called for the
          active division every render, AND for the neighbor division while a
          swipe is in flight (live preview), so every per-division value
          (pools/games/brackets/tabs) is derived fresh per call via
          buildDivisionData/DivisionContent — nothing here closes over a
          single "active" division anymore. */}
      <DivisionPager
        divisions={eventDivisions.map((d) => ({ value: d, label: d }))}
        active={activeGender}
        onChange={setDivision}
        tabRowLeading={
          visibleTabs.length > 1 ? (
            <div role="tablist" aria-label="Tournament views" className="flex items-center justify-between gap-5 lg:justify-start">
              {visibleTabs.map((t) => {
                const on = t.key === activeTab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTabParam(t.key)}
                    className={[
                      'shrink-0 pb-1 border-b-2 whitespace-nowrap',
                      'text-[12px] font-bold tracking-[0.1em] uppercase font-tight cursor-pointer',
                      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      on ? 'text-ink border-accent' : 'text-muted border-transparent hover:text-ink',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
        renderDivision={(division) => (
          <DivisionContent
            event={event}
            level={level}
            levelTeams={levelTeams}
            division={division}
            tabRequested={tabRequested}
          />
        )}
        contentClassName="flex flex-col gap-6"
      />
    </>
  );
}

/** One division's full body: champion/pool-leader banners and the active
 *  tab's content — parameterized by `division` so DivisionPager can render it
 *  for any division (not just the globally-active one). The view-tab row
 *  itself lives up in EventTabsView's shared control row. */
function DivisionContent({
  event,
  level,
  levelTeams,
  division,
  tabRequested,
}: {
  event: UsauEventSummary;
  level: UsauLevel | '';
  levelTeams: Team[];
  division: string;
  tabRequested: ViewTab | null;
}) {
  const {
    teams, games, showGroupPrefixes, bracketLabel, pools, placementBrackets,
    roundGroups, poolGames, poolRecords, champFinals, poolLeader,
    visibleTabs, defaultTab,
  } = useMemo(
    () => buildDivisionData(event, levelTeams, division),
    [event, levelTeams, division],
  );

  // A tab requested via the URL only applies here when THIS division can fill
  // it — otherwise this division falls back to its OWN first-filled tab, not
  // whatever tab another division resolved to (fixes a blank swipe-preview
  // when swiping into a division lacking the currently-active tab's content).
  const active: ViewTab =
    tabRequested != null && visibleTabs.some((t) => t.key === tabRequested)
      ? tabRequested
      : defaultTab;

  return (
    <>
      {/* Champion banner — leads the page for a finished tournament so the
          title result is the first thing seen (esp. on mobile, where the
          bracket tree scrolls horizontally and hides the final). */}
      {champFinals.map(({ label, game }) => (
        <ChampionBanner
          key={game.id}
          game={game}
          label={showGroupPrefixes ? label || null : null}
          competitionLevel={level || event.competitionLevel}
          genderDivision={division || null}
        />
      ))}

      {/* Pool leader — shown for a pool-play-only division (no bracket final).
          The best (unique) pool record is the de-facto winner. */}
      {champFinals.length === 0 && poolLeader && (
        <PoolLeaderBanner
          team={poolLeader.team}
          wins={poolLeader.wins}
          losses={poolLeader.losses}
          competitionLevel={level || event.competitionLevel}
        />
      )}

      {/* View tabs render in the shared control row up in EventTabsView
          (DivisionPager's tabRowLeading) — this content keeps only its own
          per-division `active` fallback. */}

      {/* ── Pools — standings cards + per-pool game lists (merged) ───────── */}
      {active === 'pools' && (
        <section aria-labelledby="pools-heading" className="flex flex-col gap-8">
          <h2 id="pools-heading" className="sr-only">Pools</h2>

          {/* Standings cards, each with its games merged in behind a
              collapsed-by-default disclosure (mobile parity). */}
          {pools.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {pools.map((pool) => (
                <PoolCard
                  key={pool.name}
                  pool={{ name: bracketLabel(pool.name), teams: pool.teams }}
                  competitionLevel={level || event.competitionLevel}
                  records={poolRecords}
                  games={poolGames.get(pool.name) ?? []}
                  venueState={event.state}
                />
              ))}
            </div>
          )}
          {pools.length > 0 && poolGames.size === 0 && <PoolGamesEmpty slug={event.slug} />}

          {/* Matchup rounds — pool-less Saturday phases ("Sat Round 1/2/3"),
              folded into Pool Play as generic sections below the pools. */}
          {roundGroups.length > 0 && (
            <div className="flex flex-col gap-5">
              {roundGroups.map((grp) => (
                <section key={grp.name} aria-label={grp.name}>
                  <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
                    {grp.name}
                  </h2>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {grp.games.map((g) => (
                      <GameRow key={g.id} game={g} venueState={event.state} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Bracket — championship tree, then every placement group stacked ─ */}
      {active === 'bracket' && (
        <BracketView
          games={games}
          teams={teams}
          placementBrackets={placementBrackets}
          bracketLabel={bracketLabel}
          venueState={event.state}
        />
      )}

      {visibleTabs.length === 0 && (
        <div className="text-[12px] text-faint font-tight">
          {games.length > 0
            ? 'Schedule published, matchups not set yet — teams are seeded once pool play begins.'
            : 'No pool or bracket data scraped for this event yet.'}
        </div>
      )}
    </>
  );
}

/**
 * "Bracket" tab body: the championship tree FIRST, then every placement
 * group stacked below it, ascending by place (3rd → 5th → 7th → 9th …).
 * Each placement group renders as its own tree when it's genuinely
 * multi-round (label reads "bracket", or its games span ≥2 of
 * prequarter/quarter/semi plus a decider); otherwise it's a flat list of
 * game cards. When there's no championship tree at all, everything falls
 * back to the pre-existing flat grouped list (never double-rendered against
 * the tree-plus-stack path above).
 */
function BracketView({
  games,
  teams,
  placementBrackets,
  bracketLabel,
  venueState,
}: {
  games: Game[];
  teams: Team[];
  placementBrackets: Array<{ name: string; games: Game[] }>;
  bracketLabel: (name: string) => string;
  venueState: string | null;
}) {
  const hasTree = games.some((g) => isChampionshipBracket(g));

  // Placement groups already arrive sorted ascending by place (bracketOrder,
  // via canonicalPlacement) from the parent. Decide tree-vs-flat per group.
  const renderGroups = useMemo(
    () =>
      placementBrackets.map((bracket) => ({
        bracket,
        isTree: isDerivableBracketGroup(bracket.name, bracket.games),
      })),
    [placementBrackets],
  );

  if (!hasTree) {
    // No championship tree at all — keep the existing flat grouped fallback.
    return (
      <div className="flex flex-col gap-7">
        {placementBrackets.map((bracket) => (
          <BracketBlock
            key={bracket.name}
            bracket={{ name: bracketLabel(bracket.name), games: bracket.games }}
            venueState={venueState}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-9">
      <UsauBracketTree games={games} teams={teams} venueState={venueState} />

      {renderGroups.length > 0 && (
        <div className="flex flex-col gap-7">
          {renderGroups.map(({ bracket, isTree }) =>
            isTree ? (
              <PlacementTree
                key={bracket.name}
                label={bracketLabel(bracket.name)}
                games={bracket.games}
                venueState={venueState}
              />
            ) : (
              <BracketBlock
                key={bracket.name}
                bracket={{ name: bracketLabel(bracket.name), games: bracket.games }}
                venueState={venueState}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// A placement group derives a tree (instead of the flat chronological list)
// when either:
//   (a) its label contains "bracket" ("Ninth Place Bracket", "Thirteenth
//       Place Bracket") — USAU's own signal that it's bracket-shaped, or
//   (b) its games actually span ≥2 distinct rounds from prequarter/quarter/
//       semi PLUS a deciding game — e.g. "Fifth Place Bracket" carries semis
//       + final without "bracket" always appearing verbatim upstream.
// A single-game placement final ("Eleventh Place", "Fifteenth Place") hits
// neither condition and stays flat — a 2-team tree would just be a game
// card with extra steps. Mirrors mobile's isDerivableBracketGroup.
const CHAIN_ROUNDS_FOR_TREE = ['prequarter', 'quarter', 'semi'];

function isDerivableBracketGroup(label: string, games: Game[]): boolean {
  if (label.toLowerCase().includes('bracket')) return true;
  const chainRoundsPresent = new Set(
    games.map((g) => g.round).filter((r) => CHAIN_ROUNDS_FOR_TREE.includes(r)),
  );
  if (chainRoundsPresent.size < 2) return false;
  // A deciding game: an explicit final, or an 'other'-tagged game riding
  // along with the chain rounds (the mislabeled-final recovery case).
  return games.some((g) => g.round === 'final' || g.round === 'other');
}

/** Renders one placement group as its own bracket tree, labeled by our own
 *  heading (the shared championship-tree component owns the "Championship
 *  bracket" heading, so placement groups use the headless variant). */
function PlacementTree({
  label,
  games,
  venueState,
}: {
  label: string;
  games: Game[];
  venueState: string | null;
}) {
  return (
    <div>
      <h3 className="font-display italic font-bold text-[22px] leading-tight tracking-[-0.02em] text-ink mb-3">
        {label}
      </h3>
      <UsauPlacementBracketTree games={games} venueState={venueState} />
    </div>
  );
}

/** External link back to the canonical USAU event page. Lives here (not in
 *  the page header) so it can share a row with the Level/Division selects. */
function UsauExternalLink({ url, name }: { url: string; name: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${name} on USA Ultimate`}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase font-tight bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent no-underline"
    >
      View on USAU
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 1.5h5.5V7" />
        <path d="M8.5 1.5L3.5 6.5" />
        <path d="M7 8.5H1.5V3" />
      </svg>
    </a>
  );
}

function PoolGamesEmpty({ slug }: { slug: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-card-sm bg-ink/[0.03]">
      <span className="text-[11px] font-tight text-muted">
        Pool play games not available in our data — likely scored before our
        scraper picked up this event.
      </span>
      <a
        href={`https://play.usaultimate.org/events/${slug}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-accent hover:underline whitespace-nowrap no-underline"
      >
        View on USAU
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4 2h6v6M10 2L4 8M2 4v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </a>
    </div>
  );
}

function ChampionBanner({
  game,
  label,
  competitionLevel,
  genderDivision,
}: {
  game: Game;
  /** Bracket-group qualifier ("GGM Women") when the view holds multiple
   *  independent championship brackets; null on single-group views. */
  label?: string | null;
  competitionLevel: string;
  genderDivision: string | null;
}) {
  const aWon = game.scoreA != null && game.scoreB != null && game.scoreA > game.scoreB;
  const winnerName = aWon ? game.teamAName : game.teamBName;
  const winnerId = aWon ? game.teamAId : game.teamBId;
  const loserName = aWon ? game.teamBName : game.teamAName;
  const winScore = aWon ? game.scoreA : game.scoreB;
  const loseScore = aWon ? game.scoreB : game.scoreA;

  const WinnerInner = (
    <span className="flex items-center gap-3 min-w-0">
      <UsauTeamLogo name={winnerName ?? ''} genderDivision={genderDivision} competitionLevel={competitionLevel} size={40} />
      <span className="flex flex-col min-w-0">
        <span className="font-display italic font-bold text-[20px] lg:text-[24px] leading-none tracking-[-0.02em] text-ink truncate pr-[0.1em] pb-[0.12em] -mb-[0.12em]">
          {winnerName ?? '—'}
        </span>
        {loserName && (
          <span className="text-[11px] text-muted font-tight truncate mt-1">
            def. {loserName} · {winScore}–{loseScore}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <section
      aria-label="Champion"
      className="mb-6 rounded-card-lg shadow-card bg-surface overflow-hidden"
    >
      {/* accent tint / trophy row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-accent/[0.06]">
        <TrophyIcon />
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
          Champion{label ? ` · ${label}` : ''}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        {winnerId ? (
          <Link
            href={`/usau/teams/${winnerId}`}
            className="min-w-0 flex-1 hover:opacity-80 transition-opacity no-underline"
          >
            {WinnerInner}
          </Link>
        ) : (
          <span className="min-w-0 flex-1">{WinnerInner}</span>
        )}
      </div>
    </section>
  );
}

function PoolLeaderBanner({
  team,
  wins,
  losses,
  competitionLevel,
}: {
  team: Team;
  wins: number;
  losses: number;
  competitionLevel: string;
}) {
  const Inner = (
    <span className="flex items-center gap-3 min-w-0">
      <UsauTeamLogo
        name={team.teamName}
        genderDivision={team.genderDivision}
        competitionLevel={competitionLevel}
        size={40}
      />
      <span className="flex flex-col min-w-0">
        <span className="font-display italic font-bold text-[20px] lg:text-[24px] leading-none tracking-[-0.02em] text-ink truncate pr-[0.1em] pb-[0.12em] -mb-[0.12em]">
          {team.teamName}
        </span>
        <span className="text-[11px] text-muted font-tight truncate mt-1">
          Best pool record · <span className="tabular">{wins}–{losses}</span>
        </span>
      </span>
    </span>
  );

  return (
    <section
      aria-label="Pool leader"
      className="mb-6 rounded-card-lg shadow-card bg-surface overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-accent/[0.06]">
        <TrophyIcon />
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
          Pool leader
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <Link
          href={`/usau/teams/${team.teamId}`}
          className="min-w-0 flex-1 hover:opacity-80 transition-opacity no-underline"
        >
          {Inner}
        </Link>
      </div>
    </section>
  );
}

function TrophyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0">
      <path
        d="M4 2h8v3a4 4 0 01-8 0V2zM4 3H2v1a2 2 0 002 2M12 3h2v1a2 2 0 01-2 2M6 9.5V11m4-1.5V11M5 14h6M6.5 11h3l.5 3h-4l.5-3z"
        stroke="rgb(var(--accent))"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PoolCard({
  pool,
  competitionLevel,
  records,
  games,
  venueState,
}: {
  pool: { name: string; teams: Team[] };
  competitionLevel: string;
  records: Map<string, { wins: number; losses: number; diff: number }>;
  /** That pool's games, sorted by scheduled time — rendered in a collapsed-
   *  by-default "Games" disclosure beneath the standings (mobile parity:
   *  per-pool games merge under the pool's standings card). */
  games: Game[];
  venueState?: string | null;
}) {
  // Rank by pool record when we have any completed games — tied records break
  // on point diff (Hunter, 2026-08-18); the incoming team order is by seed,
  // which stays as the final tiebreak within equal records.
  const anyRecords = pool.teams.some((t) => t.teamId && records.has(t.teamId));
  const ranked = anyRecords
    ? pool.teams
        .slice()
        .sort((a, b) => {
          const ra = (a.teamId && records.get(a.teamId)) || { wins: 0, losses: 0, diff: 0 };
          const rb = (b.teamId && records.get(b.teamId)) || { wins: 0, losses: 0, diff: 0 };
          if (rb.wins !== ra.wins) return rb.wins - ra.wins;
          if (ra.losses !== rb.losses) return ra.losses - rb.losses;
          if (rb.diff !== ra.diff) return rb.diff - ra.diff;
          return (a.seed ?? 99) - (b.seed ?? 99);
        })
    : pool.teams;

  const [gamesOpen, setGamesOpen] = useState(false);
  const panelId = `pool-games-${pool.name}`;

  return (
    <div className="bg-surface rounded-card shadow-card overflow-hidden">
      <div className="px-4 py-3">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
          {pool.name}
        </span>
      </div>
      <ul>
        {ranked.map((t) => {
          const rec = t.teamId ? records.get(t.teamId) : undefined;
          return (
            <li key={t.teamId} className="border-t border-hairline">
              <Link
                href={`/usau/teams/${t.teamId}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink/[0.03] transition-colors no-underline"
              >
                <span className="tabular text-[11px] font-bold text-faint font-tight w-5 text-right flex-shrink-0">
                  {t.seed ?? '—'}
                </span>
                <UsauTeamLogo
                  name={t.teamName}
                  genderDivision={t.genderDivision}
                  competitionLevel={competitionLevel}
                  size={20}
                />
                <span className="flex-1 min-w-0 text-[13px] font-semibold text-ink font-tight truncate">
                  {t.teamName}
                </span>
                <span className="tabular text-[11px] font-bold text-muted font-tight flex-shrink-0">
                  {rec ? `${rec.wins}–${rec.losses}` : '—'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {games.length > 0 && (
        <div className="border-t border-hairline">
          <button
            type="button"
            aria-expanded={gamesOpen}
            aria-controls={panelId}
            onClick={() => setGamesOpen((o) => !o)}
            className={[
              'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer',
              'hover:bg-ink/[0.03] transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
            ].join(' ')}
          >
            <span className="flex items-center gap-2 min-w-0">
              <PoolGamesChevron open={gamesOpen} />
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                Games
              </span>
            </span>
            <span className="tabular text-[10px] font-bold text-faint font-tight">
              {games.length}
            </span>
          </button>
          {gamesOpen && (
            <ul id={panelId} className="flex flex-col gap-2 px-3 pb-3">
              {games.map((g) => (
                <GameRow key={g.id} game={g} venueState={venueState} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PoolGamesChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={['shrink-0 text-faint transition-transform duration-150', open ? 'rotate-90' : ''].join(' ')}
    >
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BracketBlock({
  bracket,
  venueState,
}: {
  bracket: { name: string; games: Game[] };
  venueState?: string | null;
}) {
  // The ingest classifier tags a placement bracket's DECIDING game round='other'
  // (its classifyRound has no placement-final case), so it renders as "OTHER"
  // and — since roundOrder('other')=1 — sorts ABOVE the semis. Reclassify: when
  // a bracket has semifinals, treat its trailing 'other' game(s) (the ones
  // scheduled after the semis, or the sole non-semi) as the Final so the label
  // and ordering are correct. Pure display remap — no data change.
  const hasSemis = bracket.games.some((g) => g.round === 'semi');
  const latestSemiAt = hasSemis
    ? bracket.games
        .filter((g) => g.round === 'semi')
        .reduce((m, g) => (g.scheduledAt && g.scheduledAt > m ? g.scheduledAt : m), '')
    : '';
  const displayRound = (g: Game): string => {
    if (g.round !== 'other' || !hasSemis) return g.round;
    // An 'other' game that comes at/after the last semi is the placement final.
    if (!g.scheduledAt || !latestSemiAt || g.scheduledAt >= latestSemiAt) return 'final';
    return g.round;
  };

  const byRound = new Map<string, Game[]>();
  for (const g of bracket.games) {
    const r = displayRound(g);
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(g);
  }
  const rounds = Array.from(byRound.entries()).sort(
    (a, b) => roundOrder(a[0]) - roundOrder(b[0]),
  );

  return (
    <div>
      <h3 className="font-display italic font-bold text-[22px] leading-tight tracking-[-0.02em] text-ink mb-3">
        {bracket.name}
      </h3>
      <div className="flex flex-col gap-4">
        {rounds.map(([round, games]) => (
          <div key={round}>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
              {prettyRound(round)}
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {games.map((g) => (
                <GameRow key={g.id} game={g} venueState={venueState} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameRow({
  game,
  showBracket,
  bracketLabel,
  venueState,
}: {
  game: Game;
  /** Crossovers span several bracket_names in one list — show which one. */
  showBracket?: boolean;
  bracketLabel?: (name: string) => string;
  /** Event's US state — times render as the venue's wall clock. */
  venueState?: string | null;
}) {
  const status = game.status.toLowerCase();
  const isCancelled = status === 'cancelled';

  // Mobile parity (GameCard): a game is FINAL when scores are present or its
  // status is final — not by the raw status string, which can leak values
  // like 'in_progress' straight into the UI.
  const hasScore = game.scoreA != null && game.scoreB != null;
  const isFinal = hasScore || status === 'final';
  const aWon = hasScore && isFinal && (game.scoreA ?? 0) > (game.scoreB ?? 0);
  const bWon = hasScore && isFinal && (game.scoreB ?? 0) > (game.scoreA ?? 0);

  // Bracket name is shown on the left (crossovers span several bracket_names
  // in one list). Field + time fold into the right-hand status strip along
  // with FINAL/TBD (mobile parity) instead of the raw status string.
  const bracket = showBracket && game.bracketName
    ? (bracketLabel ? bracketLabel(game.bracketName) : game.bracketName)
    : null;
  // `location` is usually a bare field number ("7") but sometimes a full venue
  // string ("Devens - Rogers Field - 12"). Only prefix "Field" when it's the
  // bare-number form, so we don't render "Field Devens - Rogers Field - 12".
  const fieldLabel = game.location
    ? /^\d+[A-Za-z]?$/.test(game.location.trim())
      ? `Field ${game.location.trim()}`
      : game.location.trim()
    : null;
  const time = formatGameTime(game.scheduledAt, venueState ?? null);
  // Time stays visible on FINAL games too (mobile parity) — previously it was
  // replaced by the word FINAL, which threw away when/where the game was played.
  const statusLabel = isCancelled
    ? 'Cancelled'
    : [isFinal ? 'FINAL' : '', time || (isFinal ? '' : 'TBD'), fieldLabel].filter(Boolean).join(' · ');
  const statusClass = isCancelled ? 'text-muted' : isFinal ? 'text-faint' : 'text-muted';

  return (
    <li className="bg-surface rounded-card-sm shadow-soft p-3">
      <div className="flex items-center justify-between mb-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight">
        {bracket ? (
          <span className="text-muted truncate">{bracket}</span>
        ) : (
          <span />
        )}
        <span className={statusClass}>{statusLabel}</span>
      </div>
      <TeamLine
        name={game.teamAName}
        seed={game.seedA}
        teamId={game.teamAId}
        score={hasScore ? game.scoreA : null}
        won={aWon}
        lost={bWon}
      />
      <TeamLine
        name={game.teamBName}
        seed={game.seedB}
        teamId={game.teamBId}
        score={hasScore ? game.scoreB : null}
        won={bWon}
        lost={aWon}
      />
    </li>
  );
}

function TeamLine({
  name,
  seed,
  teamId,
  score,
  won,
  lost,
}: {
  name: string | null;
  seed: number | null;
  teamId: string | null;
  score: number | null;
  won: boolean;
  lost: boolean;
}) {
  const inner = (
    <span
      className={[
        'flex items-center gap-2 flex-1 min-w-0',
        won ? 'text-ink font-bold' : lost ? 'text-faint' : 'text-muted',
      ].join(' ')}
    >
      {seed != null && (
        <span className="tabular text-[10px] text-faint font-bold w-4 text-right">
          {seed}
        </span>
      )}
      <span className="text-[13px] font-tight truncate">{name ?? '—'}</span>
    </span>
  );

  return (
    <div className="flex items-center gap-3 py-1">
      {teamId ? (
        <Link
          href={`/usau/teams/${teamId}`}
          className="flex-1 min-w-0 hover:text-accent transition-colors no-underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex-1 min-w-0">{inner}</span>
      )}
      {score != null && (
        <span
          className={[
            'tabular text-[16px] font-bold font-tight leading-none w-8 text-right',
            won ? 'text-ink' : lost ? 'text-faint' : 'text-muted',
          ].join(' ')}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function roundOrder(round: string): number {
  switch (round) {
    case 'final':
      return 5;
    case 'semi':
      return 4;
    case 'quarter':
      return 3;
    case 'prequarter':
      return 2;
    case 'placement':
    case 'consolation':
      return 6;
    default:
      return 1;
  }
}

function prettyRound(round: string): string {
  switch (round) {
    case 'final':
      return 'Final';
    case 'semi':
      return 'Semifinals';
    case 'quarter':
      return 'Quarterfinals';
    case 'prequarter':
      return 'Prequarters';
    case 'placement':
      return 'Placement';
    case 'consolation':
      return 'Consolation';
    case 'pool':
      return 'Pool';
    default:
      return round;
  }
}

// ─── Placement-bracket normalization (#7) ───────────────────────────────────
// USAU bracket_name is wildly inconsistent — "Championship Bracket", "1st Place",
// "Championship", "1st Place Bracket", "First Place" are all THE SAME bracket,
// and "5th Place" / "5th Place Bracket" / "Fifth Place" / "5th place" collapse
// too. canonicalPlacement() maps any variant → a stable { key, label, order } so
// placement games can be grouped into navigable sub-tabs.

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fifteenth: 15, seventeenth: 17,
};

export interface PlacementBucket {
  /** Stable identity for grouping (e.g. 'championship', '5th'). */
  key: string;
  /** Sub-tab label (e.g. 'Championship', '5th Place'). */
  label: string;
  /** Sort order — championship first, then ascending by place. */
  order: number;
}

/** Normalize a bracket_name into its placement bucket. */
export function canonicalPlacement(name: string | null | undefined): PlacementBucket {
  const t = (name ?? '').toLowerCase();

  // Championship = 1st place, however it's spelled.
  if (
    t.includes('championship') ||
    /\b1st\b/.test(t) || t.includes('first place') ||
    t === 'finals' || t === 'final' || t === 'ninals'
  ) {
    return { key: 'championship', label: 'Championship', order: 0 };
  }

  // Numeric ordinal: "5th", "13th place", etc.
  const num = t.match(/\b(\d+)(st|nd|rd|th)\b/);
  let place: number | null = num ? parseInt(num[1], 10) : null;

  // Word ordinal: "fifth place", "ninth place bracket".
  if (place == null) {
    for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
      if (t.includes(word)) { place = n; break; }
    }
  }

  if (place != null && place >= 2) {
    const suffix = place % 10 === 1 && place % 100 !== 11 ? 'st'
      : place % 10 === 2 && place % 100 !== 12 ? 'nd'
      : place % 10 === 3 && place % 100 !== 13 ? 'rd' : 'th';
    return { key: `p${place}`, label: `${place}${suffix} Place`, order: place };
  }

  // Second-phase pools routed into the bracket view ("Pool E" — a placement
  // or power round-robin whose name carries no ordinal). Each gets its own
  // filter entry, after the numbered places.
  const pool = t.match(/^pool\s+(\S+)$/);
  if (pool) {
    return { key: `pool-${pool[1]}`, label: (name ?? '').trim(), order: 500 };
  }

  // Backdoor / consolation / anything unrecognized → an "Other" bucket last.
  return { key: 'other', label: 'Other Brackets', order: 999 };
}

function bracketOrder(name: string): number {
  return canonicalPlacement(name).order;
}
