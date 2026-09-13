'use client';

// Create-league form — auth-gated. name + game → createLeague + createContest
// → revalidate → redirect into the league.
//
// The game is chosen HERE (2026-08-27, Hunter): a league is created FOR a game.
// It used to be a bare name, with a separate "enter this league into another
// game" panel on the league page afterwards — which exposed the internal
// "contest" concept the IA plan says should stay hidden, and left every new
// league in an empty, unusable state until the commissioner found that panel.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import { createLeague, createContest, joinLeagueByCode, getLeagueContests } from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { friendlyJoinError } from '@/components/fantasy/play-menu';
import type { CompetitionId } from '@/lib/fantasy/competitions';
import { GAMES } from '@/lib/fantasy/games';

interface CreateLeagueFormProps {
  /** Preseeds the game picker (from the hub's ?game= query string). Only
   *  applied when it's a valid, LIVE game id — an invalid or coming-soon id
   *  from a malformed query string falls back to the default. */
  initialGameId?: CompetitionId;
}

export function CreateLeagueForm({ initialGameId }: CreateLeagueFormProps) {
  return (
    <AuthGate
      headline="Sign in to create or join a league."
      subhead="Leagues are free — start one for your friends, or join with an invite code."
    >
      {/* Create + join stacked so the hub's "Create or join a league" row
          lands on both (it used to offer create only). Spacing is tightened on
          mobile so the pair fits one phone screen without scrolling. */}
      <div className="max-w-[480px] flex flex-col gap-3">
        <Form initialGameId={initialGameId} />
        <JoinForm />
      </div>
    </AuthGate>
  );
}

// Only live games can be created against; the rest render dimmed/disabled so
// the roadmap is visible without allowing a create that has nowhere to go. No
// "soon" suffix — unavailability is carried by the disabled state alone
// (Hunter, 2026-09-08: no "beta"/"coming soon" wording anywhere in Fantasy).
const GAME_OPTIONS: PillSelectOption<CompetitionId>[] = GAMES.filter((g) => g.status !== 'hidden').map(
  (g) => ({
    value: g.id,
    label: g.name,
    disabled: g.status !== 'live',
  }),
);

const LIVE_GAME_IDS = new Set(GAMES.filter((g) => g.status === 'live').map((g) => g.id));

function Form({ initialGameId }: CreateLeagueFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState<CompetitionId>(
    initialGameId && LIVE_GAME_IDS.has(initialGameId) ? initialGameId : 'ufa',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 60 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const leagueId = await createLeague(trimmed);
      // The league exists either way; a contest failure must not strand the
      // user, so land them in the league and surface the problem there.
      const contestId = await createContest(leagueId, gameId, new Date().getFullYear()).catch(
        () => null,
      );
      await revalidateFantasyLeague(leagueId, contestId ?? undefined).catch(() => null);
      router.push(contestId ? `/fantasy/l/${contestId}` : `/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your league. Please try again.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-surface rounded-card shadow-card p-4 lg:p-6">
        <label
          htmlFor="league-name"
          className="block text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
        >
          League Name
        </label>
        <input
          id="league-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. The Huckin' Crew"
          className={[
            'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
            'font-tight text-[14px] text-ink placeholder:text-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'min-h-[44px]',
          ].join(' ')}
        />
        <p className="mt-1 text-[11px] text-faint font-tight">{trimmed.length}/60 characters</p>

        <div className="mt-4 lg:mt-5">
          <div className="block text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5">
            Game
          </div>
          <PillSelect
            value={gameId}
            onChange={setGameId}
            ariaLabel="Which game is this league for"
            options={GAME_OPTIONS}
          />
          <p className="mt-1.5 text-[11px] text-faint font-tight">
            Everyone in this league drafts and scores in this game.
          </p>
        </div>

        {error && (
          <div className="mt-4 px-4 py-3 rounded-card-sm bg-live/[0.08]">
            <span className="font-tight text-[13px] text-ink">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            'mt-4 lg:mt-5 inline-flex items-center justify-center gap-2',
            'px-6 py-3 rounded-full min-h-[44px] w-full sm:w-auto',
            'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            canSubmit
              ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
              : 'bg-ink/[0.08] text-faint cursor-not-allowed',
          ].join(' ')}
        >
          {saving && (
            <span
              className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
              aria-hidden="true"
            />
          )}
          {saving ? 'Creating…' : 'Create league'}
        </button>
      </div>
    </form>
  );
}

// Join by invite code — same flow as the hub's PlayMenu join sheet: join, then
// land in the league's first contest (or the league page if it has none).
function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = code.trim();
  const canJoin = trimmed.length > 0 && !joining;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canJoin) return;
    setJoining(true);
    setError(null);
    try {
      const leagueId = await joinLeagueByCode(trimmed);
      const contests = await getLeagueContests(leagueId).catch(() => []);
      router.push(contests[0] ? `/fantasy/l/${contests[0].id}` : `/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? friendlyJoinError(err.message) : 'Could not join with that code.');
      setJoining(false);
    }
  };

  return (
    <form onSubmit={handleJoin}>
      <div className="bg-surface rounded-card shadow-card p-4 lg:p-6">
        <label
          htmlFor="invite-code"
          className="block text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
        >
          Have an invite code?
        </label>
        <div className="flex gap-2">
          <input
            id="invite-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="e.g. FR0STY9"
            className={[
              'flex-1 min-w-0 px-3.5 py-2.5 rounded-card-sm bg-ink/5',
              'font-tight text-[16px] font-bold tracking-[0.08em] text-ink placeholder:text-faint placeholder:font-normal',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'min-h-[44px]',
            ].join(' ')}
          />
          <button
            type="submit"
            disabled={!canJoin}
            className={[
              'flex-shrink-0 inline-flex items-center justify-center gap-2',
              'px-5 rounded-full min-h-[44px]',
              'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
              'transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
              canJoin
                ? 'bg-ink text-bg hover:opacity-90 cursor-pointer'
                : 'bg-ink/[0.08] text-faint cursor-not-allowed',
            ].join(' ')}
          >
            {joining && (
              <span
                className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
                aria-hidden="true"
              />
            )}
            {joining ? 'Joining…' : 'Join'}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[12px] text-live font-tight">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
