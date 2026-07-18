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
import { getMyFavorites, type FavoriteLeague, type MyFavorites } from '@/lib/favorites/data';
import { LEAGUE_DISPLAY } from '@/lib/for-you/leagues';
import {
  getForYouFeed,
  type FeedGame,
  type FeedLeague,
  type FeedPlayer,
  type FeedTournament,
  type ForYouFeed,
  type TeamLeader,
  type TeamSnapshot,
  type TeamStat,
} from '@/lib/for-you/live-data';
import { resultHref } from '@/lib/usau/search-nav';
import { SearchResultIcon } from '@/components/search-result-icon';

// ─── Main export ──────────────────────────────────────────────────────────────

const LIVE_YEAR = new Date().getFullYear();
/** How many past seasons to offer in the year filter. */
const YEAR_SPAN = 6;
const YEAR_OPTIONS = Array.from({ length: YEAR_SPAN }, (_, i) => LIVE_YEAR - i);

export function ForYouContent() {
  const [favorites, setFavorites] = useState<MyFavorites | null>(null);
  const [feed, setFeed] = useState<ForYouFeed | null>(null);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [year, setYear] = useState<number>(LIVE_YEAR);

  // Load favorites once. The feed re-fetches when `year` changes (below) — the
  // favorites read doesn't need to repeat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const favs = await getMyFavorites();
        if (cancelled) return;
        // The feed is team- + player-driven — a favorite league alone isn't
        // enough, but a favorite player (with no teams) IS.
        if (favs.teams.length === 0 && favs.players.length === 0) {
          setEmpty(true);
          setLoading(false);
          return;
        }
        setFavorites(favs);
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

  // Fetch the feed for the current favorites + selected year. Runs on first
  // favorites load and on every year change.
  useEffect(() => {
    if (!favorites) return;
    let cancelled = false;
    setFeedLoading(true);
    (async () => {
      try {
        const f = await getForYouFeed(favorites, { year });
        if (cancelled) return;
        setFeed(f);
        setLoadError(false);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFeedLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [favorites, year]);

  return (
    <PageShell wide title="For You" eyebrow="YOUR FEED" subtitle="Games, teams, and leagues you follow.">
      {loading && <LoadingState />}
      {!loading && loadError && <ErrorState />}
      {!loading && !loadError && empty && <EmptyState />}
      {!loading && !loadError && !empty && feed && (
        <Loaded feed={feed} year={year} onYearChange={setYear} feedLoading={feedLoading} />
      )}
    </PageShell>
  );
}

// ─── CRM dashboard layout — FIXED ZONES ─────────────────────────────────────
// The For You page is an all-in-one dashboard with DESIGNATED zones, not a
// dense auto-flow that reshuffles per data. Every content type has ONE home:
//
//   ┌─ HEADER BAND (full width) ────────────────────────┐
//   │  [ Player spotlight ]   [ Hero game ]             │  ← always the top row
//   ├─ MAIN (left, ~7/12) ──────────┬─ SIDE (right, 5/12)┤
//   │  Your teams (stacked)         │  Tournaments       │
//   │  Your other players           │  League standings  │
//   │  Games list                   │                    │
//   └───────────────────────────────┴────────────────────┘
//
// PROMOTE-TO-FILL: a zone renders only when it has content; when a whole side is
// empty the surviving side widens to full width and its cards go multi-column,
// so following just a league (or just a player) still fills the dashboard
// intentionally rather than leaving a half-empty grid.

function Loaded({
  feed,
  year,
  onYearChange,
  feedLoading,
}: {
  feed: ForYouFeed;
  year: number;
  onYearChange: (y: number) => void;
  feedLoading: boolean;
}) {
  const isPast = year < LIVE_YEAR;
  const [topPlayer, ...restPlayers] = feed.players;

  // ── HEADER BAND — spotlight player + hero game. Present when either exists. ──
  const hasSpotlight = !!topPlayer;
  const hasHero = !!feed.heroGame;
  const hasBand = hasSpotlight || hasHero;

  // ── MAIN zone content (teams, other players, games) ──
  const mainHasContent =
    feed.teams.length > 0 || restPlayers.length > 0 || feed.games.length > 0;

  // ── SIDE zone content (tournaments, league standings) ──
  const sideHasContent = feed.tournaments.length > 0 || feed.leagues.length > 0;

  // Promote-to-fill: if only one side has content, it takes the full width and
  // lays its cards out multi-column instead of a narrow single column.
  const onlyMain = mainHasContent && !sideHasContent;
  const onlySide = sideHasContent && !mainHasContent;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <YearFilter year={year} onChange={onYearChange} loading={feedLoading} />
      {isPast && (
        <p className="text-[12px] font-tight text-faint leading-snug">
          Showing your {year} season — placements, events, and player lines. Live games and
          upcoming schedules only appear for the current season.
        </p>
      )}

      {/* HEADER BAND */}
      {hasBand && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
          {hasSpotlight && (
            <div className={hasHero ? 'lg:col-span-5' : 'lg:col-span-12'}>
              <PlayerCard player={topPlayer} featured />
            </div>
          )}
          {hasHero && (
            <div className={hasSpotlight ? 'lg:col-span-7' : 'lg:col-span-12'}>
              <HeroGameCard game={feed.heroGame!} />
            </div>
          )}
        </div>
      )}

      {/* ZONE GRID — Main (left) + Side (right). Widths flip to full when a
          side is empty (promote-to-fill). */}
      {(mainHasContent || sideHasContent) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
          {/* MAIN */}
          {mainHasContent && (
            <div className={['flex flex-col gap-4 lg:gap-5', onlyMain ? 'lg:col-span-12' : 'lg:col-span-7'].join(' ')}>
              <MainZone teams={feed.teams} players={restPlayers} games={feed.games} wide={onlyMain} />
            </div>
          )}

          {/* SIDE */}
          {sideHasContent && (
            <div className={['flex flex-col gap-4 lg:gap-5', onlySide ? 'lg:col-span-12' : 'lg:col-span-5'].join(' ')}>
              <SideZone tournaments={feed.tournaments} leagues={feed.leagues} wide={onlySide} />
            </div>
          )}
        </div>
      )}

      {isPast && feed.players.length === 0 && feed.tournaments.length === 0 && (
        <SoftEmpty text={`No ${year} history for your favorites yet.`} />
      )}
    </div>
  );
}

// MAIN zone: teams (stacked dashboard cards) → your other players → games list.
// `wide` = promoted to full width (only-main case) → lay teams/players 2-up.
function MainZone({
  teams,
  players,
  games,
  wide,
}: {
  teams: TeamSnapshot[];
  players: FeedPlayer[];
  games: FeedGame[];
  wide: boolean;
}) {
  const gridCols = wide ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1';
  return (
    <>
      {teams.length > 0 && (
        <ZoneGroup label="Your teams">
          <div className={`grid ${gridCols} gap-4 lg:gap-5`}>
            {teams.map((t) => (
              <TeamDashboardCard key={`${t.team.league}-${t.team.teamId}`} snapshot={t} />
            ))}
          </div>
        </ZoneGroup>
      )}

      {players.length > 0 && (
        <ZoneGroup label="Your players">
          <div className={`grid ${wide ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} gap-4`}>
            {players.map((p) => (
              <PlayerCard key={`${p.league}-${p.playerId}`} player={p} />
            ))}
          </div>
        </ZoneGroup>
      )}

      {games.length > 0 && (
        <ZoneGroup label="More games">
          <div className={`grid ${wide ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-4 lg:gap-5`}>
            <GamesTile games={games} />
          </div>
        </ZoneGroup>
      )}
    </>
  );
}

// SIDE zone: tournaments → league standings. `wide` = promoted to full width
// (only-side case) → lay the cards multi-column.
function SideZone({
  tournaments,
  leagues,
  wide,
}: {
  tournaments: FeedTournament[];
  leagues: FeedLeague[];
  wide: boolean;
}) {
  return (
    <>
      {tournaments.length > 0 && (
        <ZoneGroup label="Tournaments">
          <TournamentsTile tournaments={tournaments} />
        </ZoneGroup>
      )}

      {leagues.length > 0 && (
        <ZoneGroup label="Leagues you follow">
          <div className={`grid ${wide ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-4`}>
            {leagues.map((lg, i) => (
              <LeagueCard key={`${lg.league}-${lg.scope ?? i}`} card={lg} />
            ))}
          </div>
        </ZoneGroup>
      )}
    </>
  );
}

// A labeled zone group — a small uppercase header above its cards, so each
// designated region reads as a titled section of the dashboard.
function ZoneGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-sans text-[10px] font-bold tracking-[0.18em] uppercase text-muted">
          {label}
        </span>
      </div>
      {children}
    </section>
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
      className="px-4 py-3 rounded-card-sm bg-live/[0.08]"
    >
      <span className="font-tight text-[13px] text-ink">
        Couldn&apos;t load your favorites. Please refresh and try again.
      </span>
    </div>
  );
}

