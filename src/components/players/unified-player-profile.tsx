// Unified UFA + USAU player profile.
//
// One name, one career, both leagues — each year's row can show a UFA
// team AND a USAU team side-by-side. Each stint has its own nested
// dropdown (UFA → per-game log; USAU → list of events played).
//
// The page intentionally has NO league switcher in the top nav. A player
// is one human; we don't ask the user "which league are you looking at"
// inside their profile. The switcher belongs on list/feed pages.

import Link from 'next/link';
import type {
  PulSeasonStint,
  WulSeasonStint,
  SeasonStint,
  UfaSeasonStint,
  UnifiedPlayerProfile,
  UnifiedYear,
  UsauSeasonStint,
  WfdfSeasonStint,
} from '@/lib/unified-player';
import { teamMetaByAbbr } from '@/lib/ufa/teams';
import { PageShell } from '@/components/page-shell';
import { TeamLogo } from '@/components/team-logo';
import { ChampionBanner } from '@/components/usau/usau-player-profile';
import { WfdfFlag } from '@/components/wfdf/wfdf-flag';
import type { UfaPlayerGameRow } from '@/lib/ufa/types';
import type { PulPlayerGameRow } from '@/lib/pul/data';
import type { WulPlayerGameRow } from '@/lib/wul/data';
import { PlayerContentGallery } from '@/components/players/player-content-gallery';
import { PlayerHeadshot } from '@/components/players/player-headshot';
import type { PlayerContentItem } from '@/lib/player-content/types';
import { UsauTeamLogo } from '@/components/usau/usau-team-logo';
import { usauEventHref } from '@/lib/usau/event-href';

interface Props {
  profile: UnifiedPlayerProfile;
  content: PlayerContentItem[];
  // Which league the user navigated from (via ?from=), so "< Players" returns
  // them there. Undefined → root /players (UFA). See PLAYERS_LIST_HREF.
  fromLeague?: string;
}

// Map an originating-league code to its players-list URL. UFA is the root app,
// so it (and any unknown value) falls back to /players. All non-UFA leagues use
// the shared /players page with a ?league= filter.
const PLAYERS_LIST_HREF: Record<string, string> = {
  ufa: '/players',
  usau: '/players?league=usau',
  pul: '/players?league=pul',
  wul: '/players?league=wul',
  wfdf: '/wfdf/players',
};

