// Featured game hero card — dark "stadium" background, big score, decorative
// chalk field lines + flight arc, optional mini-stat strip, two CTAs.
//
// The caller picks the game via pickGameOfTheWeek() (lib/ufa/game-of-the-week).
// This component just renders whichever UfaGame it's handed.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import { HeroFieldLines } from './field-diagram';
import { TeamLogo } from '@/components/team-logo';

interface HeroGameCardProps {
  game: UfaGame | undefined;
  awayRecord?: string;
  homeRecord?: string;
}

const STADIUM = {
  bg: '#0F1B2E',
  line: 'rgba(244,242,235,0.06)',
  text: '#F4F2EB',
  textMuted: 'rgba(244,242,235,0.55)',
};
const ACCENT = '#FF3D00';

export function HeroGameCard({ game, awayRecord, homeRecord }: HeroGameCardProps) {
  if (!game) return <EmptyHero />;

  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const matchup = `${away.city} ${away.name} @ ${home.city} ${home.name}`;
  const eyebrowLabel = state.isLive
    ? `Live now · ${matchup}`
    : state.isUpcoming
      ? `Game of the week · ${matchup}`
      : `Recent · ${matchup}`;
  const statusLine = state.isLive
    ? 'LIVE · IN PROGRESS'
    : state.isUpcoming
      ? formatStartCompact(game).toUpperCase()
      : 'FINAL';

  return (
    <article
      className="relative overflow-hidden p-9 lg:min-h-[480px] flex flex-col justify-between"
      style={{ background: STADIUM.bg, color: STADIUM.text }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(80% 60% at 100% 0%, rgba(110,150,220,0.18), transparent 60%)',
        }}
        aria-hidden="true"
      />
      <HeroFieldLines color={STADIUM.line} accent={ACCENT} />

      <div className="relative flex-1 flex flex-col justify-between gap-5">
        {/* eyebrow row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2.5 mb-2">
              {state.isLive ? (
                <span className="w-[7px] h-[7px] rounded-full bg-[#FF3D00] shadow-[0_0_0_3px_rgba(255,61,0,0.2)]" />
              ) : (
                <span className="w-[7px] h-[7px] rounded-full bg-[rgba(244,242,235,0.4)]" />
              )}
              <span className="font-mono text-[11px] font-bold tracking-[0.14em]" style={{ color: state.isLive ? ACCENT : STADIUM.textMuted }}>
                {statusLine}
              </span>
            </div>
            <div
              className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase"
              style={{ color: STADIUM.textMuted }}
            >
              {eyebrowLabel}
            </div>
          </div>
          <Pill>01 · The Games</Pill>
        </div>

        {/* score block */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-7 items-center my-3">
          <TeamColumn
            slug={away.id}
            abbr={away.abbr}
            name={away.name ?? game.awayTeamName}
            rec={awayRecord ?? '—'}
            score={game.awayScore}
            winner={state.awayWin}
            loser={state.homeWin}
            showScore={state.hasScore || state.isLive || state.isFinal}
          />
          <div
            className="font-display italic font-semibold text-[22px]"
            style={{ color: STADIUM.textMuted }}
          >
            vs
          </div>
          <TeamColumn
            slug={home.id}
            abbr={home.abbr}
            name={home.name ?? game.homeTeamName}
            rec={homeRecord ?? '—'}
            score={game.homeScore}
            align="right"
            winner={state.homeWin}
            loser={state.awayWin}
            showScore={state.hasScore || state.isLive || state.isFinal}
          />
        </div>

        {/* footer: mini stats + CTAs */}
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div className="flex flex-wrap gap-7">
            <StatMini label="Week" value={game.week ? game.week.replace(/^week-/i, 'WK ') : '—'} />
            <StatMini label="Status" value={state.isLive ? 'Live' : state.isFinal ? 'Final' : 'Upcoming'} accent={state.isLive} />
            <StatMini label="Venue" value={game.locationName ? truncate(game.locationName, 22) : '—'} />
          </div>
          <div className="flex gap-2.5">
            {game.streamingURL && (
              <CTA primary href={game.streamingURL} external>
                ▶ Watch live
              </CTA>
            )}
            <CTA dark href={`/g/${game.gameID}`}>
              {state.isUpcoming ? 'Preview' : 'Box score'} →
            </CTA>
          </div>
        </div>
      </div>
    </article>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function EmptyHero() {
  return (
    <div className="bg-[#0F1B2E] text-[#F4F2EB] p-9 lg:min-h-[480px] flex flex-col items-center justify-center gap-4 text-center">
      <span className="font-mono text-[11px] tracking-[0.18em]" style={{ color: STADIUM.textMuted }}>
        OFFSEASON
      </span>
      <h2 className="font-display italic font-bold text-[40px] leading-[0.95] tracking-[-0.02em] m-0">
        No featured game today.
      </h2>
      <p className="text-[13px] max-w-md" style={{ color: STADIUM.textMuted }}>
        The schedule is dark. Check back during UFA season — games run April through August.
      </p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full"
      style={{
        color: STADIUM.text,
        background: 'rgba(244,242,235,0.08)',
        border: '1px solid rgba(244,242,235,0.12)',
      }}
    >
      {children}
    </span>
  );
}

function TeamColumn({
  slug,
  abbr,
  name,
  rec,
  score,
  align = 'left',
  winner,
  loser,
  showScore,
}: {
  slug: string;
  abbr: string;
  name: string;
  rec: string;
  score: number;
  align?: 'left' | 'right';
  winner: boolean;
  loser: boolean;
  showScore: boolean;
}) {
  const meta = teamMeta(slug);
  return (
    <div
      className={`flex flex-col gap-2 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} transition-opacity`}
      style={{ opacity: loser ? 0.55 : 1 }}
    >
      <div className={`flex items-center gap-2.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <TeamLogo team={meta} size={36} />
        <div>
          <div className="font-display italic font-bold text-[18px] tracking-[-0.02em]">{abbr}</div>
          <div className="font-mono text-[10.5px] mt-0.5" style={{ color: STADIUM.textMuted }}>
            {rec}
          </div>
        </div>
      </div>
      <div
        className="font-display italic font-bold text-[72px] lg:text-[96px] leading-[0.95] tracking-[-0.04em] tabular"
        style={{ color: winner ? ACCENT : STADIUM.text }}
      >
        {showScore ? score : '–'}
      </div>
      <div className="font-sans text-[11px] font-medium" style={{ color: STADIUM.textMuted }}>
        {name}
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: STADIUM.textMuted }}>
        {label}
      </div>
      <div
        className="font-display italic font-bold text-[20px] lg:text-[22px] mt-0.5"
        style={{ color: accent ? ACCENT : STADIUM.text }}
      >
        {value}
      </div>
    </div>
  );
}

function CTA({
  children,
  primary,
  dark,
  href,
  external,
}: {
  children: React.ReactNode;
  primary?: boolean;
  dark?: boolean;
  href: string;
  external?: boolean;
}) {
  const cls = primary
    ? 'bg-[#FF3D00] text-[#0E0E0C]'
    : dark
      ? 'bg-[rgba(244,242,235,0.10)] text-[#F4F2EB] border border-[rgba(244,242,235,0.18)]'
      : 'bg-white text-[#0E0E0C] border border-[#E5E1D6]';
  const cls2 = 'inline-flex items-center gap-2 px-4 py-2.5 font-sans text-[11px] font-bold tracking-[0.12em] uppercase cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]';
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${cls} ${cls2}`}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${cls} ${cls2}`}>
      {children}
    </Link>
  );
}
