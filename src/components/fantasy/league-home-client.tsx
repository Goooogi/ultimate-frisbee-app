'use client';

// League home — client island. Handles:
//   (a) contests list (links out to each game-scoped contest page)
//   (b) members + commissioner tools (invite/regenerate/remove/leave) — via
//       the shared LeagueMembersPanel (also used by the league-in-game page,
//       P1 2026-08-27, so a commissioner never has to leave the game context)
//
// The "enter this league into another game" panel was REMOVED 2026-08-27
// (Hunter): a league's game is chosen when the league is created, so the panel
// exposed the internal "contest" concept the IA plan says stays hidden and left
// new leagues empty until the commissioner found it. Flow is now: name + game
// → invite → league settings.
//
// The server page already rendered the public league/member/contest data —
// this component re-resolves "am I a member, what's my role" client-side and
// layers interactive controls on top without re-fetching the public lists.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { LeagueMembersPanel } from '@/components/fantasy/league-members-panel';
import { LeagueSettingsPanel } from '@/components/fantasy/league-settings-panel';
import {
  getMyLeagueRole,
  type FantasyLeagueSummary,
  type LeagueMember,
  type ContestView,
  type LeagueRole,
} from '@/lib/fantasy/leagues';

interface Props {
  league: FantasyLeagueSummary;
  members: LeagueMember[];
  contests: ContestView[];
}

export function LeagueHomeClient({ league, members, contests }: Props) {
  const { user } = useAuth();

  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setMyRole(null);
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    getMyLeagueRole(league.id)
      .then(setMyRole)
      .catch(() => setMyRole(null))
      .finally(() => setRoleLoading(false));
  }, [user, league.id]);

  const isCommissioner = myRole === 'commissioner';

  return (
    <div className="space-y-8">
      {/* ── Contests ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="contests-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2
            id="contests-heading"
            className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink"
          >
            Contests
          </h2>
        </div>

        {contests.length === 0 ? (
          <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
            <p className="text-muted font-tight text-[14px]">
              {isCommissioner
                ? "This league isn't in a game yet — that normally happens when the league is created."
                : 'This league isn’t in a game yet. Ask your commissioner.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
            <ul aria-label="League contests">
              {contests.map((c, idx) => (
                <li key={c.id}>
                  <Link
                    href={c.competition === 'ufa' ? `/fantasy/ufa/l/${c.id}` : `/fantasy/contests/${c.id}`}
                    className={[
                      'flex items-center gap-3 px-5 py-3.5',
                      'no-underline transition-colors duration-150',
                      'hover:bg-surface-hi',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      idx > 0 ? 'border-t border-hairline' : '',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="font-tight text-[14px] font-semibold text-ink truncate">
                        {c.name}
                      </span>
                      <span className="font-tight text-[11px] text-muted">
                        {c.competitionDef.shortLabel} · {c.seasonYear}
                      </span>
                    </span>
                    <StatusChip status={c.status} />
                    <ArrowGlyph />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Members + commissioner tools (shared with league-in-game) ──────── */}
      <LeagueMembersPanel leagueId={league.id} members={members} onLeaveRedirect="/fantasy" />

      {/* ── League settings (commissioner-only; renders null otherwise) ────── */}
      {!roleLoading && (
        <LeagueSettingsPanel
          leagueId={league.id}
          leagueName={league.name}
          contests={contests}
          isCommissioner={isCommissioner}
        />
      )}
    </div>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: ContestView['status'] }) {
  const tone =
    status === 'active'
      ? 'bg-accent text-accent-ink'
      : status === 'complete'
      ? 'bg-ink/5 text-ink/80'
      : 'bg-accent/10 text-accent';
  const label = status === 'active' ? 'Live' : status === 'complete' ? 'Final' : 'Open';
  return (
    <span className={`flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2.5 py-[5px] rounded-full ${tone}`}>
      {label}
    </span>
  );
}

function ArrowGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="flex-shrink-0 text-faint">
      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
