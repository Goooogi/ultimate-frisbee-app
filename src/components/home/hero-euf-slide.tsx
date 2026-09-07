// EUF hero slide — EventSlide layout matching the USAU/WFDF slides: solid
// league-color base, white radial glow top-right, grid [1.4fr_1fr] = left meta
// column / right ring-circle mark. Only reachable via a STARRED EUCS event
// today (the regular carousel has no EUF pick), so the pill defaults to the
// starred label. Hues mirror mobile's HeroEufSlide.
//
// Props come from EufEventCard (lib/euf/data). CTA links to /euf/events/{slug}.

import Link from 'next/link';
import type { EufEventCard } from '@/lib/euf/data';
import { HeroFieldLines } from './field-diagram';

const EUF_BG = '#2B2A6E';
const EUF_GLOW = 'rgba(139,135,240,0.40)';
const EUF_LINE = '#9A96F5';
const TEXT = '#FFFFFF';
const TEXT_MUTED = 'rgba(255,255,255,0.75)';

interface HeroEufSlideProps {
  event: EufEventCard;
  /** Eyebrow pill text. */
  pill?: string;
}

export function HeroEufSlide({ event, pill = 'EUF · EUCS' }: HeroEufSlideProps) {
  const dateRange = formatDateRange(event.startDate, event.endDate);

  return (
    <article
      className="relative h-full overflow-hidden px-5 sm:px-10 pt-[26px] sm:pt-[34px] pb-10 sm:pb-14 box-border"
      style={{ background: EUF_BG, color: TEXT }}
    >
      <div
        className="absolute -top-[40%] -right-[6%] w-[60%] h-[180%] pointer-events-none"
        style={{ background: `radial-gradient(circle at 60% 50%, ${EUF_GLOW}, transparent 62%)` }}
        aria-hidden="true"
      />
      <HeroFieldLines color="rgba(255,255,255,0.06)" accent={EUF_LINE} />

      <div className="relative h-full grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] items-center gap-6">
        <div className="flex flex-col justify-between h-full gap-4 sm:pl-8 lg:pl-12">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center font-sans text-[10.5px] font-bold tracking-[0.16em] uppercase px-2.5 py-[6px] rounded-full"
              style={{ color: '#fff', background: 'rgba(255,255,255,0.16)' }}
            >
              {pill}
            </span>
            <span className="font-mono text-[12px]" style={{ color: TEXT_MUTED }}>
              {event.kind}
              {event.location ? ` · ${event.location}` : ''}
            </span>
          </div>

          <div className="flex flex-col gap-3 my-1">
            <h2
              className="font-display italic font-bold leading-[0.92] tracking-[-0.03em] m-0"
              style={{ fontSize: 'clamp(28px, 5vw, 58px)', color: TEXT }}
            >
              {event.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 lg:flex-col lg:items-start lg:justify-end">
            <div className="flex flex-wrap gap-6 sm:gap-8">
              {dateRange && <DarkMeta label="Dates" value={dateRange} />}
              {event.teamCount > 0 && <DarkMeta label="Teams" value={String(event.teamCount)} />}
              {event.year > 0 && <DarkMeta label="Season" value={String(event.year)} />}
            </div>
            <Link
              href={`/euf/events/${event.slug}`}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-sans text-[12px] sm:text-[13px] font-bold cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(154,150,245,0.6)] bg-accent text-accent-ink"
            >
              View tournament →
            </Link>
          </div>
        </div>

        <div className="hidden lg:flex items-center justify-center">
          <div className="w-[168px] h-[168px] rounded-full bg-white/[0.14] border border-white/[0.22] flex items-center justify-center">
            <span className="w-[118px] h-[118px] rounded-full bg-white flex items-center justify-center overflow-hidden">
              <span className="font-display italic font-bold text-[34px] tracking-[-0.03em]" style={{ color: EUF_BG }}>
                EUF
              </span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

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

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const toLocal = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (iso: string) => toLocal(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!end || start === end) return fmt(start);
  const startDate = toLocal(start);
  const endDate = toLocal(end);
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${endDate.getDate()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