export function UnifiedProfile({ profile, content, fromLeague }: Props) {
  const { career, years } = profile;
  const eyebrow = buildEyebrow(profile);

  // Hide the league switcher entirely on player profiles — we pass an
  // empty fragment so the default tabs don't render. (PageShell's default
  // topNavSlot kicks in only when undefined; an explicit empty element
  // wins.)
  const topNavSlot = <span aria-hidden="true" />;

  const playersHref =
    (fromLeague && PLAYERS_LIST_HREF[fromLeague]) || '/players';
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Players', href: playersHref },
    { label: profile.displayName },
  ];

  return (
    <PageShell
      title={profile.displayName}
      stickyName={profile.displayName}
      eyebrow={eyebrow}
      topNavSlot={topNavSlot}
      breadcrumbs={crumbs}
    >
      {/* Profile header avatar — UFA headshot when available, else initials
          monogram. Sits directly under the name (PageShell's <h1>) so the
          page reads as "this player's" profile at a glance. */}
      <div className="h-[72px] w-[72px] lg:h-[88px] lg:w-[88px] flex-shrink-0 rounded-full shadow-card overflow-hidden mb-6 -mt-1 lg:-mt-2">
        <PlayerHeadshot headshotUrl={profile.headshotUrl} displayName={profile.displayName} />
      </div>

      {/* Championship banners — one per league when applicable. */}
      {profile.championYearsUsau.length > 0 && (
        <ChampionBanner years={profile.championYearsUsau} label="USAU National Champion" />
      )}
      {profile.championYearsUfa.length > 0 && (
        <ChampionBanner years={profile.championYearsUfa} label="UFA Champion" />
      )}

      {/* Career totals — UFA + USAU combined */}
      {(career.ufaGamesPlayed > 0 || career.usauEventsPlayed > 0) && (
        <section className="mb-6" aria-labelledby="career-heading">
          <h2
            id="career-heading"
            className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-4"
          >
            Career totals
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 bg-surface rounded-card-lg shadow-card overflow-hidden">
            <CareerStat
              label={career.ufaGamesPlayed > 0 ? 'UFA Games' : 'Events'}
              value={career.ufaGamesPlayed > 0 ? career.ufaGamesPlayed : career.usauEventsPlayed}
            />
            <CareerStat label="Goals" value={career.goals} />
            <CareerStat label="Assists" value={career.assists} />
            <CareerStat label="Scores" value={career.goals + career.assists} />
            {career.plusMinus !== 0 && <CareerStat label="+/−" value={signed(career.plusMinus)} />}
            {career.throwsAttempted > 0 && (
              <CareerStat
                label="Cmp%"
                value={`${((career.completions / career.throwsAttempted) * 100).toFixed(1)}%`}
              />
            )}
            {career.blocks > 0 && <CareerStat label="Blocks" value={career.blocks} />}
          </div>
        </section>
      )}

      {/* PUL career sub-block — separate from UFA/USAU to avoid double-counting */}
      {profile.pul && (
        <section className="mb-10" aria-labelledby="pul-career-heading">
          <h2
            id="pul-career-heading"
            className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-4"
          >
            PUL career
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 bg-surface rounded-card-lg shadow-card overflow-hidden">
            <CareerStat label="Seasons" value={profile.pul.seasonsPlayed} />
            <CareerStat label="GP" value={profile.pul.gamesPlayed} />
            <CareerStat label="Goals" value={profile.pul.goals} />
            <CareerStat label="Assists" value={profile.pul.assists} />
            <CareerStat label="Scores" value={profile.pul.goals + profile.pul.assists} />
            <CareerStat label="Blocks" value={profile.pul.blocks} />
            <CareerStat label="+/−" value={signed(profile.pul.plusMinus)} />
          </div>
        </section>
      )}

      {/* WUL career sub-block — same separation rationale as PUL */}
      {profile.wul && (
        <section className="mb-10" aria-labelledby="wul-career-heading">
          <h2
            id="wul-career-heading"
            className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-4"
          >
            WUL career
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 bg-surface rounded-card-lg shadow-card overflow-hidden">
            <CareerStat label="Seasons" value={profile.wul.seasonsPlayed} />
            <CareerStat label="GP" value={profile.wul.gamesPlayed} />
            <CareerStat label="Goals" value={profile.wul.goals} />
            <CareerStat label="Assists" value={profile.wul.assists} />
            <CareerStat label="Scores" value={profile.wul.goals + profile.wul.assists} />
            <CareerStat label="Blocks" value={profile.wul.blocks} />
            <CareerStat label="+/−" value={signed(profile.wul.plusMinus)} />
          </div>
        </section>
      )}

      {/* Fallback: show a basic career block if player has no UFA/USAU data AND
          neither PUL nor WUL have their own blocks (which would already show above).
          A WUL-only or PUL-only player gets their league-specific block above, so
          this fallback only fires for the rare case with only UFA/USAU stints that
          didn't produce career totals (edge case), or a truly data-empty profile. */}
      {!profile.pul && !profile.wul && career.ufaGamesPlayed === 0 && career.usauEventsPlayed === 0 && (
        <section className="mb-10" aria-labelledby="career-heading">
          <h2
            id="career-heading"
            className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-4"
          >
            Career totals
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 bg-surface rounded-card-lg shadow-card overflow-hidden">
            <CareerStat label="Goals" value={career.goals} />
            <CareerStat label="Assists" value={career.assists} />
            <CareerStat label="Blocks" value={career.blocks} />
          </div>
        </section>
      )}

      {/* Year-by-year list */}
      {years.length > 0 && (
        <section aria-labelledby="seasons-heading">
          <div className="flex items-end justify-between gap-4 mb-4">
            <h2
              id="seasons-heading"
              className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans m-0"
            >
              Season by Season
            </h2>
            <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-faint">
              Tap a year to expand
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {years.map((y) => (
              <YearGroup key={y.year} year={y} />
            ))}
          </div>
        </section>
      )}

      {/* PlayerContentGallery only supports 'ufa' | 'usau' refs today.
          PUL and WUL players anchored by a UUID have no content rows yet —
          map both to 'usau' so the gallery renders (empty) without a type
          error. Extend PlayerKind to 'pul'/'wul' when content support ships. */}
      <PlayerContentGallery
        playerKind={
          profile.anchorLeague === 'pul' || profile.anchorLeague === 'wul'
            ? 'usau'
            : profile.anchorLeague
        }
        playerRef={profile.anchorId}
        playerDisplayName={profile.displayName}
        items={content}
      />
    </PageShell>
  );
}

// ── Eyebrow / hero helpers ──────────────────────────────────────────────

function buildEyebrow(profile: UnifiedPlayerProfile): string {
  const hasUfa = profile.years.some((y) => y.stints.some(isUfa));
  const hasUsau = profile.years.some((y) => y.stints.some(isUsau));
  const hasPul = profile.pul !== null;
  const hasWul = profile.wul !== null;
  const parts: string[] = [];
  if (hasUfa) parts.push('UFA');
  if (hasUsau) parts.push('USAU');
  if (hasPul) parts.push('PUL');
  if (hasWul) parts.push('WUL');
  if (parts.length === 0) return 'Career';
  return `${parts.join(' + ')} · Career`;
}

// ── Year accordion ──────────────────────────────────────────────────────

function YearGroup({ year }: { year: UnifiedYear }) {
  return (
    <div className="bg-surface rounded-card shadow-card overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-hairline">
        <span className="tabular font-display italic text-[17px] font-bold text-ink w-[60px] flex-shrink-0">
          {year.year}
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
          {year.stints.length} {year.stints.length === 1 ? 'team' : 'teams'}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-hairline">
        {year.stints.map((stint, i) => (
          <StintRow key={`${stint.league}-${stint.teamId}-${i}`} stint={stint} />
        ))}
      </div>
    </div>
  );
}

function StintRow({ stint }: { stint: SeasonStint }) {
  if (stint.league === 'ufa') return <UfaStintRow stint={stint} />;
  if (stint.league === 'usau') return <UsauStintRow stint={stint} />;
  if (stint.league === 'pul') return <PulStintRow stint={stint} />;
  if (stint.league === 'wul') return <WulStintRow stint={stint} />;
  if (stint.league === 'wfdf') return <WfdfStintRow stint={stint} />;
  // Exhaustive guard — new league union members should add a branch above.
  return null;
}

// ── UFA stint ───────────────────────────────────────────────────────────

