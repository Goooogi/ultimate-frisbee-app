'use client';

// "For You" page body — the signed-in user's personalized feed.
//
// Favorites (leagues + teams) are fetched client-side via getMyFavorites()
// (session-scoped, so this runs in the browser). Those favorites are handed to
// the getForYouFeed() server action, which fans out LIVE per-league data
// (hero game, games strip, team snapshots w/ rank-context + form + stats +
// leaders, tournaments). Layout is hero-led: one big showpiece game up top,
// then the per-team dashboard cards (the substance), then a lighter games
// strip, then tournaments. Standings tables are gone — each team card carries
// its own one-line rank-context string instead. Mirrors the loading/error
// idiom from FavoritesSettings.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { getMyFavorites, type FavoriteLeague } from '@/lib/favorites/data';
import { LEAGUE_DISPLAY } from '@/lib/for-you/leagues';
import {
  getForYouFeed,
  type FeedGame,
  type FeedTournament,
  type ForYouFeed,
  type TeamLeader,
  type TeamSnapshot,
  type TeamStat,
} from '@/lib/for-you/live-data';
import { resultHref } from '@/lib/usau/search-nav';
import { SearchResultIcon } from '@/components/search-result-icon';

// ─── Main export ──────────────────────────────────────────────────────────────

export function ForYouContent() {
  const [feed, setFeed] = useState<ForYouFeed | null>(null);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const favorites = await getMyFavorites();
        if (cancelled) return;
        // The feed is team-driven — a favorite league alone isn't enough.
        if (favorites.teams.length === 0) {
          setEmpty(true);
          setLoading(false);
          return;
        }
        // Live per-league fetch (server action) keyed off the real favorites.
        const f = await getForYouFeed(favorites);
        if (cancelled) return;
        setFeed(f);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell title="For You" eyebrow="YOUR FEED" subtitle="Games, teams, and leagues you follow.">
      {loading && <LoadingState />}
      {!loading && loadError && <ErrorState />}
      {!loading && !loadError && empty && <EmptyState />}
      {!loading && !loadError && !empty && feed && <Loaded feed={feed} />}
    </PageShell>
  );
}

function Loaded({ feed }: { feed: ForYouFeed }) {
  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      {feed.heroGame && <HeroGameCard game={feed.heroGame} />}
      <TeamsSection teams={feed.teams} />
      {feed.games.length > 0 && <GamesSection games={feed.games} />}
      {feed.tournaments.length > 0 && <TournamentsSection tournaments={feed.tournaments} />}
    </div>
  );
}

// ─── Loading / error / empty states ────────────────────────────────────────────
// Mirrors FavoritesSettings' idioms exactly (pulse loading label, alert box).

function LoadingState() {
  return (
    <div className="py-16 flex justify-center">
      <span className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight text-faint animate-pulse">
        Loading…
      </span>
    </div>
  );
}

function ErrorState() {
  return (
    <div
      role="alert"
      className="px-4 py-3 rounded-md bg-[rgb(var(--live)/0.08)] border border-[rgb(var(--live)/0.20)]"
    >
      <span className="font-tight text-[13px] text-ink">
        Couldn&apos;t load your favorites. Please refresh and try again.
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-5 rounded-lg border border-hairline bg-surface">
      <h2 className="m-0 font-tight text-[22px] font-bold tracking-[-0.02em] text-ink">
        Nothing here yet.
      </h2>
      <p className="max-w-[420px] text-[13px] text-muted font-tight leading-snug">
        Your favorite teams and leagues power this page. Add a few and we&apos;ll bring their games
        and standings here for you.
      </p>
      <Link
        href="/settings"
        className={[
          'mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md cursor-pointer min-h-[44px]',
          'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
          'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity',
        ].join(' ')}
      >
        Add favorites
      </Link>
    </div>
  );
}

// ─── Section: hero game — the showpiece ────────────────────────────────────────
// The single most important game (live > soonest upcoming > most recent final),
// rendered as a full-width, heavyweight card — the anchor of the whole page.
// Bigger padding, bigger type, real logos, an accent-tinted surface so it
// visibly outranks every other card below it.

