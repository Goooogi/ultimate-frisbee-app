// WFDF hero slide — Worlds tournament card (not a single game).
// Mirrors HeroUsauSlide's dark-stadium feel: dark base, accent bits, chalk
// field lines, big display type. Per-league accent: WFDF teal.
//
// Props come from WfdfEventCard (lib/wfdf/data) — name, dates, location, teams.
// CTA links to /wfdf/events/{slug}.

import Link from 'next/link';
import type { WfdfEventCard } from '@/lib/wfdf/data';
import { HeroFieldLines } from './field-diagram';

const STADIUM = {
  bg: '#07201F',
  line: 'rgba(214,245,240,0.06)',
  text: '#EAFBF7',
  textMuted: 'rgba(214,245,240,0.55)',
};
// WFDF-specific accent: teal (distinct from USAU royal blue).
const WFDF_ACCENT = '#12B3A6';
const WFDF_ACCENT_LIGHT = '#3FD9C9';

interface HeroWfdfSlideProps {
  event: WfdfEventCard;
}

const KIND_LABEL: Record<string, string> = {
  club: 'Club Worlds',
  national: 'National Teams',
  masters: 'Masters Worlds',
  beach: 'Beach Worlds',
  junior: 'Junior Worlds',
  u24: 'U24 Worlds',
  other: 'World Championship',
};

export function HeroWfdfSlide({ event }: HeroWfdfSlideProps) {
  const dateRange = formatDateRange(event.startDate, event.endDate);
  const kindLabel = KIND_LABEL[event.kind] ?? 'World Championship';
  const slug = event.slug;

  const background = [
    'linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.06) 42%, rgba(0,0,0,0.44) 100%)',
    `radial-gradient(130% 140% at 80% 20%, rgba(18,179,166,0.5) 0%, transparent 58%)`,
    `radial-gradient(80% 100% at 0% 80%, rgba(6,40,38,0.72) 0%, transparent 60%)`,
    STADIUM.bg,
  ].join(', ');

  return (
    <article
      className="relative overflow-hidden p-5 sm:p-9 h-full flex flex-col justify-between"
      style={{ background, color: STADIUM.text }}
    >
      {/* Corner glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 90% 5%, rgba(63,217,201,0.22), transparent 60%)',
        }}
        aria-hidden="true"
      />
      <HeroFieldLines color={STADIUM.line} accent={WFDF_ACCENT_LIGHT} />

      <div className="relative flex-1 flex flex-col justify-between gap-5">
        {/* Eyebrow */}
        <div>
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: WFDF_ACCENT_LIGHT, boxShadow: `0 0 0 3px rgba(63,217,201,0.22)` }}
            />
            <span
              className="font-mono text-[11px] font-bold tracking-[0.14em]"
              style={{ color: WFDF_ACCENT_LIGHT }}
            >
              WFDF WORLDS
            </span>
          </div>
          <div
            className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase"
            style={{ color: STADIUM.textMuted }}
          >
            {kindLabel}
            {event.location ? ` · ${event.location}` : ''}
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
        </div>

        {/* Footer: stats + CTA */}
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div className="flex flex-wrap gap-7">
            {dateRange && <StatMini label="Dates" value={dateRange} />}
            {event.teamCount > 0 && <StatMini label="Teams" value={String(event.teamCount)} />}
            {event.year > 0 && <StatMini label="Year" value={String(event.year)} />}
          </div>
          <div className="flex gap-2.5">
            <Link
              href={`/wfdf/events/${slug}`}
              className={[
                'inline-flex items-center gap-2 px-4 py-2.5',
                'font-sans text-[11px] font-bold tracking-[0.12em] uppercase',
                'cursor-pointer transition-opacity hover:opacity-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(63,217,201,0.6)]',
                'bg-[rgba(214,245,240,0.10)] text-[#EAFBF7] border border-[rgba(214,245,240,0.18)]',
              ].join(' ')}
            >
              View championship →
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

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  if (!end || start === end) return fmt(start);
  const startDate = new Date(...(start.split('-').map(Number) as [number, number, number]));
  const endDate = new Date(...(end.split('-').map(Number) as [number, number, number]));
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${endDate.getDate()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