function UfaStintRow({ stint }: { stint: UfaSeasonStint }) {
  const cmpPct = stint.totals.throwsAttempted
    ? (stint.totals.completions / stint.totals.throwsAttempted) * 100
    : 0;
  const huckPct = stint.totals.hucksAttempted
    ? (stint.totals.hucksCompleted / stint.totals.hucksAttempted) * 100
    : 0;
  return (
    <details className="group [&[open]>summary]:bg-surface-hi">
      <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-3 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
        <Caret />
        <Link
          href={`/teams/${stint.teamMeta.id}`}
          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
        >
          <TeamLogo team={stint.teamMeta} size={26} />
          <span className="flex flex-col min-w-0">
            <span className="text-[14px] font-bold font-tight text-ink truncate leading-tight">
              {stint.teamMeta.city} {stint.teamMeta.name}
            </span>
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              UFA
              {stint.isChampion && ' · Champion'}
            </span>
          </span>
        </Link>
        {stint.isChampion && <TrophyBadge title="UFA Champion" />}
        <YearSummaryCells
          cells={[
            { label: 'GP', value: stint.totals.gamesPlayed },
            { label: 'G', value: stint.totals.goals },
            { label: 'A', value: stint.totals.assists },
            { label: '+/−', value: signed(stint.totals.plusMinus) },
            { label: 'BLK', value: stint.totals.blocks },
            {
              label: 'HCK',
              value: stint.totals.hucksAttempted
                ? `${stint.totals.hucksCompleted}/${stint.totals.hucksAttempted}`
                : '—',
            },
            { label: 'HCK%', value: huckPct ? `${huckPct.toFixed(0)}%` : '—' },
            { label: 'CMP', value: cmpPct ? `${cmpPct.toFixed(0)}%` : '—' },
          ]}
        />
      </summary>
      <div className="px-4 pt-2 pb-4 border-t border-hairline overflow-x-auto">
        {stint.games.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-faint font-tight">
            No game-level data available.
          </div>
        ) : (
          <GameLogTable games={stint.games} />
        )}
      </div>
    </details>
  );
}

// ── USAU stint ──────────────────────────────────────────────────────────

