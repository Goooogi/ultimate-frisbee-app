'use client';

// Draft Room — shared client island rendered by both draft routes
// (/fantasy/ufa/l/[id]/draft and /fantasy/contests/[id]/draft). Draft state
// comes exclusively from src/lib/fantasy/draft-room.ts (the frozen backend
// contract — P2, 2026-08-27); nothing here talks to fantasy_drafts /
// fantasy_draft_picks / fantasy_draft_queues directly.
//
// State machine (draft.status, from the contract):
//   scheduled → lobby: countdown to scheduledAt (or "starts whenever"), queue
//     building enabled, commissioner sees Start Now once past scheduledAt.
//   live → the room: pick clock, board/players/queue/picks tabs, my-team
//     on-the-clock banner + document.title prefix.
//   complete → summary: each team's haul + links to standings/team views.
//
// Clock resolution: any open client can call resolveDraftClock() when the
// countdown hits 0 — server-side first-caller-wins, so no coordination is
// needed beyond a small random jitter to avoid every open tab firing at once.
//
// Realtime: subscribeDraft() refetches getDraft + getDraftPicks on any pick
// insert or draft-row update; also refetches on window focus (tab was
// backgrounded through a pick). Queue is loaded once (owner-private) and
// saved via a debounced saveDraftQueue call.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { FloatingTabBar, type FloatingTab } from '@/components/floating-tab-bar';
import { getMyLeagueRole } from '@/lib/fantasy/leagues';
import {
  getDraft,
  getDraftPicks,
  getMyDraftQueue,
  startDraft,
  makeDraftPick,
  resolveDraftClock,
  saveDraftQueue,
  subscribeDraft,
  teamOnClock,
  roundOf,
  type Draft,
  type DraftPick,
  type DraftRef,
} from '@/lib/fantasy/draft-room';
import { searchContestPlayers } from '@/lib/fantasy/draft';
import { getMyContestTeam, type ContestView } from '@/lib/fantasy/leagues';
import type { FantasyPlayerHit } from '@/lib/fantasy/data';

interface TeamInfo {
  id: string;
  teamName: string;
  ownerDisplayName: string | null;
  ownerUsername: string | null;
}

interface Props {
  contest: ContestView;
  /** Every team in this contest — needed to render names on the board/ticker
   *  and to resolve "team on the clock" to a display name. */
  teams: TeamInfo[];
  /** Where "back" / standings / team links point — differs between the UFA
   *  canonical route and the generic contest route. */
  basePath: string;
}

type RoomTab = 'players' | 'board' | 'queue' | 'picks';

