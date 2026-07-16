// USAU hero slide — EventSlide layout per the Home v2 design spec: solid
// league-color base (#173A7A), white radial glow top-right, grid
// [1.4fr_1fr] = left meta column / right ring-circle logo.
//
// Props come from UsauEventSummary (lib/usau/data) — name, dates, team count.
// CTA links to /usau/events/{slug}.

import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { HeroFieldLines } from './field-diagram';

const USAU_BG = '#173A7A';
const USAU_GLOW = 'rgba(96,150,240,0.40)';
const TEXT = '#FFFFFF';
const TEXT_MUTED = 'rgba(255,255,255,0.75)';

interface HeroUsauSlideProps {
  event: UsauEventSummary;
}

export function HeroUsauSlide({ event }: HeroUsauSlideProps) {
  const teamCount = event.teams.length;
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const location = [event.city, event.state].filter(Boolean).join(', ');
  const levelLabel = formatLevel(event.competitionLevel);
  const slug = event.slug;

  return (
    <article
      className="relative h-full overflow-hidden px-5 sm:px-10 pt-[26px] sm:pt-[34px] pb-10 sm:pb-14 box-border"
      style={{ background: USAU_BG, color: TEXT }}
    >
      <div
        className="absolute -top-[40%] -right-[6%] w-[60%] h-[180%] pointer-events-none"
        style={{ background: `radial-gradient(circle at 60% 50%, ${USAU_GLOW}, transparent 62%)` }}
        aria-hidden="true"
      />
      <HeroFieldLines color="rgba(255,255,255,0.06)" accent="#5A8CF0" />

      <div className="relative h-full grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] items-center gap-6">
        {/* Extra left padding beyond the article's own edge padding so the
            eyebrow/title/flight badge never sit under the carousel's
            side-centered 42px arrow button. */}
        <div className="flex flex-col justify-between h-full gap-4 sm:pl-8 lg:pl-12">
          {/* Eyebrow */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center font-sans text-[10.5px] font-bold tracking-[0.16em] uppercase px-2.5 py-[6px] rounded-full"
              style={{ color: '#fff', background: 'rgba(255,255,255,0.16)' }}
            >
              USAU Tournament
            </span>
            <span className="font-mono text-[12px]" style={{ color: TEXT_MUTED }}>
              {levelLabel}
              {location ? ` · ${location}` : ''}
            </span>
          </div>

          {/* Event name — big display type */}
          <div className="flex flex-col gap-3 my-1">
            <h2
              className="font-display italic font-bold leading-[0.92] tracking-[-0.03em] m-0"
              style={{ fontSize: 'clamp(28px, 5vw, 58px)', color: TEXT }}
            >
              {event.name}
            </h2>
            {event.flight && (
              <div
                className="inline-flex items-center self-start px-2.5 py-1 rounded-full font-mono text-[9px] font-bold tracking-[0.14em] uppercase"
                style={{ color: '#5A8CF0', background: 'rgba(29,94,204,0.22)' }}
              >
                {event.flight.replace('-', ' ')}
              </div>
            )}
          </div>

          {/* Footer: meta trio + CTA */}
          <div className="flex flex-wrap items-end justify-between gap-4 lg:flex-col lg:items-start lg:justify-end">
            <div className="flex flex-wrap gap-6 sm:gap-8">
              {dateRange && <DarkMeta label="Dates" value={dateRange} />}
              {teamCount > 0 && <DarkMeta label="Teams" value={String(teamCount)} />}
              {event.season && <DarkMeta label="Season" value={String(event.season)} />}
            </div>
            <Link
              href={`/usau/events/${slug}`}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-sans text-[12px] sm:text-[13px] font-bold cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(74,139,248,0.6)] bg-accent text-accent-ink"
            >
              View tournament →
            </Link>
          </div>
        </div>

        {/* Right column — league mark in a translucent ring circle. */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="w-[168px] h-[168px] rounded-full bg-white/[0.14] border border-white/[0.22] flex items-center justify-center">
            <span className="w-[118px] h-[118px] rounded-full bg-white flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/USAU-logo.png" alt="" className="w-[84px] h-[84px] object-contain" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DarkMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.1em]" style={{ color: TEXT_MUTED }}>
        {label}
      </div>
      <div className="font-sans text-[12.5px] sm:text-[14px] font-semibold mt-[3px] truncate" style={{ color: TEXT }}>
        {value}
      </div>
    </div>
  );
}

function formatDateRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start) return null;
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  if (!end || start === end) return fmt(start);
  // Same month → "Jun 27–29"; different → "Jun 27 – Jul 2".
  // NOTE: JS Date months are 0-indexed, so the month component MUST be `m - 1`
  // (matching fmt() above). The previous spread passed the raw 1-based month,
  // which shifted every date forward a month ("Jul 11" → "Aug 11").
  const toLocal = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const startDate = toLocal(start);
  const endDate = toLocal(end);
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${endDate.getDate()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatLevel(level: string): string {
  const map: Record<string, string> = {
    CLUB: 'Club',
    COLLEGE_D1: 'College D-I',
    COLLEGE_D3: 'College D-III',
    HS: 'High School',
    MS: 'Middle School',
    YC: 'Youth Club',
    MASTERS: 'Masters',
    GRAND_MASTERS: 'Grand Masters',
    GREAT_GRAND_MASTERS: 'Great Grand Masters',
    BEACH: 'Beach',
    OTHER: 'Open',
  };
  return map[level] ?? level;
}