function UsauStintRow({ stint }: { stint: UsauSeasonStint }) {
  const totalGoals = stint.events.reduce((s, e) => s + (e.goals ?? 0), 0);
  const totalAssists = stint.events.reduce((s, e) => s + (e.assists ?? 0), 0);
  const hasStats = stint.events.some((e) => e.goals != null || e.assists != null);

  return (
    <details className="group [&[open]>summary]:bg-surface-hi">
      <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-3 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
        <Caret />
        <Link
          href={`/usau/teams/${stint.teamId}`}
          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
        >
          <UsauTeamLogo
            name={stint.teamName}
            genderDivision={stint.genderDivision}
            competitionLevel={stint.competitionLevel}
            size={24}
          />
          <span className="flex flex-col min-w-0">
            <span className="font-display italic font-bold text-[16px] leading-tight tracking-[-0.02em] text-ink truncate pr-1">
              {stint.teamName}
            </span>
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              USAU
              {stint.division && ` · ${stint.division}`}
              {stint.jerseyNumber && ` · #${stint.jerseyNumber}`}
              {stint.isChampion && ' · Champion'}
            </span>
          </span>
        </Link>
        {stint.isChampion && <TrophyBadge title="USAU National Champion" />}
        {hasStats ? (
          <YearSummaryCells
            cells={[
              { label: 'EVTS', value: stint.events.length },
              { label: 'G', value: totalGoals },
              { label: 'A', value: totalAssists },
            ]}
          />
        ) : (
          <YearSummaryCells
            cells={[{ label: stint.events.length === 1 ? 'EVT' : 'EVTS', value: stint.events.length }]}
          />
        )}
      </summary>
      <div className="px-4 pt-2 pb-4 border-t border-hairline">
        {stint.events.length === 0 ? (
          <div className="py-4 text-[12px] text-faint font-tight">No events recorded.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {stint.events.map((event) => (
              <UsauEventRow
                key={`${stint.teamId}-${event.slug}`}
                event={event}
                genderDivision={stint.genderDivision}
              />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function UsauEventRow({
  event,
  genderDivision,
}: {
  event: UsauSeasonStint['events'][number];
  genderDivision: string | null;
}) {
  const date = event.startDate
    ? new Date(event.startDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  // Carry the stint's division so the event opens on the RIGHT bracket (a Mixed
  // player's Nationals link should land on the Mixed bracket, not default Men).
  const href = usauEventHref(event.slug, genderDivision);
  return (
    <li className="flex items-center gap-3 px-2 py-1.5 hover:bg-surface transition-colors rounded">
      <Link
        href={href}
        className="flex-1 min-w-0 text-[13px] text-ink font-tight hover:text-accent transition-colors truncate"
      >
        {event.name}
      </Link>
      {date && (
        <span className="hidden sm:block text-[11px] text-faint font-tight tabular whitespace-nowrap">
          {date}
        </span>
      )}
      {event.seed != null && (
        <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight whitespace-nowrap">
          Seed {event.seed}
        </span>
      )}
      {(event.goals != null || event.assists != null) && (
        <span className="flex items-center gap-2 flex-shrink-0">
          {event.goals != null && (
            <span className="tabular text-[12px] font-bold text-ink font-tight">{event.goals}G</span>
          )}
          {event.assists != null && (
            <span className="tabular text-[12px] font-bold text-ink font-tight">
              {event.assists}A
            </span>
          )}
        </span>
      )}
    </li>
  );
}

// ── PUL stint ───────────────────────────────────────────────────────────
// Expandable accordion row. Summary: team logo + name + key stats.
// Expanded panel: per-game log when box scores are available, season-totals
// table as fallback (e.g. 2022 PUL has no box scores).

function PulStintRow({ stint }: { stint: PulSeasonStint }) {
  // Dynamic accent color — sanctioned inline style (same pattern as PulTeamLogo).
  const accentStyle: React.CSSProperties = stint.teamAccentColor
    ? { borderLeft: `3px solid ${stint.teamAccentColor}` }
    : {};

  // Dedup: teamName may already include the city (e.g. "Raleigh Radiance" while
  // teamCity is "Raleigh"). Only prepend teamCity when teamName doesn't already
  // start with it (case-insensitive).
  const displayTeamName =
    stint.teamName.toLowerCase().startsWith(stint.teamCity.toLowerCase())
      ? stint.teamName
      : `${stint.teamCity} ${stint.teamName}`;

  return (
    <details className="group [&[open]>summary]:bg-surface-hi">
      <summary
        className="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-3 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        style={accentStyle}
      >
        <Caret />
        <Link
          href={`/pul/teams/${stint.teamId}`}
          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
        >
          <PulTeamLogoInline
            logoUrl={stint.teamLogoUrl}
            teamId={stint.teamId}
            mascot={stint.teamName.split(' ').slice(1).join(' ') || stint.teamName}
          />
          <span className="flex flex-col min-w-0">
            <span className="text-[14px] font-bold font-tight text-ink truncate leading-tight">
              {displayTeamName}
            </span>
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              PUL
              {stint.jerseyNumber ? ` · #${stint.jerseyNumber}` : ''}
              {stint.pronouns ? ` · ${stint.pronouns}` : ''}
            </span>
          </span>
        </Link>
        <YearSummaryCells
          cells={[
            { label: 'GP',  value: stint.stats.gamesPlayed },
            { label: 'G',   value: stint.stats.goals },
            { label: 'A',   value: stint.stats.assists },
            { label: '+/−', value: signed(stint.stats.plusMinus) },
            { label: 'BLK', value: stint.stats.blocks },
          ]}
        />
      </summary>
      <div className="px-4 pt-2 pb-4 border-t border-hairline overflow-x-auto">
        {stint.games.length > 0 ? (
          <PulGameLogTable games={stint.games} />
        ) : (
          <PulSeasonTotalsTable stats={stint.stats} />
        )}
      </div>
    </details>
  );
}

function PulSeasonTotalsTable({ stats }: { stats: PulSeasonStint['stats'] }) {
  const thBase = 'px-3 py-2 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-muted whitespace-nowrap text-right';
  const tdBase = 'px-3 py-2 text-[12px] font-tight text-right tabular';
  return (
    <table className="w-full max-w-[520px] border-collapse">
      <thead>
        <tr>
          <th scope="col" className={`${thBase} text-right`}>GP</th>
          <th scope="col" className={thBase}>G</th>
          <th scope="col" className={thBase}>A</th>
          <th scope="col" className={thBase}>Blk</th>
          <th scope="col" className={thBase}>TO</th>
          <th scope="col" className={thBase}>Touch</th>
          <th scope="col" className={thBase}>O-Pts</th>
          <th scope="col" className={thBase}>D-Pts</th>
          <th scope="col" className={thBase}>+/−</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={`${tdBase} text-ink`}>{stats.gamesPlayed}</td>
          <td className={`${tdBase} text-ink`}>{stats.goals}</td>
          <td className={`${tdBase} text-ink`}>{stats.assists}</td>
          <td className={`${tdBase} text-muted`}>{stats.blocks}</td>
          <td className={`${tdBase} text-muted`}>{stats.turnovers}</td>
          <td className={`${tdBase} text-muted`}>{stats.touches}</td>
          <td className={`${tdBase} text-muted`}>{stats.oPoints}</td>
          <td className={`${tdBase} text-muted`}>{stats.dPoints}</td>
          <td className={`${tdBase} ${stats.plusMinus > 0 ? 'text-ink font-semibold' : stats.plusMinus < 0 ? 'text-faint' : 'text-muted'}`}>
            {signed(stats.plusMinus)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PulGameLogTable({ games }: { games: PulPlayerGameRow[] }) {
  const thBase =
    'px-2 py-2 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-muted whitespace-nowrap';
  const tdBase = 'px-2 py-2 text-[12px] border-b border-hairline whitespace-nowrap font-tight';

  return (
    <table className="w-full min-w-[560px] border-collapse">
      <thead>
        <tr>
          <th scope="col" className={`${thBase} text-left`}>Date</th>
          <th scope="col" className={`${thBase} text-left`}>Opp</th>
          <th scope="col" className={`${thBase} text-left`}>Result</th>
          <th scope="col" className={`${thBase} text-right`}>G</th>
          <th scope="col" className={`${thBase} text-right`}>A</th>
          <th scope="col" className={`${thBase} text-right`}>+/−</th>
          <th scope="col" className={`${thBase} text-right`}>BLK</th>
          <th scope="col" className={`${thBase} text-right`}>TO</th>
          <th scope="col" className={`${thBase} text-right`}>Tch</th>
        </tr>
      </thead>
      <tbody>
        {games.map((g) => {
          const date = g.date
            ? formatShortDate(g.date)
            : g.weekLabel;
          const win = g.result === 'W';
          const loss = g.result === 'L';
          const score =
            g.teamScore != null && g.oppScore != null
              ? `${g.teamScore}–${g.oppScore}`
              : '';
          return (
            <tr key={g.gameId} className="hover:bg-surface-hi transition-colors duration-100">
              <td className={`${tdBase} text-left text-faint tabular`}>{date}</td>
              <td className={`${tdBase} text-left`}>
                {g.opponentAbbrev ? (
                  <span className="text-muted font-semibold">{g.opponentAbbrev}</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className={`${tdBase} text-left`}>
                <Link
                  href={`/pul/g/${g.gameId}`}
                  className="inline-flex items-center gap-1 text-ink hover:text-accent transition-colors cursor-pointer"
                >
                  <span
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase ${win ? 'text-accent' : loss ? 'text-faint' : 'text-muted'}`}
                  >
                    {g.result ?? '—'}
                  </span>
                  {score && <span className="tabular text-[12px] text-muted">{score}</span>}
                </Link>
              </td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.goals}</td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.assists}</td>
              <td
                className={`${tdBase} text-right tabular ${g.plusMinus > 0 ? 'text-ink font-semibold' : g.plusMinus < 0 ? 'text-faint' : 'text-muted'}`}
              >
                {signed(g.plusMinus)}
              </td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.blocks}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.turnovers}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.touches}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-hairline">
          <td colSpan={3} className={tfootLabel}>Total · {games.length} GP</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.goals)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.assists)}</td>
          <td className={tfootCell}>{signed(sumBy(games, (g) => g.plusMinus))}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.blocks)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.turnovers)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.touches)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ── WUL stint ───────────────────────────────────────────────────────────────
// Expandable accordion row. Summary: team logo + name + key stats.
// Expanded panel: per-game log when available, season-totals table as fallback.

function WulStintRow({ stint }: { stint: WulSeasonStint }) {
  // Dynamic accent color — same inline-style pattern as PulStintRow.
  const accentStyle: React.CSSProperties = stint.teamAccentColor
    ? { borderLeft: `3px solid ${stint.teamAccentColor}` }
    : {};

  // Dedup: teamName may already include the city. Only prepend teamCity when it
  // doesn't already appear at the start of teamName (case-insensitive).
  const displayTeamName =
    stint.teamName.toLowerCase().startsWith(stint.teamCity.toLowerCase())
      ? stint.teamName
      : `${stint.teamCity} ${stint.teamName}`;

  return (
    <details className="group [&[open]>summary]:bg-surface-hi">
      <summary
        className="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-3 hover:bg-surface-hi transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        style={accentStyle}
      >
        <Caret />
        <Link
          href={`/wul/teams/${stint.teamId}`}
          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
        >
          <WulTeamLogoInline
            logoUrl={stint.teamLogoUrl}
            teamId={stint.teamId}
            accentColor={stint.teamAccentColor}
            mascot={stint.teamName.split(' ').slice(1).join(' ') || stint.teamName}
          />
          <span className="flex flex-col min-w-0">
            <span className="text-[14px] font-bold font-tight text-ink truncate leading-tight">
              {displayTeamName}
            </span>
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              WUL
              {stint.jerseyNumber ? ` · #${stint.jerseyNumber}` : ''}
            </span>
          </span>
        </Link>
        <YearSummaryCells
          cells={[
            { label: 'GP',  value: stint.stats.gamesPlayed },
            { label: 'G',   value: stint.stats.goals },
            { label: 'A',   value: stint.stats.assists },
            { label: '+/−', value: signed(stint.stats.plusMinus) },
            { label: 'BLK', value: stint.stats.blocks },
          ]}
        />
      </summary>
      <div className="px-4 pt-2 pb-4 border-t border-hairline overflow-x-auto">
        {stint.games.length > 0 ? (
          <WulGameLogTable games={stint.games} />
        ) : (
          <WulSeasonTotalsTable stats={stint.stats} />
        )}
      </div>
    </details>
  );
}

// ── WFDF stint ──────────────────────────────────────────────────────────
// A single Worlds appearance — non-expandable (no game log upstream; just
// tournament goals/assists). Links to the team's WFDF page. Champions get an
// accent gold marker.
function WfdfStintRow({ stint }: { stint: WfdfSeasonStint }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <Link
        href={`/wfdf/teams/${stint.teamId}`}
        className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
      >
        <WfdfFlag flagFile={null} countryCode={stint.countryCode} size={20} />
        <span className="flex flex-col min-w-0">
          <span className="text-[14px] font-bold font-tight text-ink truncate leading-tight">
            {stint.teamName}
            {stint.isChampion && (
              <span className="ml-1.5 text-[9px] font-bold tracking-[0.12em] uppercase text-[#B8891E]">
                · Champion
              </span>
            )}
          </span>
          <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
            WFDF · {stint.eventName}
            {stint.divisionName ? ` · ${stint.divisionName}` : ''}
            {stint.jerseyNumber ? ` · #${stint.jerseyNumber}` : ''}
          </span>
        </span>
      </Link>
      <YearSummaryCells
        cells={[
          { label: 'G', value: stint.stats.goals ?? '—' },
          { label: 'A', value: stint.stats.assists ?? '—' },
        ]}
      />
    </div>
  );
}

function WulSeasonTotalsTable({ stats }: { stats: WulSeasonStint['stats'] }) {
  const thBase = 'px-3 py-2 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-muted whitespace-nowrap text-right';
  const tdBase = 'px-3 py-2 text-[12px] font-tight text-right tabular';
  return (
    <table className="w-full max-w-[520px] border-collapse">
      <thead>
        <tr>
          <th scope="col" className={`${thBase} text-right`}>GP</th>
          <th scope="col" className={thBase}>G</th>
          <th scope="col" className={thBase}>A</th>
          <th scope="col" className={thBase}>Blk</th>
          <th scope="col" className={thBase}>TO</th>
          <th scope="col" className={thBase}>Touch</th>
          <th scope="col" className={thBase}>O-Pts</th>
          <th scope="col" className={thBase}>D-Pts</th>
          <th scope="col" className={thBase}>+/−</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className={`${tdBase} text-ink`}>{stats.gamesPlayed}</td>
          <td className={`${tdBase} text-ink`}>{stats.goals}</td>
          <td className={`${tdBase} text-ink`}>{stats.assists}</td>
          <td className={`${tdBase} text-muted`}>{stats.blocks}</td>
          <td className={`${tdBase} text-muted`}>{stats.turnovers}</td>
          <td className={`${tdBase} text-muted`}>{stats.touches}</td>
          <td className={`${tdBase} text-muted`}>{stats.oPoints}</td>
          <td className={`${tdBase} text-muted`}>{stats.dPoints}</td>
          <td className={`${tdBase} ${stats.plusMinus > 0 ? 'text-ink font-semibold' : stats.plusMinus < 0 ? 'text-faint' : 'text-muted'}`}>
            {signed(stats.plusMinus)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function WulGameLogTable({ games }: { games: WulPlayerGameRow[] }) {
  const thBase =
    'px-2 py-2 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-muted whitespace-nowrap';
  const tdBase = 'px-2 py-2 text-[12px] border-b border-hairline whitespace-nowrap font-tight';

  return (
    <table className="w-full min-w-[660px] border-collapse">
      <thead>
        <tr>
          <th scope="col" className={`${thBase} text-left`}>Date</th>
          <th scope="col" className={`${thBase} text-left`}>Opp</th>
          <th scope="col" className={`${thBase} text-left`}>Result</th>
          <th scope="col" className={`${thBase} text-right`}>G</th>
          <th scope="col" className={`${thBase} text-right`}>A</th>
          <th scope="col" className={`${thBase} text-right`}>+/−</th>
          <th scope="col" className={`${thBase} text-right`}>BLK</th>
          <th scope="col" className={`${thBase} text-right`}>TO</th>
          <th scope="col" className={`${thBase} text-right`}>Tch</th>
          <th scope="col" className={`${thBase} text-right`} title="Points played">PP</th>
          <th scope="col" className={`${thBase} text-right`} title="Total yards">Yds</th>
        </tr>
      </thead>
      <tbody>
        {games.map((g) => {
          const date = g.date
            ? formatShortDate(g.date)
            : g.weekLabel;
          const win = g.result === 'W';
          const loss = g.result === 'L';
          const score =
            g.teamScore != null && g.oppScore != null
              ? `${g.teamScore}–${g.oppScore}`
              : '';
          const pm = g.plusMinus;
          return (
            <tr key={g.gameId} className="hover:bg-surface-hi transition-colors duration-100">
              <td className={`${tdBase} text-left text-faint tabular`}>{date}</td>
              <td className={`${tdBase} text-left`}>
                {g.opponentAbbrev ? (
                  <span className="text-muted font-semibold">{g.opponentAbbrev}</span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className={`${tdBase} text-left`}>
                <Link
                  href={`/wul/g/${g.gameId}`}
                  className="inline-flex items-center gap-1 text-ink hover:text-accent transition-colors cursor-pointer"
                >
                  <span
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase ${win ? 'text-accent' : loss ? 'text-faint' : 'text-muted'}`}
                  >
                    {g.result ?? '—'}
                  </span>
                  {score && <span className="tabular text-[12px] text-muted">{score}</span>}
                </Link>
              </td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.goals}</td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.assists}</td>
              <td
                className={`${tdBase} text-right tabular ${pm > 0 ? 'text-ink font-semibold' : pm < 0 ? 'text-faint' : 'text-muted'}`}
              >
                {signed(pm)}
              </td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.blocks}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.turnovers}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.touches}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.pointsPlayed}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.totalYards}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-hairline">
          <td colSpan={3} className={tfootLabel}>Total · {games.length} GP</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.goals)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.assists)}</td>
          <td className={tfootCell}>{signed(sumBy(games, (g) => g.plusMinus))}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.blocks)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.turnovers)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.touches)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.pointsPlayed)}</td>
          <td className={tfootCell}>{sumBy(games, (g) => g.totalYards)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// Inline logo renderer for WUL — logoUrl comes from wul_teams.logo_url (same-origin path).
// Uses the team's accentColor for the monogram background when no logo is available.
function WulTeamLogoInline({
  logoUrl,
  teamId,
  accentColor,
  mascot,
}: {
  logoUrl: string | null;
  teamId: string;
  accentColor: string | null;
  mascot: string;
}) {
  const size = 26;
  if (logoUrl) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-full bg-white"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="object-contain" style={{ width: size * 0.72, height: size * 0.72 }} />
      </span>
    );
  }
  const initials = mascot.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase();
  // Use the team's own accent color when available, fall back to a neutral dark.
  const bg = accentColor ?? '#1d2535';
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
      style={{ width: size, height: size, background: bg }}
      aria-hidden="true"
    >
      <span className="font-display italic font-bold text-white" style={{ fontSize: Math.max(8, size * 0.3), letterSpacing: '0.02em' }}>
        {initials}
      </span>
    </span>
  );
}

// ── Inline logo renderer for the profile — avoids importing PulTeamLogo server
// component in a 'use client'-adjacent file while keeping the same visual.
function PulTeamLogoInline({
  logoUrl,
  teamId,
  mascot,
}: {
  logoUrl: string | null;
  teamId: string;
  mascot: string;
}) {
  const size = 26;
  if (logoUrl) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-full bg-white"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="object-contain" style={{ width: size * 0.72, height: size * 0.72 }} />
      </span>
    );
  }
  const initials = mascot.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase();
  const bg = teamId === 'new-york' || teamId === 'new-york-gridlock' ? '#1a1a2e' : '#1d2535';
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
      style={{ width: size, height: size, background: bg }}
      aria-hidden="true"
    >
      <span className="font-display italic font-bold text-white" style={{ fontSize: Math.max(8, size * 0.3), letterSpacing: '0.02em' }}>
        {initials}
      </span>
    </span>
  );
}

// ── Shared rendering bits ───────────────────────────────────────────────

function YearSummaryCells({
  cells,
}: {
  cells: Array<{ label: string; value: string | number }>;
}) {
  return (
    <span className="hidden sm:flex items-center gap-4 flex-shrink-0">
      {cells.map((c) => (
        <span key={c.label} className="flex flex-col items-end gap-0.5">
          <span className="tabular text-[14px] font-bold font-tight text-ink leading-none">
            {c.value}
          </span>
          <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
            {c.label}
          </span>
        </span>
      ))}
    </span>
  );
}

function GameLogTable({ games }: { games: UfaPlayerGameRow[] }) {
  const sorted = [...games].sort((a, b) => a.gameID.localeCompare(b.gameID));
  const thBase =
    'px-2 py-2 text-[9px] font-bold tracking-[0.14em] uppercase font-tight text-muted whitespace-nowrap';
  const tdBase = 'px-2 py-2 text-[12px] border-b border-hairline whitespace-nowrap font-tight';

  return (
    <table className="w-full min-w-[760px] border-collapse">
      <thead>
        <tr>
          <th scope="col" className={`${thBase} text-left`}>Date</th>
          <th scope="col" className={`${thBase} text-left`}>Opponent</th>
          <th scope="col" className={`${thBase} text-left`}>Result</th>
          <th scope="col" className={`${thBase} text-right`}>G</th>
          <th scope="col" className={`${thBase} text-right`}>A</th>
          <th scope="col" className={`${thBase} text-right`}>+/−</th>
          <th scope="col" className={`${thBase} text-right`}>Blk</th>
          <th scope="col" className={`${thBase} text-right`}>Cmp</th>
          <th scope="col" className={`${thBase} text-right`}>Cmp%</th>
          <th scope="col" className={`${thBase} text-right`} title="Hucks completed / attempted">Hck</th>
          <th scope="col" className={`${thBase} text-right`} title="Huck completion %">Hck%</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((g) => {
          const date = parseGameDate(g.gameID);
          const opp = parseOpponent(g);
          const result = parseResult(g);
          const pm = g.goals + g.assists + g.blocks - g.throwaways - g.drops - g.stalls;
          const cmpPct = g.throwsAttempted ? (g.completions / g.throwsAttempted) * 100 : 0;
          const huckPct = g.hucksAttempted ? (g.hucksCompleted / g.hucksAttempted) * 100 : 0;
          return (
            <tr key={g.gameID} className="hover:bg-surface-hi transition-colors duration-100">
              <td className={`${tdBase} text-left text-faint tabular`}>{date}</td>
              <td className={`${tdBase} text-left`}>
                {opp.team ? (
                  <Link
                    href={`/teams/${opp.team.id}`}
                    className="inline-flex items-center gap-1.5 text-ink hover:text-accent transition-colors"
                  >
                    <TeamLogo team={opp.team} size={18} />
                    <span className="font-semibold">{opp.label}</span>
                  </Link>
                ) : (
                  <span className="text-muted">{opp.label}</span>
                )}
              </td>
              <td className={`${tdBase} text-left`}>
                <Link
                  href={`/g/${g.gameID}`}
                  className="inline-flex items-center gap-1 text-ink hover:text-accent transition-colors"
                >
                  <span
                    className={`text-[10px] font-bold tracking-[0.1em] uppercase ${result.win ? 'text-accent' : result.loss ? 'text-faint' : 'text-muted'}`}
                  >
                    {result.label}
                  </span>
                  <span className="tabular text-[12px] text-muted">{result.score}</span>
                </Link>
              </td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.goals}</td>
              <td className={`${tdBase} text-right tabular text-ink`}>{g.assists}</td>
              <td
                className={`${tdBase} text-right tabular ${pm > 0 ? 'text-ink font-semibold' : pm < 0 ? 'text-faint' : 'text-muted'}`}
              >
                {signed(pm)}
              </td>
              <td className={`${tdBase} text-right tabular text-muted`}>{g.blocks}</td>
              <td className={`${tdBase} text-right tabular text-muted`}>
                {g.completions}/{g.throwsAttempted}
              </td>
              <td className={`${tdBase} text-right tabular text-muted`}>
                {cmpPct ? `${cmpPct.toFixed(0)}%` : '—'}
              </td>
              <td className={`${tdBase} text-right tabular text-muted`}>
                {g.hucksAttempted ? `${g.hucksCompleted}/${g.hucksAttempted}` : '—'}
              </td>
              <td className={`${tdBase} text-right tabular text-muted`}>
                {huckPct ? `${huckPct.toFixed(0)}%` : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        {(() => {
          // Counting stats sum; % columns recompute from summed totals (you
          // can't average per-game percentages). +/− is the summed plus/minus.
          const g = sumBy(sorted, (r) => r.goals);
          const a = sumBy(sorted, (r) => r.assists);
          const blk = sumBy(sorted, (r) => r.blocks);
          const cmp = sumBy(sorted, (r) => r.completions);
          const thr = sumBy(sorted, (r) => r.throwsAttempted);
          const hc = sumBy(sorted, (r) => r.hucksCompleted);
          const ha = sumBy(sorted, (r) => r.hucksAttempted);
          const pm = sumBy(
            sorted,
            (r) => r.goals + r.assists + r.blocks - r.throwaways - r.drops - r.stalls,
          );
          const cmpPct = thr ? (cmp / thr) * 100 : 0;
          const huckPct = ha ? (hc / ha) * 100 : 0;
          return (
            <tr className="border-t-2 border-hairline">
              <td colSpan={3} className={tfootLabel}>Total · {sorted.length} GP</td>
              <td className={tfootCell}>{g}</td>
              <td className={tfootCell}>{a}</td>
              <td className={tfootCell}>{signed(pm)}</td>
              <td className={tfootCell}>{blk}</td>
              <td className={tfootCell}>{cmp}/{thr}</td>
              <td className={tfootCell}>{cmpPct ? `${cmpPct.toFixed(0)}%` : '—'}</td>
              <td className={tfootCell}>{ha ? `${hc}/${ha}` : '—'}</td>
              <td className={tfootCell}>{huckPct ? `${huckPct.toFixed(0)}%` : '—'}</td>
            </tr>
          );
        })()}
      </tfoot>
    </table>
  );
}

function CareerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface flex flex-col items-center justify-center px-3 py-5 gap-1">
      <div className="tabular text-[28px] md:text-[32px] font-bold font-tight leading-none text-ink tracking-[-0.03em]">
        {value ?? '—'}
      </div>
      <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted font-tight text-center">
        {label}
      </div>
    </div>
  );
}

function TrophyBadge({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-ink flex-shrink-0"
    >
      <svg width="11" height="11" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M6 3h10v5a5 5 0 0 1-10 0V3Z" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M6 5H3v2a2 2 0 0 0 2 2M16 5h3v2a2 2 0 0 1-2 2"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M11 13v3M8 19h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Caret() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted flex-shrink-0 transition-transform duration-150 group-open:rotate-90"
      aria-hidden="true"
    >
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}

// ── Type guards + utils ─────────────────────────────────────────────────

function isUfa(s: SeasonStint): s is UfaSeasonStint {
  return s.league === 'ufa';
}
function isUsau(s: SeasonStint): s is UsauSeasonStint {
  return s.league === 'usau';
}
// isWul is available for future use (e.g. WUL-only fallback guards).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isWul(s: SeasonStint): s is WulSeasonStint {
  return s.league === 'wul';
}

function signed(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

/** Sum a numeric field across game-log rows. */
function sumBy<T>(rows: T[], pick: (r: T) => number): number {
  return rows.reduce((acc, r) => acc + pick(r), 0);
}

// Shared styling for the game-log "Total" footer row — bold ink, sits under a
// heavier top border so it reads as a summary distinct from the per-game rows.
const tfootLabel =
  'px-2 py-2 text-left text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-ink whitespace-nowrap';
const tfootCell = 'px-2 py-2 text-right text-[12px] font-tight font-bold tabular text-ink whitespace-nowrap';

/** Format a YYYY-MM-DD date string as "Jun 7" for display in game log tables. */
function formatShortDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function parseGameDate(gameID: string): string {
  const m = gameID.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function parseOpponent(g: UfaPlayerGameRow): {
  label: string;
  team: ReturnType<typeof teamMetaByAbbr>;
} {
  const m = g.gameID.match(/^\d{4}-\d{2}-\d{2}-([A-Z]+)-([A-Z]+)$/);
  if (!m) return { label: '—', team: null };
  const [, away, home] = m;
  const oppAbbr = g.isHome ? away : home;
  const team = teamMetaByAbbr(oppAbbr);
  const venue = g.isHome ? 'vs' : '@';
  if (team) return { label: `${venue} ${team.abbr}`, team };
  return { label: `${venue} ${oppAbbr}`, team: null };
}

function parseResult(g: UfaPlayerGameRow): {
  label: string;
  score: string;
  win: boolean;
  loss: boolean;
} {
  const my = g.isHome ? g.scoreHome : g.scoreAway;
  const opp = g.isHome ? g.scoreAway : g.scoreHome;
  if (my === 0 && opp === 0) return { label: '—', score: '', win: false, loss: false };
  const win = my > opp;
  const loss = my < opp;
  return {
    label: win ? 'W' : loss ? 'L' : 'T',
    score: `${my}–${opp}`,
    win,
    loss,
  };
}
