// "Up next" cards — split per-league per Hunter's explicit request ("I want
// each league/subject to be separate"). Each league gets its own independent
// floating card (same shell: bg-surface rounded-card-lg shadow-card, italic
// display 22px title + neutral league pill top-right, hairline-separated
// rows) instead of one combined card with in-card league-pill dividers.
//
// Exports UpNextCards — a fragment of 0-2 cards (UFA, then USAU) — so
// page.tsx can drop it straight into a `grid grid-cols-1 lg:grid-cols-2`
// row as its own "Up next" section; each card renders only when it has
// data, same gating as before.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import type { UsauEventSummary } from '@/lib/usau/data';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import { TeamLogo } from '@/components/team-logo';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';

/** "FRI · 7:00 PM" — drops the date + timezone from formatStartCompact's
 *  "FRI, JUL 10 · 7:00 PM EDT" so the row's right column doesn't force the
 *  away/home abbr text to collapse to a single letter on narrow (390px)
 *  viewports. Falls back to the raw string (e.g. "TBD") if the expected
 *  "WD, MON D · TIME TZ" shape isn't there. */
function formatWhenCompact(game: UfaGame): string {
  const full = formatStartCompact(game);
  const match = full.match(/^(\w+),.*·\s*(\d{1,2}:\d{2}\s*[AP]M)/);
  return match ? `${match[1]} · ${match[2]}` : full;
}

interface UpNextCardsProps {
  ufaGames: UfaGame[];
  usauEvent: UsauEventSummary | null;
}

/** Renders the "Up next" card group: UFA card, then USAU card — each shown
 *  only when it has data. Returns null (no wrapper element) when neither has
 *  content, so page.tsx can drop this straight into the flex stack. */
export function UpNextCards({ ufaGames, usauEvent }: UpNextCardsProps) {
  const hasUfa = ufaGames.length > 0;
  const hasUsau = !!usauEvent;
  if (!hasUfa && !hasUsau) return null;

  return (
    <>
      {hasUfa && (
        <CardShell title="Up next" pill="UFA">
          {ufaGames.slice(0, 4).map((g, i) => (
            <UfaUpNextRow key={g.gameID} game={g} first={i === 0} />
          ))}
        </CardShell>
      )}
      {hasUsau && usauEvent && (
        <CardShell title="Up next" pill="USAU">
          <UsauUpNextRows event={usauEvent} />
        </CardShell>
      )}
    </>
  );
}

// ─── Shared card shell ────────────────────────────────────────────────────

function CardShell({ title, pill, children }: { title: string; pill: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-card-lg shadow-card px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="font-display italic font-bold text-[22px] leading-none tracking-[-0.01em] text-ink m-0">
          {title}
        </h3>
        <LeaguePill>{pill}</LeaguePill>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function LeaguePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-full bg-[rgb(var(--ink)/0.05)] text-ink/80 flex-shrink-0">
      {children}
    </span>
  );
}

// ─── UFA row ──────────────────────────────────────────────────────────────