export function DraftRoom({ contest, teams, basePath }: Props) {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [myTeam, setMyTeam] = useState<TeamInfo | null>(null);
  const [queue, setQueue] = useState<DraftRef[]>([]);
  const [tab, setTab] = useState<RoomTab>('players');
  const [isCommissioner, setIsCommissioner] = useState(false);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const draftedByKey = useMemo(
    () => new Map(picks.map((p) => [`${p.playerLeague}:${p.playerId}`, p.teamId])),
    [picks],
  );

  const refetch = useCallback(async () => {
    try {
      const d = await getDraft(contest.id);
      setDraft(d);
      setPicks(d ? await getDraftPicks(d.id) : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the draft.');
    }
  }, [contest.id]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDraft(contest.id)
      .then(async (d) => {
        if (cancelled) return;
        setDraft(d);
        if (d) setPicks(await getDraftPicks(d.id));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the draft.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  // ── My team ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setMyTeam(null);
      return;
    }
    getMyContestTeam(contest.id)
      .then((t) => setMyTeam(t ? teamById.get(t.id) ?? { ...t, ownerDisplayName: null, ownerUsername: null } : null))
      .catch(() => setMyTeam(null));
  }, [user, contest.id, teamById]);

  // ── My queue (owner-private) ────────────────────────────────────────────
  useEffect(() => {
    if (!draft || !myTeam) {
      setQueue([]);
      return;
    }
    getMyDraftQueue(draft.id)
      .then(setQueue)
      .catch(() => setQueue([]));
  }, [draft?.id, myTeam?.id]);

  // ── Commissioner role (drives the lobby's Start Now button) ─────────────
  useEffect(() => {
    if (!user || !contest.leagueId) {
      setIsCommissioner(false);
      return;
    }
    getMyLeagueRole(contest.leagueId)
      .then((role) => setIsCommissioner(role === 'commissioner'))
      .catch(() => setIsCommissioner(false));
  }, [user, contest.leagueId]);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!draft) return;
    const channel = subscribeDraft(draft.id, () => {
      refetch();
    });
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => {
      channel.unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  // ── On-the-clock title prefix ────────────────────────────────────────────
  const onClockTeamId = draft && draft.status === 'live' ? teamOnClock(draft) : null;
  const isMyClock = !!myTeam && onClockTeamId === myTeam.id;
  useEffect(() => {
    const original = document.title;
    if (isMyClock) document.title = `● Your pick — ${original.replace(/^● Your pick — /, '')}`;
    return () => {
      document.title = original.replace(/^● Your pick — /, '');
    };
  }, [isMyClock]);

  if (loading) return <RoomSkeleton />;

  if (loadError || !draft) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <p className="text-muted font-tight text-[14px]">
          {loadError ?? 'No draft is scheduled for this league yet.'}
        </p>
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 mt-4 text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          Back to league
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {draft.status === 'scheduled' && (
        <LobbyPanel
          draft={draft}
          teams={teams}
          isCommissioner={isCommissioner}
          onStarted={refetch}
        />
      )}

      {draft.status === 'live' && (
        <LiveRoom
          contest={contest}
          draft={draft}
          picks={picks}
          teams={teams}
          teamById={teamById}
          draftedByKey={draftedByKey}
          myTeam={myTeam}
          isMyClock={isMyClock}
          queue={queue}
          setQueue={setQueue}
          tab={tab}
          setTab={setTab}
          onRequireAuth={() => setAuthOpen(true)}
          refetch={refetch}
        />
      )}

      {draft.status === 'complete' && (
        <CompletePanel draft={draft} picks={picks} teams={teams} basePath={basePath} />
      )}

      <AuthModal
        open={authOpen}
        dismissible
        initialMode="signin"
        onDismiss={() => setAuthOpen(false)}
        headline="Sign in to draft"
        subhead="You need a team in this league to make picks."
      />
    </div>
  );
}

// ─── Lobby (scheduled) ────────────────────────────────────────────────────────

function LobbyPanel({
  draft,
  teams,
  isCommissioner,
  onStarted,
}: {
  draft: Draft;
  teams: TeamInfo[];
  isCommissioner: boolean;
  onStarted: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(draft.scheduledAt);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      await startDraft(draft.id);
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the draft.');
    } finally {
      setStarting(false);
    }
  };

  const orderKnown = draft.draftOrder.length > 0;

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8 text-center">
      <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-accent mb-2 font-tight">
        Draft lobby
      </div>
      <h2 className="font-display italic text-[28px] lg:text-[34px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-3">
        {draft.scheduledAt ? countdown : 'Starts whenever the commissioner is ready'}
      </h2>
      <p className="text-muted font-tight text-[13px] mb-6">
        Snake draft &middot; {draft.rounds} rounds &middot; {draft.pickSeconds}s pick clock
        {orderKnown ? ' — order is locked.' : ' — order is randomized when the draft goes live.'}
      </p>

      {orderKnown && (
        <ol className="max-w-sm mx-auto mb-6 space-y-1.5 text-left">
          {draft.draftOrder.map((teamId, idx) => (
            <li
              key={teamId}
              className="flex items-center gap-3 px-3.5 py-2 rounded-card-sm bg-ink/[0.04]"
            >
              <span className="font-tight text-[12px] font-bold text-faint tabular w-5 text-right">{idx + 1}</span>
              <span className="font-tight text-[13px] font-semibold text-ink truncate">
                {teams.find((t) => t.id === teamId)?.teamName ?? 'Team'}
              </span>
            </li>
          ))}
        </ol>
      )}

      {isCommissioner && (
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className={[
            'inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full min-h-[44px]',
            'bg-accent text-accent-ink font-tight text-[13px] font-bold tracking-[0.08em] uppercase',
            'hover:opacity-90 transition-opacity duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          ].join(' ')}
        >
          {starting ? 'Starting…' : 'Start now'}
        </button>
      )}
      {error && <p className="mt-3 text-[12px] text-live font-tight" role="alert">{error}</p>}

      <p className="mt-6 text-[11px] text-faint font-tight">
        Queue your favorite players below while you wait — the PLAYERS tab is open now.
      </p>
    </div>
  );
}

