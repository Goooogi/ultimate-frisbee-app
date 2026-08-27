'use client';

// League home — client island. Handles:
//   (a) contests list (links out to each game-scoped contest page)
//   (b) commissioner-only "New contest" section
//   (c) members + commissioner tools (invite/regenerate/remove/leave) — via
//       the shared LeagueMembersPanel (also used by the league-in-game page,
//       P1 2026-08-27, so a commissioner never has to leave the game context)
//
// The server page already rendered the public league/member/contest data —
// this component re-resolves "am I a member, what's my role" client-side (for
// the New Contest gate) and layers interactive controls on top without
// re-fetching the public lists.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import { LeagueMembersPanel } from '@/components/fantasy/league-members-panel';
import {
  getMyLeagueRole,
  createContest,
  type FantasyLeagueSummary,
  type LeagueMember,
  type ContestView,
  type LeagueRole,
} from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { getCompetition, type CompetitionId } from '@/lib/fantasy/competitions';
import { GAMES } from '@/lib/fantasy/games';

interface Props {
  league: FantasyLeagueSummary;
  members: LeagueMember[];
  contests: ContestView[];
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

export function LeagueHomeClient({ league, members, contests }: Props) {
  const { user, loading } = useAuth();

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
              No contests yet. {isCommissioner ? 'Add one below to get started.' : 'Ask your commissioner to add one.'}
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

      {/* ── Commissioner: New contest ────────────────────────────────────── */}
      {!loading && !roleLoading && isCommissioner && (
        <NewContestSection leagueId={league.id} existingContests={contests} />
      )}

      {/* ── Members + commissioner tools (shared with league-in-game) ──────── */}
      <LeagueMembersPanel leagueId={league.id} members={members} onLeaveRedirect="/fantasy" />
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

// ─── Enter another game (commissioner) ─────────────────────────────────────────
//
// Game-registry-driven (P1, 2026-08-27): options come from games.ts, not
// competitions.ts directly — only 'live' games are enterable, 'coming-soon'
// games render disabled with a tag so the roadmap is visible without letting
// the commissioner attempt a create that has nowhere to go yet (hidden games
// stay out of the list entirely, same as the hub). When the league already
// has a contest for the selected game+season, the DB's unique(league,
// competition, season) constraint is surfaced as an "Entered" state that
// links to the existing contest instead of letting the RPC/insert 23505 out
// to the user as a raw error.

function NewContestSection({
  leagueId,
  existingContests,
}: {
  leagueId: string;
  existingContests: ContestView[];
}) {
  const router = useRouter();
  // Hidden games (WFDF, pre-launch) never appear here — same policy as the hub.
  const games = GAMES.filter((g) => g.status !== 'hidden');
  const [gameId, setGameId] = useState<CompetitionId>(games[0]?.id ?? 'ufa');
  const [seasonYear, setSeasonYear] = useState<number>(CURRENT_YEAR);
  const [customName, setCustomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const game = games.find((g) => g.id === gameId);
  const def = getCompetition(gameId);
  const isLive = game?.status === 'live';
  const existing = existingContests.find(
    (c) => c.competition === gameId && c.seasonYear === seasonYear,
  );

  const options: PillSelectOption<CompetitionId>[] = games.map((g) => ({
    value: g.id,
    label: g.name.replace(/ Fantasy$/, ''),
    disabled: g.status !== 'live',
    hint: g.status === 'coming-soon' ? 'Soon' : undefined,
  }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLive || existing) return;
    setCreating(true);
    setError(null);
    try {
      const contestId = await createContest(leagueId, gameId, seasonYear, customName.trim() || undefined);
      await revalidateFantasyLeague(leagueId, contestId).catch(() => null);
      router.push(gameId === 'ufa' ? `/fantasy/ufa/l/${contestId}` : `/fantasy/contests/${contestId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the contest.');
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="new-contest-heading" className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <h2
        id="new-contest-heading"
        className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-4"
      >
        Enter this league into another game
      </h2>

      <div className="space-y-4 max-w-[480px]">
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Game
          </div>
          <PillSelect
            value={gameId}
            onChange={(v) => setGameId(v)}
            ariaLabel="Select a game"
            options={options}
          />
        </div>

        <div>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Season
          </div>
          <PillSelect
            value={seasonYear}
            onChange={(v) => setSeasonYear(v)}
            ariaLabel="Select a season year"
            options={YEAR_OPTIONS.map((y) => ({ value: y, label: String(y) }))}
          />
        </div>

        {!isLive ? (
          <p className="text-[12px] text-faint font-tight">
            {def?.label ?? game?.name} isn&apos;t open yet — check back once Hunter flips it on.
          </p>
        ) : existing ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <p className="text-[12px] text-muted font-tight flex-1">
              This league is already entered in {def?.label} {seasonYear}.
            </p>
            <Link
              href={gameId === 'ufa' ? `/fantasy/ufa/l/${existing.id}` : `/fantasy/contests/${existing.id}`}
              className={[
                'inline-flex items-center justify-center gap-2 flex-shrink-0',
                'px-5 py-2.5 rounded-full min-h-[44px]',
                'bg-ink/5 text-ink font-tight text-[12px] font-bold tracking-[0.08em] uppercase',
                'hover:bg-ink/10 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              Entered · View
            </Link>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                htmlFor="contest-name"
                className="block text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
              >
                Contest name <span className="normal-case font-medium text-faint/80">· optional</span>
              </label>
              <input
                id="contest-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={60}
                placeholder={def ? `${def.label} ${seasonYear}` : ''}
                className={[
                  'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
                  'font-tight text-[14px] text-ink placeholder:text-faint',
                  'focus:outline-none focus:ring-2 focus:ring-accent',
                  'min-h-[44px]',
                ].join(' ')}
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-card-sm bg-live/[0.08]">
                <span className="font-tight text-[13px] text-ink">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={creating}
              className={[
                'inline-flex items-center justify-center gap-2',
                'px-6 py-3 rounded-full min-h-[44px] w-full sm:w-auto',
                'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
                'transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                creating
                  ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
                  : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
              ].join(' ')}
            >
              {creating && (
                <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />
              )}
              {creating ? 'Creating…' : 'Enter this game'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
