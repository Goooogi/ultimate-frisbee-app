// USAU hero slide — tournament-level card (not a single game).
// Mirrors HeroGameCard's dark-stadium feel: #0F1B2E base, accent bits,
// chalk field lines, big display type. Per-league accent: USAU blue.
//
// Props come from UsauEventSummary (lib/usau/data) — name, dates, team count.
// CTA links to /usau/events/{slug}.

import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';
import { HeroFieldLines } from './field-diagram';

const STADIUM = {
  bg: '#0A1828',
  line: 'rgba(220,235,255,0.06)',
  text: '#EEF4FF',
  textMuted: 'rgba(220,235,255,0.55)',
};
// USAU-specific accent: royal blue
const USAU_ACCENT = '#1D5ECC';
const USAU_ACCENT_LIGHT = '#4A8BF8';

interface HeroUsauSlideProps {
  event: UsauEventSummary;
}

export function HeroUsauSlide({ event }: HeroUsauSlideProps) {
  const teamCount = event.teams.length;
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const location = [event.city, event.state].filter(Boolean).join(', ');
  const levelLabel = formatLevel(event.competitionLevel);
  const slug = event.slug;

  const background = [
    'linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.06) 42%, rgba(0,0,0,0.44) 100%)',
    `radial-gradient(130% 140% at 80% 20%, rgba(29,94,204,0.55) 0%, transparent 58%)`,
    `radial-gradient(80% 100% at 0% 80%, rgba(10,24,64,0.70) 0%, transparent 60%)`,
    STADIUM.bg,
  ].join(', ');

  return (
    <article
      className="relative overflow-hidden p-5 sm:p-9 lg:min-h-[480px] flex flex-col justify-between"
      style={{ background, color: STADIUM.text }}
    >
      {/* Corner glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 90% 5%, rgba(74,139,248,0.22), transparent 60%)',
        }}
        aria-hidden="true"
      />
      <HeroFieldLines color={STADIUM.line} accent={USAU_ACCENT_LIGHT} />

      <div className="relative flex-1 flex flex-col justify-between gap-5">
        {/* Eyebrow */}
        <div>
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: USAU_ACCENT_LIGHT, boxShadow: `0 0 0 3px rgba(74,139,248,0.22)` }}
            />
            <span
              className="font-mono text-[11px] font-bold tracking-[0.14em]"
              style={{ color: USAU_ACCENT_LIGHT }}
            >
              USAU TOURNAMENT
            </span>
          </div>
          <div
            className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase"
            style={{ color: STADIUM.textMuted }}
          >
            {levelLabel}
            {location ? ` · ${location}` : ''}
          </div>
        </div>

        {/* Event name — big display type */}
        <div className="flex flex-col gap-3 my-3">
          <h2
            className="font-display italic font-bold leading-[0.93] tracking-[-0.025em] m-0"
            style={{
              fontSize: 'clamp(28px, 5vw, 52px)',
              color: STADIUM.text,
            }}
          >
            {event.name}
          </h2>
          {event.flight && (
            <div
              className="inline-flex items-center self-start px-2 py-0.5 rounded font-mono text-[9px] font-bold tracking-[0.14em] uppercase border"
              style={{
                color: USAU_ACCENT_LIGHT,
                borderColor: `rgba(74,139,248,0.35)`,
                background: `rgba(29,94,204,0.18)`,
              }}
            >
              {event.flight.replace('-', ' ')}
            </div>
          )}
        </div>

        {/* Footer: stats + CTA */}
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div className="flex flex-wrap gap-7">
            {dateRange && (
              <StatMini label="Dates" value={dateRange} />
            )}
            {teamCount > 0 && (
              <StatMini label="Teams" value={String(teamCount)} />
            )}
            {event.season && (
              <StatMini label="Season" value={String(event.season)} />
            )}
          </div>
          <div className="flex gap-2.5">
            <Link
              href={`/usau/events/${slug}`}
              className={[
                'inline-flex items-center gap-2 px-4 py-2.5',
                'font-sans text-[11px] font-bold tracking-[0.12em] uppercase',
                'cursor-pointer transition-opacity hover:opacity-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(74,139,248,0.6)]',
                'bg-[rgba(220,235,255,0.10)] text-[#EEF4FF] border border-[rgba(220,235,255,0.18)]',
              ].join(' ')}
            >
              View tournament →
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="font-mono text-[10px] tracking-[0.1em] uppercase"
        style={{ color: STADIUM.textMuted }}
      >
        {label}
      </div>
      <div
        className="font-display italic font-bold text-[20px] lg:text-[22px] mt-0.5"
        style={{ color: STADIUM.text }}
      >
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
  // Same month → "Jun 27–29"; different → "Jun 27 – Jul 2"
  const startDate = new Date(
    ...( start.split('-').map(Number) as [number, number, number])
  );
  const endDate = new Date(
    ...( end.split('-').map(Number) as [number, number, number])
  );
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
    BEACH: 'Beach',
    OTHER: 'Open',
  };
  return map[level] ?? level;
}