function UfaUpNextRow({ game, first }: { game: UfaGame; first: boolean }) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const when = state.isLive ? 'LIVE' : formatWhenCompact(game).toUpperCase();

  return (
    <Link
      href={`/g/${game.gameID}`}
      className={[
        'grid grid-cols-[1fr_auto] gap-3 items-center py-[11px]',
        first ? '' : 'border-t border-hairline',
        'hover:opacity-80 transition-opacity',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <TeamLogo team={away} size={26} />
        </span>
        {/* Abbrs are always 2-4 chars — flex-shrink-0 so they're never the
            thing that collapses when the row is tight; the datetime column
            (right) and the "at" divider absorb the squeeze instead. */}
        <span className="font-sans font-bold text-[13.5px] text-ink flex-shrink-0">{away.abbr}</span>
        <span className="font-mono text-[11px] text-faint flex-shrink-0">at</span>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <TeamLogo team={home} size={26} />
        </span>
        <span className="font-sans font-bold text-[13.5px] text-ink flex-shrink-0">{home.abbr}</span>
      </div>
      <span
        className={[
          'font-mono text-[10.5px] flex-shrink-0 whitespace-nowrap',
          state.isLive ? 'text-accent font-bold' : 'text-muted',
        ].join(' ')}
      >
        {when}
      </span>
    </Link>
  );
}

// ─── USAU rows — up-next event's pool games, one per division, compact ───

const MAX_USAU_ROWS = 4;

type UsauGame = UsauEventSummary['games'][number];

/**
 * Picks the "up next" pool games to show, ensuring every gender division at the
 * event is represented (previously we just took the first 4 scored games, which
 * clustered in whichever division sorted first — usually Women's).
 *
 * Strategy:
 *   1. Keep pool-play games only (detect pools by BRACKET NAME, not round='pool'
 *      — the ultirzr ingest tags most pool games round='other').
 *   2. Group them by division. A game's division is its teams' — mixed events
 *      run separate Men's/Women's/Mixed pools, so both teams share one.
 *   3. Within each division, sort by "best seed involved" (lowest seed number =
 *      highest-ranked team), tie-broken by earliest scheduled time. This surfaces
 *      the marquee matchup for each division.
 *   4. Round-robin across divisions: take each division's top game first, then
 *      its second, and so on — so with 3 divisions and a 4-row budget every
 *      division gets one game and the strongest division gets a second.
 */
function selectUsauUpNextGames(
  games: UsauGame[],
  divByTeamId: Map<string, string | null>,
  seedByTeamId: Map<string, number | null>,
): UsauGame[] {
  const gameDiv = (g: UsauGame): string => {
    const a = g.teamAId ? divByTeamId.get(g.teamAId) : null;
    const b = g.teamBId ? divByTeamId.get(g.teamBId) : null;
    return a ?? b ?? 'Unknown';
  };

  // Lower seed number = higher-ranked team. Seed the game by its BEST team so a
  // #1-vs-#8 matchup outranks a #4-vs-#5 one. Missing seeds sort last.
  const bestSeed = (g: UsauGame): number => {
    const seeds: number[] = [];
    const sa = g.teamAId ? seedByTeamId.get(g.teamAId) : null;
    const sb = g.teamBId ? seedByTeamId.get(g.teamBId) : null;
    if (sa != null) seeds.push(sa);
    if (sb != null) seeds.push(sb);
    return seeds.length ? Math.min(...seeds) : Number.POSITIVE_INFINITY;
  };

  const scheduledMs = (g: UsauGame): number =>
    g.scheduledAt ? new Date(g.scheduledAt).getTime() : Number.POSITIVE_INFINITY;

  const poolGames = games.filter((g) =>
    (g.bracketName ?? '').toLowerCase().startsWith('pool'),
  );

  // Group by division.
  const byDiv = new Map<string, UsauGame[]>();
  for (const g of poolGames) {
    const d = gameDiv(g);
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(g);
  }

  // Sort each division's games: highest-seeded matchup first, then earliest.
  for (const list of byDiv.values()) {
    list.sort((a, b) => {
      const seedDiff = bestSeed(a) - bestSeed(b);
      if (seedDiff !== 0) return seedDiff;
      return scheduledMs(a) - scheduledMs(b);
    });
  }

  // Order divisions by their single best game, so the strongest division is the
  // one that gets a second row when the budget allows.
  const divisions = Array.from(byDiv.keys()).sort((da, db) => {
    const ga = byDiv.get(da)![0];
    const gb = byDiv.get(db)![0];
    const seedDiff = bestSeed(ga) - bestSeed(gb);
    if (seedDiff !== 0) return seedDiff;
    return scheduledMs(ga) - scheduledMs(gb);
  });

  // Round-robin: one game per division per pass until we hit the row budget.
  const picked: UsauGame[] = [];
  for (let round = 0; picked.length < MAX_USAU_ROWS; round++) {
    let addedThisRound = false;
    for (const d of divisions) {
      if (picked.length >= MAX_USAU_ROWS) break;
      const g = byDiv.get(d)![round];
      if (g) {
        picked.push(g);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break; // every division exhausted
  }

  return picked;
}

function UsauUpNextRows({ event }: { event: UsauEventSummary }) {
  // teamId → gender division, from the event's own teams. Used both to resolve
  // the correct logo per team AND to group games by division so every
  // division at the event gets representation (not just the one whose games
  // happen to sort first).
  const divByTeamId = new Map<string, string | null>();
  // teamId → seed, so we can rank games by how high-seeded their teams are.
  const seedByTeamId = new Map<string, number | null>();
  for (const t of event.teams) {
    divByTeamId.set(t.teamId, t.genderDivision);
    seedByTeamId.set(t.teamId, t.seed);
  }

  const poolGames = selectUsauUpNextGames(event.games, divByTeamId, seedByTeamId);

  return (
    <>
      {/* Event header row → event page */}
      <Link
        href={`/usau/events/${event.slug}`}
        className="flex items-center justify-between gap-3 py-[11px] hover:opacity-80 transition-opacity"
      >
        <span className="font-tight font-semibold text-[13.5px] text-ink truncate">{event.name}</span>
        <span className="font-mono text-[10.5px] text-faint flex-shrink-0">View →</span>
      </Link>

      {poolGames.map((g) => (
        <UsauPoolRow
          key={g.id}
          game={g}
          eventSlug={event.slug}
          divA={g.teamAId ? divByTeamId.get(g.teamAId) ?? null : null}
          divB={g.teamBId ? divByTeamId.get(g.teamBId) ?? null : null}
        />
      ))}
    </>
  );
}

function UsauPoolRow({
  game,
  eventSlug,
  divA,
  divB,
}: {
  game: UsauEventSummary['games'][number];
  eventSlug: string;
  divA: string | null;
  divB: string | null;
}) {
  const aName = game.teamAName ?? '?';
  const bName = game.teamBName ?? '?';
  const hasScore = game.scoreA !== null && game.scoreB !== null;

  return (
    <Link
      href={`/usau/events/${eventSlug}`}
      className="grid grid-cols-[1fr_auto] gap-3 items-center py-[11px] border-t border-hairline hover:opacity-80 transition-opacity"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <UsauTeamLogo name={aName} genderDivision={divA} size={22} />
        </span>
        <span className="font-tight font-semibold text-[13px] text-ink truncate">{aName}</span>
        <span className="font-mono text-[11px] text-faint flex-shrink-0">at</span>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <UsauTeamLogo name={bName} genderDivision={divB} size={22} />
        </span>
        <span className="font-tight font-semibold text-[13px] text-ink truncate">{bName}</span>
      </div>
      <span className="font-mono text-[10.5px] text-muted flex-shrink-0 tabular">
        {hasScore ? `${game.scoreA}–${game.scoreB}` : 'Pool play'}
      </span>
    </Link>
  );
}