function useCountdown(iso: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return '';
  const target = new Date(iso).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) return 'Starting soon';
  const totalSec = Math.floor(diffMs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ─── Live room ────────────────────────────────────────────────────────────────

function LiveRoom({
  contest,
  draft,
  picks,
  teams,
  teamById,
  draftedByKey,
  myTeam,
  isMyClock,
  queue,
  setQueue,
  tab,
  setTab,
  onRequireAuth,
  refetch,
}: {
  contest: ContestView;
  draft: Draft;
  picks: DraftPick[];
  teams: TeamInfo[];
  teamById: Map<string, TeamInfo>;
  draftedByKey: Map<string, string>;
  myTeam: TeamInfo | null;
  isMyClock: boolean;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  tab: RoomTab;
  setTab: (t: RoomTab) => void;
  onRequireAuth: () => void;
  refetch: () => void;
}) {
  const onClockTeamId = teamOnClock(draft);
  const onClockTeam = onClockTeamId ? teamById.get(onClockTeamId) : null;
  const round = roundOf(draft.currentOverall, draft.draftOrder.length);

  // ── Clock: resolve when expired, jittered so simultaneous clients don't
  // stampede the RPC — the server no-ops for every caller after the first,
  // so this only shaves a bit of redundant traffic. ──
  const resolvedRef = useRef(false);
  const remainingMs = useClockRemaining(draft.currentStartedAt, draft.pickSeconds);
  useEffect(() => {
    resolvedRef.current = false;
  }, [draft.currentOverall, draft.currentStartedAt]);
  useEffect(() => {
    if (remainingMs === null || remainingMs > 0 || resolvedRef.current) return;
    resolvedRef.current = true;
    const jitter = 200 + Math.random() * 800;
    const t = setTimeout(() => {
      resolveDraftClock(draft.id).then(refetch).catch(() => {});
    }, jitter);
    return () => clearTimeout(t);
  }, [remainingMs, draft.id, refetch]);

  const tabs: FloatingTab[] = [
    { id: 'players', label: 'Players', icon: PlayersIcon },
    { id: 'board', label: 'Board', icon: BoardIcon },
    { id: 'queue', label: 'Queue', icon: QueueIcon },
    { id: 'picks', label: 'Picks', icon: PicksIcon },
  ];

  return (
    <div>
      {/* Header strip */}
      <div
        className={[
          'bg-surface rounded-card-lg shadow-card p-4 lg:p-5 mb-6',
          isMyClock ? 'ring-2 ring-accent' : '',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-1">
              R{round} &middot; Pick {draft.currentOverall}
            </div>
            <div className="font-tight text-[16px] font-bold text-ink truncate">
              {isMyClock ? "You're on the clock" : `${onClockTeam?.teamName ?? 'Team'} is on the clock`}
            </div>
          </div>
          <ClockDial remainingMs={remainingMs} pickSeconds={draft.pickSeconds} urgent={isMyClock} />
        </div>
      </div>

      {/* Desktop: board left (2/3) + rail right. Mobile: tabs. */}
      <div className="lg:hidden">
        {tab === 'players' && (
          <PlayersPanel
            contest={contest}
            draft={draft}
            draftedByKey={draftedByKey}
            teamById={teamById}
            myTeam={myTeam}
            isMyClock={isMyClock}
            queue={queue}
            setQueue={setQueue}
            onRequireAuth={onRequireAuth}
            refetch={refetch}
          />
        )}
        {tab === 'board' && <BoardPanel draft={draft} picks={picks} teams={teams} />}
        {tab === 'queue' && (
          <QueuePanel draft={draft} myTeam={myTeam} queue={queue} setQueue={setQueue} onRequireAuth={onRequireAuth} />
        )}
        {tab === 'picks' && <PicksPanel picks={picks} teamById={teamById} />}
        <div className="h-4" />
        <FloatingTabBar tabs={tabs} activeId={tab} onChange={(id) => setTab(id as RoomTab)} ariaLabel="Draft room sections" />
      </div>

      <div className="hidden lg:grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <BoardPanel draft={draft} picks={picks} teams={teams} />
        </div>
        <div>
          <DesktopRail
            contest={contest}
            draft={draft}
            draftedByKey={draftedByKey}
            teamById={teamById}
            myTeam={myTeam}
            isMyClock={isMyClock}
            queue={queue}
            setQueue={setQueue}
            picks={picks}
            onRequireAuth={onRequireAuth}
            refetch={refetch}
          />
        </div>
      </div>
    </div>
  );
}

function DesktopRail(props: {
  contest: ContestView;
  draft: Draft;
  draftedByKey: Map<string, string>;
  teamById: Map<string, TeamInfo>;
  myTeam: TeamInfo | null;
  isMyClock: boolean;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  picks: DraftPick[];
  onRequireAuth: () => void;
  refetch: () => void;
}) {
  const [railTab, setRailTab] = useState<'players' | 'queue' | 'picks'>('players');
  return (
    <div>
      <div className="flex gap-1 mb-4 bg-ink/[0.04] rounded-full p-1">
        {(['players', 'queue', 'picks'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setRailTab(id)}
            className={[
              'flex-1 px-3 py-2 rounded-full font-tight text-[11px] font-bold tracking-[0.08em] uppercase transition-colors duration-150 cursor-pointer',
              railTab === id ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {id}
          </button>
        ))}
      </div>
      {railTab === 'players' && (
        <PlayersPanel
          contest={props.contest}
          draft={props.draft}
          draftedByKey={props.draftedByKey}
          teamById={props.teamById}
          myTeam={props.myTeam}
          isMyClock={props.isMyClock}
          queue={props.queue}
          setQueue={props.setQueue}
          onRequireAuth={props.onRequireAuth}
          refetch={props.refetch}
        />
      )}
      {railTab === 'queue' && (
        <QueuePanel
          draft={props.draft}
          myTeam={props.myTeam}
          queue={props.queue}
          setQueue={props.setQueue}
          onRequireAuth={props.onRequireAuth}
        />
      )}
      {railTab === 'picks' && <PicksPanel picks={props.picks} teamById={props.teamById} />}
    </div>
  );
}

function useClockRemaining(startedAt: string | null, pickSeconds: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  const deadline = new Date(startedAt).getTime() + pickSeconds * 1000;
  return deadline - now;
}

function ClockDial({ remainingMs, pickSeconds, urgent }: { remainingMs: number | null; pickSeconds: number; urgent: boolean }) {
  const sec = remainingMs === null ? pickSeconds : Math.max(0, Math.ceil(remainingMs / 1000));
  const low = sec <= 10;
  return (
    <div
      className={[
        'flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-full font-tight text-[20px] font-bold tabular',
        low ? 'bg-live/10 text-live' : urgent ? 'bg-accent/10 text-accent' : 'bg-ink/5 text-ink',
      ].join(' ')}
      aria-label={`${sec} seconds remaining`}
    >
      {sec}
    </div>
  );
}

// ─── Players panel ──────────────────────────────────────────────────────────

function PlayersPanel({
  contest,
  draft,
  draftedByKey,
  teamById,
  myTeam,
  isMyClock,
  queue,
  setQueue,
  onRequireAuth,
  refetch,
}: {
  contest: ContestView;
  draft: Draft;
  draftedByKey: Map<string, string>;
  teamById: Map<string, TeamInfo>;
  myTeam: TeamInfo | null;
  isMyClock: boolean;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  onRequireAuth: () => void;
  refetch: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FantasyPlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const league = contest.competitionDef.playerLeague;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchContestPlayers(contest, query, 30);
        setResults(hits);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, contest.id]);

  const handleDraft = async (hit: FantasyPlayerHit) => {
    if (!myTeam) {
      onRequireAuth();
      return;
    }
    setPickingId(hit.playerId);
    setPickError(null);
    try {
      await makeDraftPick(draft.id, { playerLeague: league, playerId: hit.playerId, playerName: hit.fullName });
      refetch();
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not make that pick.');
    } finally {
      setPickingId(null);
    }
  };

  const handleQueue = (hit: FantasyPlayerHit) => {
    const ref: DraftRef = { playerLeague: league, playerId: hit.playerId, playerName: hit.fullName };
    if (queue.some((q) => q.playerId === ref.playerId && q.playerLeague === ref.playerLeague)) return;
    const next = [...queue, ref];
    setQueue(next);
    saveDraftQueue(draft.id, next).catch(() => {});
  };

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-4 lg:p-5">
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          aria-label="Search players"
          className={[
            'flex-1 min-w-0 px-3.5 py-2.5 rounded-card-sm bg-ink/5',
            'font-tight text-[14px] text-ink placeholder:text-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'min-h-[44px]',
          ].join(' ')}
        />
      </div>

      {pickError && (
        <p role="alert" className="mb-3 text-[12px] text-live font-tight">
          {pickError}
        </p>
      )}

      {query.trim().length < 2 ? (
        <p className="text-faint font-tight text-[13px] py-6 text-center">
          Search the player pool to draft or queue someone.
        </p>
      ) : searching ? (
        <PlayerListSkeleton />
      ) : results.length === 0 ? (
        <p className="text-faint font-tight text-[13px] py-6 text-center">No players found.</p>
      ) : (
        <ul className="space-y-1.5">
          {results.map((hit) => {
            const key = `${league}:${hit.playerId}`;
            const draftedTeamId = draftedByKey.get(key) ?? null;
            return (
              <PlayerRow
                key={hit.playerId}
                hit={hit}
                drafted={draftedTeamId !== null}
                draftedTeamName={draftedTeamId ? teamById.get(draftedTeamId)?.teamName ?? null : null}
                queued={queue.some((q) => q.playerId === hit.playerId && q.playerLeague === league)}
                canDraft={isMyClock && !!myTeam}
                picking={pickingId === hit.playerId}
                onDraft={() => handleDraft(hit)}
                onQueue={() => handleQueue(hit)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlayerRow({
  hit,
  drafted,
  draftedTeamName,
  queued,
  canDraft,
  picking,
  onDraft,
  onQueue,
}: {
  hit: FantasyPlayerHit;
  drafted: boolean;
  draftedTeamName: string | null;
  queued: boolean;
  canDraft: boolean;
  picking: boolean;
  onDraft: () => void;
  onQueue: () => void;
}) {
  return (
    <li
      className={[
        'flex items-center gap-2 px-3 py-2.5 rounded-card-sm',
        drafted ? 'opacity-45' : 'hover:bg-surface-hi transition-colors duration-150',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="font-tight text-[13.5px] font-semibold text-ink truncate">{hit.fullName}</div>
        <div className="font-tight text-[11px] text-muted truncate">
          {drafted ? (draftedTeamName ? `Drafted — ${draftedTeamName}` : 'Drafted') : hit.teamName ?? ' '}
        </div>
      </div>
      {!drafted && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={onQueue}
            disabled={queued}
            aria-label={queued ? `${hit.fullName} is queued` : `Queue ${hit.fullName}`}
            className={[
              'flex items-center justify-center w-9 h-9 rounded-full',
              'transition-colors duration-150',
              queued ? 'text-accent bg-accent/10 cursor-default' : 'text-faint hover:text-ink hover:bg-ink/10 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            <QueueGlyph filled={queued} />
          </button>
          <button
            type="button"
            onClick={onDraft}
            disabled={!canDraft || picking}
            className={[
              'px-3.5 py-2 rounded-full min-h-[36px] font-tight text-[11px] font-bold tracking-[0.08em] uppercase transition-all duration-150',
              canDraft
                ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
                : 'bg-ink/[0.06] text-faint cursor-not-allowed',
            ].join(' ')}
          >
            {picking ? '…' : 'Draft'}
          </button>
        </div>
      )}
    </li>
  );
}

function QueueGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {filled ? (
        <path d="M8 2l1.6 3.9 4.2.4-3.2 2.8.9 4.1L8 11.1l-3.5 2.1.9-4.1-3.2-2.8 4.2-.4L8 2z" fill="currentColor" />
      ) : (
        <path
          d="M8 2l1.6 3.9 4.2.4-3.2 2.8.9 4.1L8 11.1l-3.5 2.1.9-4.1-3.2-2.8 4.2-.4L8 2z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function PlayerListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-11 rounded-card-sm bg-ink/[0.06] animate-pulse" aria-hidden="true" />
      ))}
    </div>
  );
}

// ─── Board panel ────────────────────────────────────────────────────────────

function BoardPanel({ draft, picks, teams }: { draft: Draft; picks: DraftPick[]; teams: TeamInfo[] }) {
  const n = draft.draftOrder.length;
  if (n === 0) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
        <p className="text-muted font-tight text-[13px]">Board fills in once the draft order is set.</p>
      </div>
    );
  }
  const pickByOverall = new Map(picks.map((p) => [p.overall, p]));
  const orderedTeams = draft.draftOrder.map((id) => teams.find((t) => t.id === id));

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface px-3 py-2.5 text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight text-left border-b border-hairline">
                Rd
              </th>
              {orderedTeams.map((t, i) => (
                <th
                  key={t?.id ?? i}
                  className="px-3 py-2.5 text-[10px] font-bold tracking-[0.1em] uppercase text-faint font-tight text-left border-b border-hairline whitespace-nowrap"
                >
                  {t?.teamName ?? 'Team'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: draft.rounds }, (_, r) => r + 1).map((round) => {
              const snakeReversed = (round - 1) % 2 === 1;
              return (
                <tr key={round}>
                  <td className="sticky left-0 bg-surface px-3 py-2 text-[11px] font-bold text-faint tabular border-b border-hairline">
                    {round}
                  </td>
                  {orderedTeams.map((t, colIdx) => {
                    const posInRound = snakeReversed ? n - 1 - colIdx : colIdx;
                    const overall = (round - 1) * n + posInRound + 1;
                    const pick = pickByOverall.get(overall);
                    const isCurrent = overall === draft.currentOverall && draft.status === 'live';
                    return (
                      <td
                        key={t?.id ?? colIdx}
                        className={[
                          'px-3 py-2 border-b border-hairline align-top',
                          isCurrent ? 'bg-accent/10' : '',
                        ].join(' ')}
                      >
                        {pick ? (
                          <div className="min-w-0">
                            <div className="font-tight text-[12px] font-semibold text-ink truncate">
                              {pick.playerName}
                              {pick.auto && <span className="text-faint font-normal"> (auto)</span>}
                            </div>
                          </div>
                        ) : isCurrent ? (
                          <span className="font-tight text-[11px] font-bold text-accent">On clock</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Queue panel ────────────────────────────────────────────────────────────

function QueuePanel({
  draft,
  myTeam,
  queue,
  setQueue,
  onRequireAuth,
}: {
  draft: Draft;
  myTeam: TeamInfo | null;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  onRequireAuth: () => void;
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: DraftRef[]) => {
      setQueue(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDraftQueue(draft.id, next).catch(() => {});
      }, 400);
    },
    [draft.id, setQueue],
  );

  if (!myTeam) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
        <p className="text-muted font-tight text-[13px] mb-3">Sign in with a team in this league to build a queue.</p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
        <p className="text-muted font-tight text-[13px]">
          Your queue is empty. Add players from the PLAYERS tab — the top of your queue is what autopick takes if your clock expires.
        </p>
      </div>
    );
  }

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...queue];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next);
  };

  const remove = (idx: number) => {
    const next = queue.filter((_, i) => i !== idx);
    persist(next);
  };

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      <ul aria-label="Your draft queue">
        {queue.map((entry, idx) => (
          <li
            key={`${entry.playerLeague}:${entry.playerId}`}
            className={['flex items-center gap-2 px-4 py-3', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
          >
            <span className="font-tight text-[11px] font-bold text-faint tabular w-5">{idx + 1}</span>
            <span className="flex-1 min-w-0 font-tight text-[13.5px] font-semibold text-ink truncate">
              {entry.playerName}
            </span>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label={`Move ${entry.playerName} up`}
                className="flex items-center justify-center w-9 h-9 rounded-full text-faint hover:text-ink hover:bg-ink/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ArrowIcon dir="up" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === queue.length - 1}
                aria-label={`Move ${entry.playerName} down`}
                className="flex items-center justify-center w-9 h-9 rounded-full text-faint hover:text-ink hover:bg-ink/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ArrowIcon dir="down" />
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label={`Remove ${entry.playerName} from queue`}
                className="flex items-center justify-center w-9 h-9 rounded-full text-faint hover:text-live hover:bg-live/10 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <XIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArrowIcon({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={dir === 'down' ? 'rotate-180' : ''}>
      <path d="M2.5 7.5L6 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ─── Picks panel (reverse-chron ticker) ────────────────────────────────────

function PicksPanel({ picks, teamById }: { picks: DraftPick[]; teamById: Map<string, TeamInfo> }) {
  if (picks.length === 0) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
        <p className="text-muted font-tight text-[13px]">No picks yet.</p>
      </div>
    );
  }
  const reversed = [...picks].sort((a, b) => b.overall - a.overall);
  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      <ul aria-label="Pick history">
        {reversed.map((p, idx) => (
          <li
            key={p.overall}
            className={['flex items-center gap-3 px-4 py-3', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
          >
            <span className="font-tight text-[11px] font-bold text-faint tabular w-9 flex-shrink-0">#{p.overall}</span>
            <div className="min-w-0 flex-1">
              <div className="font-tight text-[13.5px] font-semibold text-ink truncate">
                {p.playerName}
                {p.auto && <span className="text-faint font-normal"> (auto)</span>}
              </div>
              <div className="font-tight text-[11px] text-muted truncate">
                {teamById.get(p.teamId)?.teamName ?? 'Team'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Complete panel ──────────────────────────────────────────────────────────

function CompletePanel({
  draft,
  picks,
  teams,
  basePath,
}: {
  draft: Draft;
  picks: DraftPick[];
  teams: TeamInfo[];
  basePath: string;
}) {
  const byTeam = new Map<string, DraftPick[]>();
  for (const p of picks) {
    const arr = byTeam.get(p.teamId) ?? [];
    arr.push(p);
    byTeam.set(p.teamId, arr);
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8 text-center">
        <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-accent mb-2 font-tight">
          Draft complete
        </div>
        <h2 className="font-display italic text-[26px] lg:text-[30px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-4">
          {draft.rounds} rounds &middot; {picks.length} picks made
        </h2>
        <Link
          href={basePath}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full min-h-[44px] bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.08em] uppercase hover:opacity-90 transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          View standings
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {teams.map((t) => {
          const haul = (byTeam.get(t.id) ?? []).sort((a, b) => a.overall - b.overall);
          return (
            <div key={t.id} className="bg-surface rounded-card-lg shadow-card p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-tight text-[13.5px] font-bold text-ink truncate">{t.teamName}</span>
                <Link
                  href={`${basePath}/t/${t.id}`}
                  className="text-[11px] font-tight font-bold text-accent hover:opacity-80 transition-opacity flex-shrink-0"
                >
                  View team
                </Link>
              </div>
              <ul className="space-y-1">
                {haul.map((p) => (
                  <li key={p.overall} className="font-tight text-[12.5px] text-muted truncate">
                    {p.playerName}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeletons + tab icons ──────────────────────────────────────────────────

function RoomSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Loading draft…</span>
      <div className="h-24 rounded-card-lg bg-ink/[0.06] animate-pulse" aria-hidden="true" />
      <div className="h-64 rounded-card-lg bg-ink/[0.06] animate-pulse" aria-hidden="true" />
    </div>
  );
}

function PlayersIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function BoardIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M9.5 9.5v10" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function QueueIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h10M4 17h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function PicksIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
