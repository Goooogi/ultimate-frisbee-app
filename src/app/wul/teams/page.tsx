// /wul/teams — Western Ultimate League teams (static, teams-only).
// Players, scores, and schedule are deferred (no WUL public API exists).
// Server component; no data fetching needed — all data is static.

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { allWulTeams, type WulTeamMeta } from '@/lib/wul/teams';

export const metadata: Metadata = {
  title: 'WUL Teams · The Layout',
  description: 'The 8 Western Ultimate League franchises for the 2026 season.',
};

export default function WulTeamsPage() {
  const teams = allWulTeams();

  return (
    <PageShell
      title="Teams"
      eyebrow="WUL · Western Ultimate League"
      // Suppress the UFA/USAU league switcher — WUL is a standalone section.
      topNavSlot={<span />}
    >
      {/* Coming-soon notice — honest about what's missing */}
      <div className="mb-6 px-4 py-3 border border-hairline bg-surface rounded-md flex items-start gap-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="flex-shrink-0 mt-0.5 text-muted"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
          <line x1="8" y1="5.5" x2="8" y2="8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="10.5" r="0.7" fill="currentColor" />
        </svg>
        <p className="text-[12px] text-muted font-tight leading-relaxed">
          <span className="font-bold text-ink">Teams only for now.</span>{' '}
          WUL player stats, scores, and schedules are coming once the league&apos;s API is available.
        </p>
      </div>

      {/* Team grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </div>
    </PageShell>
  );
}

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: WulTeamMeta }) {
  return (
    <div className="flex flex-col items-center gap-3 bg-surface border border-border p-4 rounded-md">
      <WulTeamLogo team={team} size={56} />
      <div className="text-center min-w-0 w-full">
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight truncate">
          {team.city}
        </p>
        <p className="text-[15px] font-bold font-tight text-ink leading-tight truncate mt-0.5">
          {team.name}
        </p>
        {team.founded && (
          <p className="text-[10px] text-faint font-tight mt-1">
            Est. {team.founded}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── WUL team logo / monogram ─────────────────────────────────────────────────
// Renders a real <img> when a logo path is present, otherwise a colored
// square with the team's abbreviation (same pattern as TeamLogo in /teams).

interface WulTeamLogoProps {
  team: WulTeamMeta;
  size?: number;
}

function WulTeamLogo({ team, size = 40 }: WulTeamLogoProps) {
  const hasLogo = Boolean(team.logo);

  if (hasLogo) {
    return (
      // White tile so the logo reads cleanly on both field + broadcast themes.
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-md bg-white border border-[rgb(var(--ink)/0.08)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={team.logo}
          alt=""
          className="object-contain"
          style={{ width: size * 0.84, height: size * 0.84 }}
        />
      </span>
    );
  }

  // Monogram fallback — team primary bg, accent overlay, white abbr text.
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-md"
      style={{ width: size, height: size, background: team.primary }}
      aria-hidden="true"
    >
      {/* Subtle accent overlay — same depth as TeamLogo */}
      <span
        className="absolute inset-0"
        style={{ background: team.accent, opacity: 0.15 }}
      />
      <span
        className="relative z-10 font-display font-bold"
        style={{
          color: '#fff',
          fontSize: Math.max(9, size * 0.33),
          letterSpacing: '0.04em',
        }}
      >
        {team.abbr}
      </span>
    </span>
  );
}
