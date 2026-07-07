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

import { useMemo } from 'react';
import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { useDivision, type UsauDivision } from '@/lib/use-division';
import { useLevel, type UsauLevel } from '@/lib/use-level';
import { USAU_LEVELS } from '@/lib/league';
import { UsauBracketTree, isChampionshipBracket, bracketGroupPrefix } from './usau-bracket-tree';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { UsauDivisionSelect } from '@/components/usau/usau-division-select';
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
  return bracketTail(name).toLowerCase().startsWith('pool');
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

  // ── Filter teams + games by gender ────────────────────────────────────
  // Filter to teams whose gender_division matches, then keep only games
  // where at least one participant is in the filtered set. Pool play
  // assignment lives on event_teams (with team.gender), so this approach
  // cleanly partitions pools per gender. For single-gender events the
  // filter is a no-op (every team passes).
  const { teams, games } = useMemo(() => {
    const filteredTeams = gender
      ? levelTeams.filter((t) => t.genderDivision === gender)
      : levelTeams;
    // Nothing narrowed (single-level, single-gender event) → pass through.
    if (filteredTeams.length === event.teams.length) {
      return { teams: event.teams, games: event.games };
    }
    const teamIds = new Set(filteredTeams.map((t) => t.teamId));
    const filteredGames = event.games.filter(
      (g) =>
        (g.teamAId && teamIds.has(g.teamAId)) ||
        (g.teamBId && teamIds.has(g.teamBId)),
    );
    return { teams: filteredTeams, games: filteredGames };
  }, [event.teams, event.games, levelTeams, gender]);

  // ── Group-prefix awareness ────────────────────────────────────────────
  // A filtered view can still contain MULTIPLE independent bracket groups:
  // GGM teams share the GRAND_MASTERS level tag, so the GM Women view of a
  // combined championships holds both "GM Women · …" and "GGM Women · …"
  // games. When that happens, show FULL bracket names (the prefix is the
  // only disambiguator); single-group views strip the redundant prefix.
  const showGroupPrefixes = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      const p = bracketGroupPrefix(g.bracketName);
      if (p) set.add(p);
    }
    return set.size > 1;
  }, [games]);
  const bracketLabel = (name: string) => (showGroupPrefixes ? name : bracketTail(name));

  // ── Pools (from filtered teams) ───────────────────────────────────────
  // Entry-level pool values ("Pool D") carry no group scoping, so on a
  // multi-group view two groups' Pool D would merge — prefer the
  // game-derived pools (group-prefixed bracket names) in that case.
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
    // Derive pools from games whose bracket_name is a pool ("Pool A", or
    // group-prefixed "Masters Mixed · Pool A" on combined masters events).
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
  // The championship bracket ("1st Place") is rendered as the visual tree
  // above, so skip it here. What's left is placement: 13th-place ties,
  // 17th-place ties, etc. These don't fit a tree visualization (they're
  // tie-break round-robins), so we keep them as a flat list.
  const bracketKey = (g: Game) => g.bracketName ?? 'Bracket';
  const byBracket = new Map<string, Game[]>();
  for (const g of games) {
    if (isPoolBracket(g.bracketName)) continue;
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

  // ── Pool play games ───────────────────────────────────────────────────
  const poolGames = new Map<string, Game[]>();
  for (const g of games) {
    if (!g.bracketName || !isPoolBracket(g.bracketName)) continue;
    if (!poolGames.has(g.bracketName)) poolGames.set(g.bracketName, []);
    poolGames.get(g.bracketName)!.push(g);
  }

  // ── Pool-play records (per team, from that pool's completed games) ──────
  // W-L within pool play, shown in the standings card next to each team.
  // Only counts finished games with a decisive score. A team with no
  // completed pool games gets no record (rendered as "—") rather than 0-0,
  // so a pool that hasn't started reads as pending, not all-tied.
  const poolRecords = new Map<string, { wins: number; losses: number }>();
  for (const gs of poolGames.values()) {
    for (const g of gs) {
      if (g.status !== 'final') continue;
      if (g.scoreA == null || g.scoreB == null || g.scoreA === g.scoreB) continue;
      const aWon = g.scoreA > g.scoreB;
      const winId = aWon ? g.teamAId : g.teamBId;
      const loseId = aWon ? g.teamBId : g.teamAId;
      if (winId) {
        const r = poolRecords.get(winId) ?? { wins: 0, losses: 0 };
        r.wins += 1;
        poolRecords.set(winId, r);
      }
      if (loseId) {
        const r = poolRecords.get(loseId) ?? { wins: 0, losses: 0 };
        r.losses += 1;
        poolRecords.set(loseId, r);
      }
    }
  }

  // ── Championship finals (for the top-of-page result banners) ───────────
  // The completed title game(s). Surfaced ABOVE the bracket tree so a
  // finished tournament leads with its champion — most valuable on mobile,
  // where the horizontal bracket tree otherwise buries the final off-screen.
  // One per bracket GROUP: a multi-group view (GM + GGM Women in a combined
  // championships) gets one labeled banner per group.
  const champFinals = useMemo(() => {
    const finals = games.filter(
      (g) =>
        isChampionshipBracket(g) &&
        g.round === 'final' &&
        g.status === 'final' &&
        g.scoreA != null &&
        g.scoreB != null &&
        g.scoreA !== g.scoreB,
    );
    // USAU sometimes labels BOTH the semi and the title game round='final'
    // under "1st Place". The actual title game is the LAST one played, so
    // keep the latest scheduledAt per group.
    const byGroup = new Map<string, Game>();
    for (const g of finals) {
      const k = bracketGroupPrefix(g.bracketName);
      const prev = byGroup.get(k);
      if (!prev || (g.scheduledAt ?? '') > (prev.scheduledAt ?? '')) byGroup.set(k, g);
    }
    return Array.from(byGroup.entries())
      .map(([label, game]) => ({ label, game }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [games]);

  // ── Pool leader (fallback winner when there's no bracket final) ─────────
  // A pool-play-only division has no championship game. The de-facto winner
  // is the team with the best pool record — but only when it's UNIQUE (a tie
  // for first is ambiguous, so we show no banner). Skipped entirely when a
  // bracket final exists (that's the real champion).
  const poolLeader = useMemo(() => {
    if (champFinals.length > 0) return null;
    const teamById = new Map(teams.map((t) => [t.teamId, t] as const));
    const standings = Array.from(poolRecords.entries())
      .filter(([id]) => teamById.has(id))
      .map(([id, r]) => ({ team: teamById.get(id)!, ...r }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    if (standings.length === 0) return null;
    const top = standings[0];
    if (top.wins === 0 && top.losses === 0) return null; // no games played yet
    const tiedForFirst = standings.filter(
      (s) => s.wins === top.wins && s.losses === top.losses,
    ).length;
    if (tiedForFirst > 1) return null;
    return top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champFinals, teams, games]);

  // Divisions this event actually fielded, in canonical order — drives the
  // scoped division switcher below (only shown when there's more than one).
  const eventDivisions = (['Men', 'Women', 'Mixed'] as const).filter((d) =>
    availableGenders.includes(d),
  ) as UsauDivision[];

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
          genderDivision={gender || null}
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

      {/* Level + Division switchers — each only when the event fielded 2+.
          Level: combined masters championships host Masters AND Grand Masters
          groups in one event (writes ?level=, read via useLevel() above).
          Division: most TCT/Nationals events field 2-3 genders (writes ?div=,
          read via useDivision()). Both scoped to what this event actually has. */}
      {(availableLevels.length > 1 || eventDivisions.length > 1) && (
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          {availableLevels.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                Level
              </span>
              <UsauLevelSelect restrictTo={availableLevels} />
            </div>
          )}
          {eventDivisions.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
                Division
              </span>
              <UsauDivisionSelect restrictTo={eventDivisions} />
            </div>
          )}
        </div>
      )}

      {/* Championship bracket tree — visual left→right flow. Renders only
          when there are 1st-place bracket games to show. Receives the
          already-filtered games (filtered by the global ?div URL param). */}
      <UsauBracketTree games={games} teams={teams} />

      {pools.length > 0 && (
        <section className="mb-10" aria-labelledby="pools-heading">
          <h2
            id="pools-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Pool play
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {pools.map((pool) => (
              <PoolCard
                key={pool.name}
                pool={{ name: bracketLabel(pool.name), teams: pool.teams }}
                competitionLevel={level || event.competitionLevel}
                records={poolRecords}
              />
            ))}
          </div>
          {poolGames.size > 0 ? (
            <div className="flex flex-col gap-5">
              {Array.from(poolGames.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([poolName, gs]) => (
                  <div key={poolName}>
                    <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
                      {bracketLabel(poolName)} games
                    </div>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {gs.map((g) => (
                        <GameRow key={g.id} game={g} />
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : (
            <PoolGamesEmpty slug={event.slug} />
          )}
        </section>
      )}

      {placementBrackets.length > 0 && (
        <section aria-labelledby="placement-heading">
          <h2
            id="placement-heading"
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted mb-4 font-tight"
          >
            Placement
          </h2>
          <div className="flex flex-col gap-7">
            {placementBrackets.map((bracket) => (
              <BracketBlock
                key={bracket.name}
                bracket={{ name: bracketLabel(bracket.name), games: bracket.games }}
              />
            ))}
          </div>
        </section>
      )}

      {pools.length === 0 && placementBrackets.length === 0 && games.length === 0 && (
        <div className="text-[12px] text-faint font-tight">
          No pool or bracket data scraped for this event yet.
        </div>
      )}
    </>
  );
}

function PoolGamesEmpty({ slug }: { slug: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-dashed border-border bg-surface">
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
        <span className="font-display italic font-bold text-[20px] lg:text-[24px] leading-none tracking-[-0.02em] text-ink truncate">
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
      className="mb-6 rounded-lg border border-border bg-surface overflow-hidden"
    >
      {/* accent ring / trophy row */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-[rgb(var(--accent)/0.06)]">
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
        <span className="font-display italic font-bold text-[20px] lg:text-[24px] leading-none tracking-[-0.02em] text-ink truncate">
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
      className="mb-6 rounded-lg border border-border bg-surface overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-[rgb(var(--accent)/0.06)]">
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
}: {
  pool: { name: string; teams: Team[] };
  competitionLevel: string;
  records: Map<string, { wins: number; losses: number }>;
}) {
  // Rank by pool record when we have any completed games; the incoming
  // team order is by seed, which stays as the tiebreak within equal records.
  const anyRecords = pool.teams.some((t) => t.teamId && records.has(t.teamId));
  const ranked = anyRecords
    ? pool.teams
        .slice()
        .sort((a, b) => {
          const ra = (a.teamId && records.get(a.teamId)) || { wins: 0, losses: 0 };
          const rb = (b.teamId && records.get(b.teamId)) || { wins: 0, losses: 0 };
          if (rb.wins !== ra.wins) return rb.wins - ra.wins;
          if (ra.losses !== rb.losses) return ra.losses - rb.losses;
          return (a.seed ?? 99) - (b.seed ?? 99);
        })
    : pool.teams;

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="px-3 py-2 border-b border-hairline">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
          {pool.name}
        </span>
      </div>
      <ul>
        {ranked.map((t) => {
          const rec = t.teamId ? records.get(t.teamId) : undefined;
          return (
            <li key={t.teamId} className="border-b border-hairline last:border-b-0">
              <Link
                href={`/usau/teams/${t.teamId}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hi transition-colors no-underline"
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
    </div>
  );
}

function BracketBlock({ bracket }: { bracket: { name: string; games: Game[] } }) {
  const byRound = new Map<string, Game[]>();
  for (const g of bracket.games) {
    if (!byRound.has(g.round)) byRound.set(g.round, []);
    byRound.get(g.round)!.push(g);
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
                <GameRow key={g.id} game={g} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameRow({ game }: { game: Game }) {
  const aWon =
    game.scoreA != null && game.scoreB != null && game.scoreA > game.scoreB;
  const bWon =
    game.scoreA != null && game.scoreB != null && game.scoreB > game.scoreA;

  return (
    <li className="bg-surface border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight">
        {game.location ? (
          <span className="text-muted">Field {game.location}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
        <span className={game.status === 'final' ? 'text-accent' : 'text-muted'}>
          {game.status}
        </span>
      </div>
      <TeamLine
        name={game.teamAName}
        seed={game.seedA}
        teamId={game.teamAId}
        score={game.scoreA}
        won={aWon}
        lost={bWon}
      />
      <TeamLine
        name={game.teamBName}
        seed={game.seedB}
        teamId={game.teamBId}
        score={game.scoreB}
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
      <span
        className={[
          'tabular text-[16px] font-bold font-tight leading-none w-8 text-right',
          won ? 'text-ink' : lost ? 'text-faint' : 'text-muted',
        ].join(' ')}
      >
        {score ?? '—'}
      </span>
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

function bracketOrder(name: string): number {
  const t = name.toLowerCase();
  if (t.includes('championship')) return 0;
  if (t.includes('third')) return 1;
  if (t.includes('fifth')) return 2;
  if (t.includes('seventh')) return 3;
  if (t.includes('ninth')) return 4;
  return 10;
}