function HeroGameCard({ game }: { game: FeedGame }) {
  const isLive = game.status === 'live';
  const isFinal = game.status === 'final';
  const isUpcoming = game.status === 'upcoming';

  const awayWin = isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score;
  const homeWin = isFinal && game.home.score !== null && game.away.score !== null && game.home.score > game.away.score;

  return (
    <section aria-label="Your next game">
      <div
        className={[
          'relative overflow-hidden rounded-xl border bg-surface',
          isLive ? 'border-[rgb(var(--live)/0.35)]' : 'border-border',
        ].join(' ')}
      >
        {/* Faint accent wash so the hero reads as a distinct tier, not just a bigger tile. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.06] to-transparent"
        />

        <div className="relative px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10 flex flex-col gap-6 lg:gap-8">
          {/* Meta row: status + league */}
          <div className="flex items-center justify-center gap-2.5 font-mono text-[11px] sm:text-[12px] tracking-[0.1em] text-muted">
            {isLive ? (
              <span className="inline-flex items-center gap-2 font-bold" style={{ color: 'rgb(var(--live))' }}>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'rgb(var(--live))', boxShadow: '0 0 0 4px rgb(var(--live) / 0.2)' }}
                />
                LIVE
              </span>
            ) : (
              <span className="font-bold text-ink">{isFinal ? 'FINAL' : 'NEXT'}</span>
            )}
            {!isLive && !isFinal && <span className="text-faint">· {game.when.toUpperCase()}</span>}
            <span className="text-faint">· {LEAGUE_DISPLAY[game.league]}</span>
          </div>

          {/* Matchup */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 lg:gap-10">
            <HeroTeamSide side={game.away} league={game.league} winner={awayWin} loser={homeWin} align="right" />

            <div className="flex flex-col items-center justify-center min-w-[64px] sm:min-w-[96px] lg:min-w-[140px]">
              {isUpcoming ? (
                <>
                  <span className="font-display text-[26px] sm:text-[34px] lg:text-[42px] leading-none text-ink tabular">
                    VS
                  </span>
                  <span className="mt-1.5 font-mono text-[10px] sm:text-[11px] text-faint tracking-[0.08em] whitespace-nowrap">
                    {game.when}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <span
                    className={[
                      'font-display font-bold text-[40px] sm:text-[56px] lg:text-[72px] leading-none tabular transition-opacity',
                      awayWin || isLive ? 'text-ink' : 'opacity-55 text-ink',
                    ].join(' ')}
                  >
                    {game.away.score ?? '–'}
                  </span>
                  <span className="font-display text-[20px] sm:text-[26px] text-faint leading-none">–</span>
                  <span
                    className={[
                      'font-display font-bold text-[40px] sm:text-[56px] lg:text-[72px] leading-none tabular transition-opacity',
                      homeWin || isLive ? 'text-ink' : 'opacity-55 text-ink',
                    ].join(' ')}
                  >
                    {game.home.score ?? '–'}
                  </span>
                </div>
              )}
            </div>

            <HeroTeamSide side={game.home} league={game.league} winner={homeWin} loser={awayWin} align="left" />
          </div>

          <p className="text-center font-tight text-[11.5px] sm:text-[12.5px] text-faint">
            Following <span className="text-muted font-semibold">{game.favoriteTeamName}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function HeroTeamSide({
  side,
  league,
  winner,
  loser,
  align,
}: {
  side: FeedGame['home'];
  league: FavoriteLeague;
  winner: boolean;
  loser: boolean;
  align: 'left' | 'right';
}) {
  const href = resultHref({ kind: 'team', id: side.teamId, name: side.name, league, hint: null });
  const isFinalOrLive = winner || loser;

  return (
    <div
      className={[
        'flex flex-col items-center gap-2.5 sm:gap-3 min-w-0 transition-opacity',
        align === 'right' ? 'sm:items-end' : 'sm:items-start',
        isFinalOrLive && loser ? 'opacity-55' : 'opacity-100',
      ].join(' ')}
    >
      <span className="w-14 h-14 sm:w-16 sm:h-16 lg:w-[72px] lg:h-[72px] rounded-lg bg-surface-hi border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
        {side.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.logoUrl} alt={side.name} className="w-full h-full object-contain p-1.5" />
        ) : (
          <span className="font-display text-[26px] sm:text-[30px] lg:text-[34px] leading-none text-muted">
            {side.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <Link
        href={href}
        className={[
          'font-tight font-bold text-[16px] sm:text-[20px] lg:text-[22px] tracking-[-0.01em] text-ink text-center',
          align === 'right' ? 'sm:text-right' : 'sm:text-left',
          'truncate max-w-full hover:text-accent transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
        ].join(' ')}
      >
        {side.name}
      </Link>
    </div>
  );
}

// ─── Section: your teams — per-team dashboard cards (centerpiece) ─────────────
// Each favorite team gets one substantial card: identity header (logo + name +
// league tag + record), form pips (recent W/L momentum), a rank-context line
// (the standings-table replacement), a stat-tile strip (matches the UFA team
// page's PF/PA/Blk/TO grammar — bg-border+gap-px hairline grid), and a leaders
// block. Teams with none of these (USAU/WFDF) still render a complete card via
// record/standing/rankContext.

function TeamsSection({ teams }: { teams: TeamSnapshot[] }) {
  return (
    <section aria-label="Your teams">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-muted">
          Your teams
        </span>
      </div>
      {teams.length === 0 ? (
        <SoftEmpty text="No favorite teams yet — add some from Settings." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {teams.map((t) => (
            <TeamDashboardCard key={`${t.team.league}-${t.team.teamId}`} snapshot={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function TeamDashboardCard({ snapshot }: { snapshot: TeamSnapshot }) {
  const { team, record, rankContext, form, stats, leaders, roster, accolades } = snapshot;
  const href = resultHref({ kind: 'team', id: team.teamId, name: team.name, league: team.league, hint: null });
  const hasStats = stats.length > 0;
  const hasLeaders = leaders.length > 0;
  const hasForm = form.length > 0;
  const hasRoster = roster.length > 0;
  const hasAccolades = accolades.length > 0;
  const hasNothingElse =
    !hasStats && !hasLeaders && !hasForm && !record && !rankContext && !hasRoster && !hasAccolades;

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden flex flex-col">
      {/* Header row: identity + league tag + record */}
      <Link
        href={href}
        className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <SearchResultIcon
          result={{ kind: 'team', id: team.teamId, name: team.name, hint: null, league: team.league, logoUrl: team.logoUrl }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-tight font-bold text-[15px] text-ink truncate group-hover:text-accent transition-colors">
              {team.name}
            </span>
            <span className="shrink-0 text-[9px] font-bold tracking-[0.12em] uppercase font-tight text-faint">
              {LEAGUE_DISPLAY[team.league]}
            </span>
          </span>
          {record && (
            <span className="block font-mono text-[11px] text-muted tracking-[0.02em] tabular mt-0.5">
              {record}
            </span>
          )}
        </span>
        {hasForm && <FormPips form={form} />}
      </Link>

      {/* Rank context — the standings-table replacement, one readable line */}
      {rankContext && (
        <div className="px-4 py-2.5 border-t border-hairline bg-accent/[0.05]">
          <span className="text-[12px] font-tight font-semibold text-ink">{rankContext}</span>
        </div>
      )}

      {/* Accolades — notable finishes (USAU teams surface these in place of a season record) */}
      {hasAccolades && (
        <div className="px-4 py-3 border-t border-hairline">
          <div className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-2.5">
            Accolades
          </div>
          <div className="flex flex-wrap gap-2">
            {accolades.map((a, i) => (
              <AccoladeChip key={`${a.event}-${a.season}-${i}`} accolade={a} />
            ))}
          </div>
        </div>
      )}

      {/* Stat tiles — matches team page grammar: bg-border/gap-px hairline grid */}
      {hasStats && (
        <div
          className="grid gap-px bg-border border-t border-hairline"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((s) => (
            <StatTile key={s.label} stat={s} />
          ))}
        </div>
      )}

      {/* Leaders block — top players by category */}
      {hasLeaders && (
        <div className="px-4 py-3.5 border-t border-hairline">
          <div className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-2.5">
            Team leaders
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {leaders.map((l) => (
              <LeaderRow key={l.statLabel} leader={l} />
            ))}
          </div>
        </div>
      )}

      {/* Roster — full team list (USAU club/college); scrollable so it stays contained in the card */}
      {hasRoster && (
        <div className="px-4 py-3.5 border-t border-hairline">
          <div className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-2.5">
            Roster · {roster.length}
          </div>
          <ul className="max-h-[220px] overflow-y-auto pr-1 flex flex-col">
            {roster.map((p, i) => (
              <RosterRow key={p.playerId ?? `${p.name}-${i}`} player={p} league={team.league} />
            ))}
          </ul>
        </div>
      )}

      {/* No stats/leaders/form/record/rankContext/roster/accolades (WFDF): keep the card whole */}
      {hasNothingElse && (
        <div className="px-4 py-3 border-t border-hairline">
          <span className="text-[11.5px] text-faint font-tight">No season data yet.</span>
        </div>
      )}
    </div>
  );
}

/**
 * Recent-form pips — small W/L squares, most-recent last (reads left→right as
 * a timeline, ending "now"). A letter is always rendered inside each square so
 * the signal never relies on color alone.
 */
function FormPips({ form }: { form: Array<'W' | 'L'> }) {
  const ordered = [...form].reverse(); // form is most-recent-first; timeline reads oldest→newest
  return (
    <span className="hidden sm:inline-flex items-center gap-1 shrink-0" aria-label={`Recent form: ${ordered.join(', ')}`}>
      {ordered.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={[
            'inline-flex items-center justify-center w-[18px] h-[18px] rounded-[3px] text-[9px] font-bold font-mono',
            r === 'W' ? 'bg-accent text-accent-ink' : 'bg-surface-hi text-faint border border-border',
          ].join(' ')}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function StatTile({ stat }: { stat: TeamStat }) {
  return (
    <div className="bg-surface flex flex-col items-center justify-center px-2 py-3.5 gap-0.5">
      <div className="tabular text-[20px] font-bold font-display leading-none text-ink">{stat.value}</div>
      <div className="text-[9px] font-bold tracking-[0.14em] uppercase text-muted font-tight">{stat.label}</div>
    </div>
  );
}

function LeaderRow({ leader }: { leader: TeamLeader }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[9.5px] font-bold tracking-[0.12em] uppercase text-faint font-tight">
          {leader.statLabel}
        </span>
        <span className="block text-[13px] font-semibold text-ink font-tight truncate">
          {leader.name}
        </span>
      </span>
      <span className="font-display font-bold text-[16px] text-ink tabular flex-shrink-0">
        {leader.statValue}
      </span>
    </>
  );

  if (leader.playerId) {
    return (
      <Link
        href={`/players/${leader.playerId}?from=${leader.league}`}
        className="group flex items-center gap-2 rounded-md -mx-1.5 px-1.5 py-1 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {inner}
      </Link>
    );
  }
  return <div className="flex items-center gap-2 -mx-1.5 px-1.5 py-1">{inner}</div>;
}

/** A notable finish — placement ordinal + event name, medal finishes (1st–3rd) get an accent placement number. */
function AccoladeChip({ accolade }: { accolade: { placement: number; event: string; season: number } }) {
  const isMedal = accolade.placement <= 3;
  const yr = String(accolade.season).slice(-2);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-hi px-2.5 py-1 max-w-full">
      <span
        className={[
          'font-display font-bold text-[13px] leading-none tabular shrink-0',
          isMedal ? 'text-accent' : 'text-ink',
        ].join(' ')}
      >
        {ordinalStr(accolade.placement)}
      </span>
      <span className="text-[11px] text-muted font-tight truncate">{accolade.event}</span>
      <span className="text-[10px] text-faint font-mono shrink-0">&apos;{yr}</span>
    </span>
  );
}

/** One roster row — jersey slot + player name, linked to the profile when a playerId exists. */
function RosterRow({
  player,
  league,
}: {
  player: { playerId: string | null; name: string; jersey: string | null };
  league: FavoriteLeague;
}) {
  const jersey = (
    <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular text-faint">
      {player.jersey ? `#${player.jersey}` : ''}
    </span>
  );

  if (player.playerId) {
    return (
      <li className="border-b border-hairline last:border-b-0">
        <Link
          href={`/players/${player.playerId}?from=${league}`}
          className="group flex items-center gap-2.5 py-1.5 text-[13px] font-tight text-ink hover:text-accent cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm -mx-1 px-1"
        >
          {jersey}
          <span className="truncate">{player.name}</span>
        </Link>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-[13px] font-tight text-ink border-b border-hairline last:border-b-0">
      {jersey}
      <span className="truncate">{player.name}</span>
    </li>
  );
}

// ─── Section: your teams' remaining games (secondary strip) ───────────────────
// Compact tiles for everything not chosen as the hero — visually much lighter
// than the hero, a supporting strip rather than a second anchor.

function GamesSection({ games }: { games: FeedGame[] }) {
  return (
    <section aria-label="More games">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-muted">
          More games
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {games.map((g) => (
          <FeedGameTile key={g.id} game={g} />
        ))}
      </div>
    </section>
  );
}

function FeedGameTile({ game }: { game: FeedGame }) {
  const isLive = game.status === 'live';
  const isFinal = game.status === 'final';
  const status = isLive ? 'LIVE' : isFinal ? 'FINAL' : game.when.toUpperCase();

  const awayWin = isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score;
  const homeWin = isFinal && game.home.score !== null && game.away.score !== null && game.home.score > game.away.score;

  return (
    <div className="bg-surface border border-border px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex justify-between items-center font-mono text-[10.5px] text-muted tracking-[0.06em]">
        <span className="inline-flex items-center gap-1.5">
          {status}
          <span className="text-[8px] font-bold tracking-[0.1em] uppercase text-faint">
            · {LEAGUE_DISPLAY[game.league]}
          </span>
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'rgb(var(--live))' }}>
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ backgroundColor: 'rgb(var(--live))', boxShadow: '0 0 0 3px rgb(var(--live) / 0.2)' }}
            />
            LIVE
          </span>
        )}
      </div>
      <FeedTeamRow side={game.away} winner={awayWin} loser={homeWin} showScore={isFinal || isLive} league={game.league} />
      <FeedTeamRow side={game.home} winner={homeWin} loser={awayWin} showScore={isFinal || isLive} league={game.league} />
      <p className="mt-0.5 text-[10.5px] text-faint font-tight leading-snug truncate">
        Following {game.favoriteTeamName}
      </p>
    </div>
  );
}

function FeedTeamRow({
  side,
  winner,
  loser,
  showScore,
  league,
}: {
  side: FeedGame['home'];
  winner: boolean;
  loser: boolean;
  showScore: boolean;
  league: FavoriteLeague;
}) {
  return (
    <div className="flex items-center justify-between transition-opacity" style={{ opacity: loser ? 0.55 : 1 }}>
      <span className="inline-flex items-center gap-2 min-w-0">
        <SearchResultIcon
          result={{ kind: 'team', id: side.teamId, name: side.name, hint: null, league, logoUrl: side.logoUrl }}
        />
        <span className="font-tight font-bold text-[14px] text-ink tracking-[-0.01em] truncate">
          {side.name}
        </span>
      </span>
      <span className={['font-display font-bold text-[20px] tabular flex-shrink-0 ml-2', winner ? 'text-ink' : 'text-muted'].join(' ')}>
        {showScore && side.score !== null ? side.score : '–'}
      </span>
    </div>
  );
}

// ─── Section: tournaments (USAU favorite teams) ─────────────────────────────────
// USAU teams are event-based, so their "feed" is tournament entries — upcoming
// + played, current year. Each links to the event page. Grouped upcoming/past.

function TournamentsSection({ tournaments }: { tournaments: FeedTournament[] }) {
  const upcoming = tournaments.filter((t) => t.status === 'upcoming');
  const past = tournaments.filter((t) => t.status === 'past');
  return (
    <section aria-label="Your tournaments">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-muted">
          Tournaments
        </span>
      </div>
      <div className="flex flex-col gap-5">
        {upcoming.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
              Upcoming
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {upcoming.map((t) => (
                <TournamentRow key={t.id} tournament={t} />
              ))}
            </ul>
          </div>
        )}
        {past.length > 0 && (
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
              Results
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {past.map((t) => (
                <TournamentRow key={t.id} tournament={t} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function TournamentRow({ tournament: t }: { tournament: FeedTournament }) {
  const dateLabel = t.startDate
    ? new Date(t.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'TBD';
  const ord = t.placement != null ? ordinalStr(t.placement) : null;
  return (
    <li>
      <Link
        href={`/usau/events/${t.slug}`}
        className="group flex items-center gap-3 px-4 py-3 rounded-md border border-border bg-surface hover:border-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-ink font-tight truncate group-hover:text-accent transition-colors">
            {t.name}
          </span>
          <span className="block text-[10.5px] text-faint font-tight mt-0.5 truncate">
            {t.favoriteTeamName} · {dateLabel}
          </span>
        </span>
        {ord ? (
          <span className="shrink-0 font-display font-bold text-[15px] text-ink tabular">{ord}</span>
        ) : (
          <span className="shrink-0 text-[9px] font-bold tracking-[0.14em] uppercase text-accent font-tight">
            Upcoming
          </span>
        )}
      </Link>
    </li>
  );
}

function ordinalStr(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ─── Shared: soft per-section empty text ────────────────────────────────────────

function SoftEmpty({ text }: { text: string }) {
  return <p className="text-[12px] text-faint font-tight px-1 py-2">{text}</p>;
}