// ─── Year filter — "go back in time" across the whole feed ─────────────────────
// A horizontal segmented control of recent seasons. Current year (default) is
// the live feed; a past year is a history lens (USAU placements/events + player
// season lines). A subtle spinner shows while the feed re-fetches for a new year.

function YearFilter({
  year,
  onChange,
  loading,
}: {
  year: number;
  onChange: (y: number) => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight shrink-0">
        Season
      </span>
      <div
        role="tablist"
        aria-label="Filter feed by season"
        className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1"
      >
        {YEAR_OPTIONS.map((y) => {
          const active = y === year;
          return (
            <button
              key={y}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(y)}
              className={[
                'shrink-0 px-3.5 py-2 min-h-[36px] rounded-full text-[12px] font-bold font-tight tabular cursor-pointer',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active ? 'bg-ink text-bg' : 'text-muted hover:text-ink hover:bg-ink/[0.05]',
              ].join(' ')}
            >
              {y}
            </button>
          );
        })}
      </div>
      {loading && (
        <span
          className="shrink-0 w-3.5 h-3.5 rounded-full border-2 border-ink/15 border-t-accent animate-spin"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-5 rounded-card-lg bg-surface shadow-card">
      <h2 className="m-0 font-display italic text-[22px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
        Nothing here yet.
      </h2>
      <p className="max-w-[420px] text-[13px] text-muted font-tight leading-snug">
        Your favorite teams and leagues power this page. Add a few and we&apos;ll bring their games
        and standings here for you.
      </p>
      <Link
        href="/settings"
        className={[
          'mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full cursor-pointer min-h-[44px]',
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
    <section aria-label="Your next game" className="h-full">
      <div
        className={[
          'relative h-full overflow-hidden rounded-card-xl bg-surface shadow-hero',
          isLive ? 'ring-1 ring-inset ring-live/35' : '',
        ].join(' ')}
      >
        {/* Faint accent wash so the hero reads as a distinct tier, not just a bigger tile. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.06] to-transparent"
        />

        <div className="relative h-full px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10 flex flex-col justify-center gap-6 lg:gap-8">
          {/* Meta row: status + league */}
          <div className="flex items-center justify-center gap-2.5 font-mono text-[11px] sm:text-[12px] tracking-[0.1em] text-muted">
            {isLive ? (
              <span className="inline-flex items-center gap-2 font-bold text-live">
                <span className="w-2 h-2 rounded-full bg-live shadow-[0_0_0_4px_rgb(var(--live)/0.2)]" />
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

          {/* Players to watch — expanded detail for an upcoming game. Two columns
              (away | home) each listing that team's top season performers. */}
          {isUpcoming && game.playersToWatch &&
            (game.playersToWatch.away.length > 0 || game.playersToWatch.home.length > 0) && (
              <div className="border-t border-hairline pt-5 sm:pt-6">
                <div className="text-center text-[9px] sm:text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-4">
                  Players to Watch
                </div>
                <div className="grid grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-3">
                  <div className="flex flex-col gap-2.5">
                    {game.playersToWatch.away.map((p, i) => (
                      <HeroWatchPlayerRow key={i} player={p} align="right" />
                    ))}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {game.playersToWatch.home.map((p, i) => (
                      <HeroWatchPlayerRow key={i} player={p} align="left" />
                    ))}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </section>
  );
}

/** One "player to watch" row on the expanded hero card. `align` mirrors the row
 *  toward its team's side of the matchup (away = right, home = left). */
function HeroWatchPlayerRow({
  player,
  align,
}: {
  player: NonNullable<FeedGame['playersToWatch']>['away'][number];
  align: 'left' | 'right';
}) {
  const avatar = (
    <span className="shrink-0 inline-flex w-8 h-8 rounded-full overflow-hidden bg-ink/[0.06] items-center justify-center">
      {player.headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.headshotUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[9px] font-bold text-faint font-tight">
          {player.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
        </span>
      )}
    </span>
  );
  const text = (
    <span className={['min-w-0 flex flex-col leading-tight', align === 'right' ? 'items-end text-right' : 'items-start'].join(' ')}>
      <span className="text-[11.5px] sm:text-[12.5px] font-semibold text-ink font-tight truncate max-w-full">
        {player.name}
      </span>
      <span className="text-[9.5px] sm:text-[10px] text-faint font-mono truncate max-w-full">
        {player.statLine}
      </span>
    </span>
  );
  const inner = align === 'right' ? (<>{text}{avatar}</>) : (<>{avatar}{text}</>);
  const cls = ['flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity no-underline', align === 'right' ? 'justify-end' : 'justify-start'].join(' ');
  return player.href
    ? <Link href={player.href} className={cls}>{inner}</Link>
    : <span className={cls}>{inner}</span>;
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
      <span className="w-14 h-14 sm:w-16 sm:h-16 lg:w-[72px] lg:h-[72px] rounded-full bg-surface-hi shadow-soft overflow-hidden flex items-center justify-center flex-shrink-0">
        {side.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={side.logoUrl} alt={side.name} className="w-full h-full object-contain p-2" />
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
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full',
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

// ─── Section: your players — 2K-style player cards ─────────────────────────────
// A favorite player renders as a card with their headshot (UFA only; monogram
// fallback elsewhere) in the corner, current-season stat tiles, and a link to
// their full cross-league profile. Pro leagues carry a G/A/Blk/+- line; USAU
// carries events-played; WFDF is a link-out.

function playerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// The 2K player card. `featured` = the top-right anchor tile: a bigger portrait,
// an accent identity band, and larger stat tiles. Non-featured = a compact tile
// that packs into the bento alongside teams/games.
function PlayerCard({ player, featured = false }: { player: FeedPlayer; featured?: boolean }) {
  const { name, teamName, league, headshotUrl, stats, contextLine, href } = player;

  const portrait = (
    <span
      className={[
        'shrink-0 rounded-full overflow-hidden bg-ink/5 flex items-center justify-center ring-1 ring-hairline',
        featured ? 'w-20 h-20' : 'w-14 h-14',
      ].join(' ')}
    >
      {headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headshotUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span
          className={[
            'font-display italic font-bold text-muted',
            featured ? 'text-[26px]' : 'text-[18px]',
          ].join(' ')}
          aria-hidden="true"
        >
          {playerInitials(name)}
        </span>
      )}
    </span>
  );

  return (
    <Link
      href={href}
      className={[
        'group relative block h-full bg-surface rounded-card overflow-hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset cursor-pointer',
        featured ? 'shadow-hero hover:shadow-hero' : 'shadow-card hover:shadow-lift transition-shadow',
      ].join(' ')}
    >
      {/* Accent wash — heavier on the featured anchor so it reads as the star. */}
      <div
        aria-hidden="true"
        className={[
          'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent',
          featured ? 'from-accent/[0.1]' : 'from-accent/[0.05]',
        ].join(' ')}
      />

      {featured && (
        <div className="relative px-6 pt-4 pb-0">
          <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            Player spotlight
          </span>
        </div>
      )}

      <div
        className={[
          'relative flex items-start gap-3.5',
          featured ? 'px-6 pt-3 pb-4' : 'px-5 pt-5 pb-4',
        ].join(' ')}
      >
        {portrait}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={[
                'font-tight font-bold leading-tight text-ink truncate group-hover:text-accent transition-colors',
                featured ? 'text-[20px]' : 'text-[16px]',
              ].join(' ')}
            >
              {name}
            </span>
            <span className="shrink-0 text-[9px] font-bold tracking-[0.12em] uppercase font-tight text-faint">
              {LEAGUE_DISPLAY[league]}
            </span>
          </span>
          {teamName && (
            <span className={['block font-medium text-muted font-tight truncate mt-0.5', featured ? 'text-[13px]' : 'text-[12px]'].join(' ')}>
              {teamName}
            </span>
          )}
          {contextLine && (
            <span className="block text-[10.5px] font-medium text-faint font-tight truncate mt-1">
              {contextLine}
            </span>
          )}
        </span>
      </div>

      {/* Season stat tiles */}
      {stats.length > 0 && (
        <div className={['relative pt-1', featured ? 'px-6' : 'px-5 pb-5'].join(' ')}>
          {featured && (player.recentGames?.length ?? 0) > 0 && (
            <div className="text-[8.5px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-1.5">
              Season
            </div>
          )}
          <div className={['grid gap-2', stats.length >= 4 ? 'grid-cols-4' : 'grid-cols-2'].join(' ')}>
            {stats.map((s) => (
              <div
                key={s.label}
                className={['flex flex-col items-center justify-center rounded-card-sm bg-bg', featured ? 'py-3' : 'py-2'].join(' ')}
              >
                <span className={['font-display font-bold leading-none text-ink tabular', featured ? 'text-[26px]' : 'text-[20px]'].join(' ')}>
                  {s.value}
                </span>
                <span className="mt-1 text-[8.5px] font-bold tracking-[0.1em] uppercase font-tight text-faint">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last-N games — spotlight (featured) card only. A compact per-game row:
          date + opponent + result/score on the left, box-stat chips on the right. */}
      {featured && (player.recentGames?.length ?? 0) > 0 && (
        <div className="relative px-6 pt-4 pb-6">
          <div className="text-[8.5px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-2">
            Last {player.recentGames!.length} games
          </div>
          <div className="flex flex-col divide-y divide-hairline rounded-card-sm bg-bg overflow-hidden">
            {player.recentGames!.map((g, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                {/* Result pill + opponent logo + "vs Name" on one row, date/score below.
                    Flexible width (min-w-0 + flex-1 basis) so the stat row never wraps. */}
                <span className="min-w-0 flex-1 flex items-center gap-2">
                  {g.result && (
                    <span
                      className={[
                        'shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-[4px] text-[9px] font-bold font-mono',
                        g.result === 'W' ? 'bg-accent text-accent-ink' : 'bg-ink/[0.08] text-faint',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {g.result}
                    </span>
                  )}
                  {g.opponentLogoUrl && (
                    <span className="shrink-0 inline-flex w-5 h-5 rounded-full overflow-hidden bg-white items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.opponentLogoUrl} alt="" className="w-full h-full object-contain p-0.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold text-ink font-tight truncate">
                      {g.opponent ? `vs ${g.opponent}` : '—'}
                    </span>
                    <span className="text-[9.5px] text-faint font-mono truncate">
                      {[g.dateLabel, g.score].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </span>
                {/* Stat chips — NEVER wrap (was dropping YDS to a second line). */}
                <span className="shrink-0 flex items-baseline justify-end gap-2.5 flex-nowrap">
                  {g.stats.map((s) => (
                    <span key={s.label} className="inline-flex items-baseline gap-0.5">
                      <span className="font-display font-bold text-[13px] text-ink tabular leading-none">
                        {s.value}
                      </span>
                      <span className="text-[8px] font-bold tracking-[0.06em] uppercase text-faint font-tight">
                        {s.label}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}

// ─── League card — top-of-the-league tile ──────────────────────────────────────
// One card per favorited league (following a league, not just a team, surfaces
// the top of its standings/rankings). UFA is multi-division → several cards.

function LeagueCard({ card }: { card: FeedLeague }) {
  return (
    <div className="h-full bg-surface rounded-card shadow-card overflow-hidden flex flex-col">
      <Link
        href={card.href}
        className="group flex items-baseline justify-between gap-2 px-5 py-3.5 border-b border-hairline hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset cursor-pointer"
      >
        <span className="min-w-0">
          <span className="block font-tight font-bold text-[13px] text-ink group-hover:text-accent transition-colors">
            {card.label}
          </span>
          {card.scope && (
            <span className="block text-[10px] font-semibold tracking-[0.04em] uppercase font-tight text-faint mt-0.5 truncate">
              {card.scope}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[9px] font-bold tracking-[0.12em] uppercase font-tight text-faint">
          See all →
        </span>
      </Link>

      <ol className="flex flex-col">
        {card.rows.map((r) => (
          <li
            key={`${r.rank}-${r.teamId ?? r.name}`}
            className="flex items-center gap-3 px-5 py-2.5 border-b border-hairline last:border-b-0"
          >
            <span className="shrink-0 w-5 text-center font-display font-bold text-[13px] text-faint tabular">
              {r.rank}
            </span>
            {r.logoUrl ? (
              <SearchResultIcon
                result={{ kind: 'team', id: r.teamId ?? '', name: r.name, hint: null, league: card.league, logoUrl: r.logoUrl }}
              />
            ) : (
              <span className="shrink-0 w-7 h-7 rounded-md bg-ink/5 flex items-center justify-center text-[9px] font-bold text-faint font-tight" aria-hidden="true">
                {card.league === 'wfdf' ? '◈' : r.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="flex-1 min-w-0 font-tight font-semibold text-[13px] text-ink truncate">
              {r.name}
            </span>
            {r.detail && (
              <span className="shrink-0 font-tight text-[11px] font-semibold text-muted tabular">
                {r.detail}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Team dashboard card — a bento tile ─────────────────────────────────────────
// Each favorite team: identity header (logo + name + league tag + record), form
// pips, a rank-context line, a stat-tile strip, and a leaders/roster block.
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
    <div className="h-full bg-surface rounded-card shadow-card hover:shadow-lift transition-shadow overflow-hidden flex flex-col">
      {/* Header row: identity + league tag + record */}
      <Link
        href={href}
        className="group flex items-center gap-3 px-5 py-3.5 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset cursor-pointer"
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
        <div className="px-5 py-2.5 border-t border-hairline bg-accent/[0.05]">
          <span className="text-[12px] font-tight font-semibold text-ink">{rankContext}</span>
        </div>
      )}

      {/* Accolades — notable finishes (USAU teams surface these in place of a season record) */}
      {hasAccolades && (
        <div className="px-5 py-3 border-t border-hairline">
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

      {/* Stat tiles — matches team page grammar: bg-hairline/gap-px hairline grid */}
      {hasStats && (
        <div
          className="grid gap-px bg-hairline border-t border-hairline"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((s) => (
            <StatTile key={s.label} stat={s} />
          ))}
        </div>
      )}

      {/* Leaders block — top players by category */}
      {hasLeaders && (
        <div className="px-5 py-3.5 border-t border-hairline">
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
        <div className="px-5 py-3.5 border-t border-hairline">
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
        <div className="px-5 py-3 border-t border-hairline">
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
            'inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px] text-[9px] font-bold font-mono',
            r === 'W' ? 'bg-accent text-accent-ink' : 'bg-ink/[0.08] text-faint',
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
        className="group flex items-center gap-2 rounded-card-sm -mx-1.5 px-1.5 py-1 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 max-w-full">
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

// A bento tile: a titled card holding the "more games" list stacked inside it.
function GamesTile({ games }: { games: FeedGame[] }) {
  // Header comes from the enclosing ZoneGroup ("More games"), so the tile is
  // just the stacked list.
  return (
    <div className="h-full bg-surface rounded-card shadow-card overflow-hidden flex flex-col">
      <div className="flex flex-col">
        {games.map((g, i) => (
          <div key={g.id} className={i > 0 ? 'border-t border-hairline' : ''}>
            <FeedGameTile game={g} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedGameTile({ game }: { game: FeedGame }) {
  const isLive = game.status === 'live';
  const isFinal = game.status === 'final';
  const status = isLive ? 'LIVE' : isFinal ? 'FINAL' : game.when.toUpperCase();

  const awayWin = isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score;
  const homeWin = isFinal && game.home.score !== null && game.away.score !== null && game.home.score > game.away.score;

  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      <div className="flex justify-between items-center font-mono text-[10.5px] text-muted tracking-[0.06em]">
        <span className="inline-flex items-center gap-1.5">
          {status}
          <span className="text-[8px] font-bold tracking-[0.1em] uppercase text-faint">
            · {LEAGUE_DISPLAY[game.league]}
          </span>
        </span>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 font-bold text-live">
            <span className="w-[7px] h-[7px] rounded-full bg-live shadow-[0_0_0_3px_rgb(var(--live)/0.2)]" />
            LIVE
          </span>
        )}
      </div>
      <FeedTeamRow side={game.away} winner={awayWin} loser={homeWin} showScore={isFinal || isLive} league={game.league} />
      <FeedTeamRow side={game.home} winner={homeWin} loser={awayWin} showScore={isFinal || isLive} league={game.league} />
      <p className="text-[10.5px] text-faint font-tight leading-snug truncate">
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
    <div className={['flex items-center justify-between transition-opacity', loser ? 'opacity-55' : 'opacity-100'].join(' ')}>
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

// A bento tile: a titled card grouping the favorite USAU teams' tournaments
// (upcoming then results) as a stacked list.
function TournamentsTile({ tournaments }: { tournaments: FeedTournament[] }) {
  const upcoming = tournaments.filter((t) => t.status === 'upcoming');
  const past = tournaments.filter((t) => t.status === 'past');
  // Header comes from the enclosing ZoneGroup ("Tournaments").
  return (
    <div className="h-full bg-surface rounded-card shadow-card overflow-hidden flex flex-col">
      <div className="flex flex-col pt-1">
        {upcoming.length > 0 && (
          <>
            <SubLabel text="Upcoming" />
            <ul className="flex flex-col">
              {upcoming.map((t) => (
                <TournamentRow key={t.id} tournament={t} />
              ))}
            </ul>
          </>
        )}
        {past.length > 0 && (
          <>
            <SubLabel text="Results" />
            <ul className="flex flex-col">
              {past.map((t) => (
                <TournamentRow key={t.id} tournament={t} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function SubLabel({ text }: { text: string }) {
  return (
    <div className="px-5 pt-3 pb-1 text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
      {text}
    </div>
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
        className="group flex items-center gap-3 px-5 py-2.5 hover:bg-surface-hi transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset border-t border-hairline first:border-t-0"
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
