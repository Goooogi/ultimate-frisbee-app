'use client';

// Draft Room — shared client island rendered by the canonical in-league
// route (/fantasy/l/[contestId]/draft). Draft state comes exclusively from
// src/lib/fantasy/draft-room.ts (the frozen backend contract — P2,
// 2026-08-27; auction + readiness/reschedule added 2026-09-08); nothing here
// talks to fantasy_drafts / fantasy_draft_picks / fantasy_draft_queues
// directly.
//
// Gate (before any room renders — mirrors mobile DraftRoom.tsx):
//   No draft row → "No draft scheduled yet" (+ commissioner settings link).
//   scheduled AND >4h out → countdown card, no room.
//   Otherwise → dispatch by draft.status + draft.draftType.
//
// State machine (draft.status, from the contract):
//   scheduled → lobby: countdown to scheduledAt (or "starts whenever"), queue
//     building enabled, readiness warning strip, commissioner Start Now.
//   live → the room: snake (pick clock, board/players/queue/picks) or
//     auction (nominate/bid clock, players/budgets/results/queue).
//   complete → summary: each team's haul (+ auction prices) + link back.
//
// Clock resolution: any open client can call resolveDraftClock() /
// resolveAuction() once a clock is CLOCK_GRACE_MS past 0 (the server's own
// grace; earlier calls are told "not yet") — server-side first-caller-wins, so
// no coordination is needed beyond a small random jitter to avoid every open
// tab firing at once. A 10-second server tick backs this up, so drafts run on
// with nobody in the room. There is no pause (Hunter, 2026-10-08).
//
// Realtime: subscribeDraft() (snake) or subscribeAuction() (auction)
// refetches on relevant table changes; also refetches on window focus and
// polls every 20s while live as a fallback. Queue is loaded once
// (owner-private) and saved via a debounced saveDraftQueue call.

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
  getDraftReadiness,
  getOpenNomination,
  getNominations,
  getDraftPrices,
  getAutodraftTeamIds,
  startDraft,
  makeDraftPick,
  resolveDraftClock,
  resolveAuction,
  saveDraftQueue,
  subscribeDraft,
  subscribeAuction,
  unsubscribeDraft,
  teamOnClock,
  roundOf,
  CLOCK_GRACE_MS,
  type Draft,
  type DraftPick,
  type DraftRef,
  type DraftReadiness,
  type DraftNomination,
  type DraftPrice,
} from '@/lib/fantasy/draft-room';
import { searchContestPlayers } from '@/lib/fantasy/draft';
import { getMyContestTeam, type ContestView } from '@/lib/fantasy/leagues';
import type { FantasyPlayerHit } from '@/lib/fantasy/data';
import { getContestRatings, ratingKey, toRatingMap, type PlayerRating } from '@/lib/fantasy/ratings';
import { AuctionRoom } from './draft/auction-room';
import { CommissionerBar } from './draft/commissioner-bar';
import { AutoBadge, AutodraftToggle } from './draft/autodraft';
import {
  RANKED_PAGE_SIZE,
  RankingsHeader,
  RatingLine,
  RatingRowLine,
  ShowMoreButton,
  ratingToHit,
} from './player-rating';

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
  /** Where "back" / standings / team links point. */
  basePath: string;
}

type RoomTab = 'players' | 'board' | 'queue' | 'picks';

const ROOM_OPENS_BEFORE_MS = 4 * 60 * 60 * 1000; // 4 hours
const RATINGS_REFRESH_MS = 5 * 60 * 1000;

function formatDraftTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DraftRoom({ contest, teams, basePath }: Props) {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [openNomination, setOpenNomination] = useState<DraftNomination | null>(null);
  const [nominations, setNominations] = useState<DraftNomination[]>([]);
  const [prices, setPrices] = useState<DraftPrice[]>([]);
  // Teams on autodraft. The teams prop is static, so this is re-read with
  // every refetch.
  const [autodraftTeamIds, setAutodraftTeamIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<DraftReadiness | null>(null);

  const [myTeam, setMyTeam] = useState<TeamInfo | null>(null);
  const [queue, setQueue] = useState<DraftRef[]>([]);
  const [ratings, setRatings] = useState<PlayerRating[]>([]);
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
      setLoadError(null);
      setDraft(d);
      if (!d) {
        setPicks([]);
        setOpenNomination(null);
        setNominations([]);
        return;
      }
      const isAuction = d.draftType === 'auction';
      const [p, open, noms, auto] = await Promise.all([
        getDraftPicks(d.id),
        isAuction ? getOpenNomination(d.id) : Promise.resolve(null),
        isAuction ? getNominations(d.id) : Promise.resolve([]),
        getAutodraftTeamIds(contest.id),
      ]);
      setPicks(p);
      setOpenNomination(open);
      setNominations(noms);
      setAutodraftTeamIds(auto);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the draft.');
    }
  }, [contest.id]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const d = await getDraft(contest.id);
        if (cancelled) return;
        setDraft(d);
        if (d) {
          const isAuction = d.draftType === 'auction';
          const [p, open, noms, auto] = await Promise.all([
            getDraftPicks(d.id),
            isAuction ? getOpenNomination(d.id) : Promise.resolve(null),
            isAuction ? getNominations(d.id) : Promise.resolve([]),
            getAutodraftTeamIds(contest.id),
          ]);
          if (cancelled) return;
          setPicks(p);
          setOpenNomination(open);
          setNominations(noms);
          setAutodraftTeamIds(auto);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the draft.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  // ── Draft readiness (lobby warning strip) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getDraftReadiness(contest.id)
      .then((r) => {
        if (!cancelled) setReadiness(r);
      })
      .catch(() => {
        if (!cancelled) setReadiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  // ── Auction suggested prices ─────────────────────────────────────────────
  useEffect(() => {
    if (!draft || draft.draftType !== 'auction') {
      setPrices([]);
      return;
    }
    let cancelled = false;
    getDraftPrices(draft.id)
      .then((p) => {
        if (!cancelled) setPrices(p);
      })
      .catch(() => {
        if (!cancelled) setPrices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [draft?.id, draft?.draftType]);

  // ── Player ratings (the ranked list; [] for weekly contests) ─────────────
  // Re-read during a live draft: the hourly rebuild can reorder the list, and
  // autodraft always takes the current order. A failed re-read keeps the list.
  const draftLive = draft?.status === 'live';
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getContestRatings(contest)
        .then((r) => {
          if (!cancelled) setRatings(r);
        })
        .catch(() => {});
    load();
    const timer = draftLive ? setInterval(load, RATINGS_REFRESH_MS) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contest.id, draftLive]);

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
    if (!user) {
      setIsCommissioner(false);
      return;
    }
    getMyLeagueRole(contest.leagueId)
      .then((role) => setIsCommissioner(role === 'commissioner'))
      .catch(() => setIsCommissioner(false));
  }, [user, contest.leagueId]);

  // ── Realtime subscription — snake vs auction wiring differs ─────────────
  useEffect(() => {
    if (!draft) return;
    const isAuction = draft.draftType === 'auction';
    // An autodraft run lands several picks at once; refetch once per burst.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        refetch();
      }, 250);
    };
    const channel = isAuction ? subscribeAuction(draft.id, onChange) : subscribeDraft(draft.id, onChange);
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => {
      if (pending) clearTimeout(pending);
      unsubscribeDraft(channel);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, draft?.draftType]);

  // ── Poll fallback every 20s while live ───────────────────────────────────
  useEffect(() => {
    if (draft?.status !== 'live') return;
    const id = setInterval(() => refetch(), 20_000);
    return () => clearInterval(id);
  }, [draft?.status, refetch]);

  // ── Clock resolution (snake pick, auction nomination or bid) ────────────
  // One timer per running clock, set for its deadline + the server's grace + a
  // little jitter. It re-arms only when the clock itself changes (a new pick,
  // a bid that pushes the deadline), never on a render tick — a timer that
  // re-arms every tick gets cancelled before it fires.
  const clockDeadline =
    !draft || draft.status !== 'live'
      ? null
      : draft.draftType === 'auction'
        ? openNomination
          ? new Date(openNomination.endsAt).getTime()
          : draft.currentStartedAt
            ? new Date(draft.currentStartedAt).getTime() + draft.nominationSeconds * 1000
            : null
        : draft.currentStartedAt
          ? new Date(draft.currentStartedAt).getTime() + draft.pickSeconds * 1000
          : null;
  const liveDraftId = draft?.id ?? null;
  const isAuctionDraft = draft?.draftType === 'auction';
  useEffect(() => {
    if (!liveDraftId || clockDeadline === null) return;
    const fireIn = clockDeadline + CLOCK_GRACE_MS + 200 + Math.random() * 800 - Date.now();
    const t = setTimeout(() => {
      (isAuctionDraft ? resolveAuction(liveDraftId) : resolveDraftClock(liveDraftId)).then(refetch).catch(() => {});
    }, Math.max(0, fireIn));
    return () => clearTimeout(t);
  }, [liveDraftId, isAuctionDraft, clockDeadline, refetch]);

  const bidRemainingMs = useDeadlineRemaining(openNomination?.endsAt ?? null);
  const nominationRemainingMs = useClockRemaining(
    draft?.draftType === 'auction' && draft.status === 'live' && !openNomination ? draft.currentStartedAt : null,
    draft?.nominationSeconds ?? 30,
  );

  // ── document.title prefix — on the clock (snake), nominating, or high
  // bidder (auction) ────────────────────────────────────────────────────────
  const onClockTeamId = draft && draft.status === 'live' && draft.draftType === 'snake' ? teamOnClock(draft) : null;
  const isMyClock = !!myTeam && onClockTeamId === myTeam.id;
  const nominatingTeamId = draft && draft.status === 'live' && draft.draftType === 'auction' ? draft.draftOrder[((draft.currentOverall - 1) % Math.max(draft.draftOrder.length, 1) + draft.draftOrder.length) % Math.max(draft.draftOrder.length, 1)] : null;
  const isMyNominateTurn = !!myTeam && !openNomination && nominatingTeamId === myTeam.id;
  const isMyHighBid = !!myTeam && !!openNomination && openNomination.highTeamId === myTeam.id;
  const titlePrefix = isMyClock
    ? '● Your pick'
    : isMyNominateTurn
      ? "● You're nominating"
      : isMyHighBid
        ? '● High bidder'
        : null;
  useEffect(() => {
    const original = document.title.replace(/^● [^—]+ — /, '');
    if (titlePrefix) document.title = `${titlePrefix} — ${original}`;
    else document.title = original;
    return () => {
      document.title = original;
    };
  }, [titlePrefix]);

  if (loading) return <RoomSkeleton />;

  if (loadError) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <p className="text-muted font-tight text-[14px]">{loadError}</p>
      </div>
    );
  }

  // ── Gate: no draft scheduled yet ─────────────────────────────────────────
  if (!draft) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <p className="text-muted font-tight text-[14px]">No draft scheduled yet.</p>
        {isCommissioner && (
          <Link
            href={`${basePath}/draft/setup`}
            className="inline-flex items-center gap-1.5 mt-4 text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Set up the draft
          </Link>
        )}
      </div>
    );
  }

  // ── Gate: room opens 4h before scheduledAt ───────────────────────────────
  const opensSoon =
    draft.status === 'scheduled' &&
    draft.scheduledAt != null &&
    new Date(draft.scheduledAt).getTime() - Date.now() > ROOM_OPENS_BEFORE_MS;

  if (opensSoon && draft.scheduledAt) {
    return <RoomOpensSoonCard scheduledAt={draft.scheduledAt} />;
  }

  return (
    <div className="space-y-6">
      {draft.status === 'scheduled' && (
        <LobbyPanel
          draft={draft}
          teams={teams}
          isCommissioner={isCommissioner}
          readiness={readiness}
          onStarted={refetch}
        />
      )}

      {draft.status === 'live' && isCommissioner && (
        <CommissionerBar draft={draft} pickCount={picks.length} refetch={refetch} />
      )}

      {myTeam && (draft.status === 'scheduled' || draft.status === 'live') && (
        <AutodraftToggle
          draftId={draft.id}
          on={autodraftTeamIds.has(myTeam.id)}
          onChanged={(next) => {
            setAutodraftTeamIds((prev) => {
              const updated = new Set(prev);
              if (next) updated.add(myTeam.id);
              else updated.delete(myTeam.id);
              return updated;
            });
            refetch();
          }}
        />
      )}

      {draft.status === 'live' && draft.draftType === 'auction' && (
        <AuctionRoom
          contest={contest}
          draft={draft}
          picks={picks}
          teamById={teamById}
          myTeam={myTeam}
          queue={queue}
          setQueue={setQueue}
          ratings={ratings}
          openNomination={openNomination}
          nominations={nominations}
          prices={prices}
          bidRemainingMs={bidRemainingMs}
          nominationRemainingMs={nominationRemainingMs}
          autodraftTeamIds={autodraftTeamIds}
          onRequireAuth={() => setAuthOpen(true)}
          refetch={refetch}
        />
      )}

      {draft.status === 'live' && draft.draftType === 'snake' && (
        <LiveRoom
          contest={contest}
          draft={draft}
          picks={picks}
          teams={teams}
          teamById={teamById}
          draftedByKey={draftedByKey}
          myTeam={myTeam}
          isMyClock={isMyClock}
          autodraftTeamIds={autodraftTeamIds}
          queue={queue}
          setQueue={setQueue}
          ratings={ratings}
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

// ─── Gate: room opens soon ──────────────────────────────────────────────────

function RoomOpensSoonCard({ scheduledAt }: { scheduledAt: string }) {
  const countdown = useCountdown(scheduledAt);
  return (
    <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
      <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-accent mb-2.5 font-tight">
        Draft room opens 4 hours before the draft
      </div>
      <h2 className="font-display italic text-[28px] lg:text-[34px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-2">
        {countdown}
      </h2>
      <p className="text-muted font-tight text-[13px]">{formatDraftTime(scheduledAt)}</p>
    </div>
  );
}

// ─── Lobby (scheduled) ────────────────────────────────────────────────────────

function settingsLine(draft: Draft): string {
  if (draft.draftType === 'auction') {
    return `Auction · $${draft.budget} budget · ${draft.rounds} roster spots · ${draft.nominationSeconds}s to nominate · ${draft.bidSeconds}s bids`;
  }
  return `Snake · ${draft.rounds} rounds · ${draft.pickSeconds}s clock`;
}

function LobbyPanel({
  draft,
  teams,
  isCommissioner,
  readiness,
  onStarted,
}: {
  draft: Draft;
  teams: TeamInfo[];
  isCommissioner: boolean;
  readiness: DraftReadiness | null;
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
        {settingsLine(draft)}
        {orderKnown ? ' — order re-shuffles when the draft starts.' : ''}
      </p>

      {readiness && !readiness.rostersReady && (
        <p className="max-w-md mx-auto mb-5 px-4 py-3 rounded-card-sm bg-live/10 text-live font-tight text-[12.5px] leading-[1.4]" role="alert">
          Rosters not set on {readiness.sourceLabel} — draft will be another day.
        </p>
      )}
      {readiness?.missed && (
        <p className="max-w-md mx-auto mb-5 px-4 py-3 rounded-card-sm bg-live/10 text-live font-tight text-[12.5px] leading-[1.4]" role="alert">
          This draft&apos;s scheduled time has passed. The commissioner needs to reschedule it.
        </p>
      )}

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
  autodraftTeamIds,
  queue,
  setQueue,
  ratings,
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
  autodraftTeamIds: Set<string>;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  ratings: PlayerRating[];
  tab: RoomTab;
  setTab: (t: RoomTab) => void;
  onRequireAuth: () => void;
  refetch: () => void;
}) {
  const onClockTeamId = teamOnClock(draft);
  const onClockTeam = onClockTeamId ? teamById.get(onClockTeamId) : null;
  const round = roundOf(draft.currentOverall, draft.draftOrder.length);

  // Display only — DraftRoom's clock timer resolves an expired pick.
  const remainingMs = useClockRemaining(draft.currentStartedAt, draft.pickSeconds);

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
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-tight text-[16px] font-bold text-ink truncate">
                {isMyClock ? "You're on the clock" : `${onClockTeam?.teamName ?? 'Team'} is on the clock`}
              </span>
              {onClockTeamId && autodraftTeamIds.has(onClockTeamId) && <AutoBadge />}
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
            ratings={ratings}
            onRequireAuth={onRequireAuth}
            refetch={refetch}
          />
        )}
        {tab === 'board' && <BoardPanel draft={draft} picks={picks} teams={teams} autodraftTeamIds={autodraftTeamIds} />}
        {tab === 'queue' && (
          <QueuePanel
            draft={draft}
            myTeam={myTeam}
            queue={queue}
            setQueue={setQueue}
            ratings={ratings}
            onRequireAuth={onRequireAuth}
          />
        )}
        {tab === 'picks' && <PicksPanel picks={picks} teamById={teamById} />}
        <div className="h-4" />
        <FloatingTabBar tabs={tabs} activeId={tab} onChange={(id) => setTab(id as RoomTab)} ariaLabel="Draft room sections" />
      </div>

      <div className="hidden lg:grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <BoardPanel draft={draft} picks={picks} teams={teams} autodraftTeamIds={autodraftTeamIds} />
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
            ratings={ratings}
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
  ratings: PlayerRating[];
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
          ratings={props.ratings}
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
          ratings={props.ratings}
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

/** Same shape but for an absolute ISO deadline (auction bidding clock). */
function useDeadlineRemaining(endsAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return new Date(endsAt).getTime() - now;
}

function ClockDial({
  remainingMs,
  pickSeconds,
  urgent,
}: {
  remainingMs: number | null;
  pickSeconds: number;
  urgent: boolean;
}) {
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
  ratings,
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
  ratings: PlayerRating[];
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

  const ratingMap = useMemo(() => toRatingMap(ratings), [ratings]);
  const available = useMemo(
    () => ratings.filter((r) => !draftedByKey.has(ratingKey(r.playerLeague, r.playerId))),
    [ratings, draftedByKey],
  );
  const [shown, setShown] = useState(RANKED_PAGE_SIZE);
  // Nothing typed yet: the best players still on the board instead of a blank prompt.
  const showRanked = query.trim().length < 2 && available.length > 0;
  const listHits = showRanked ? available.slice(0, shown).map(ratingToHit) : results;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    // Responses can land out of order; only the latest query may write. The
    // spinner starts now, not after the debounce, so "No players found." can't
    // flash first.
    let cancelled = false;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const hits = await searchContestPlayers(contest, query, 30);
        if (!cancelled) setResults(hits);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
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

      {ratings.length > 0 && (
        <RankingsHeader
          competition={contest.competition}
          title={showRanked ? 'Best available' : undefined}
          className="mb-2"
        />
      )}

      {query.trim().length < 2 && !showRanked ? (
        <p className="text-faint font-tight text-[13px] py-6 text-center">
          Search the player pool to draft or queue someone.
        </p>
      ) : searching && !showRanked ? (
        <PlayerListSkeleton />
      ) : listHits.length === 0 ? (
        <p className="text-faint font-tight text-[13px] py-6 text-center">No players found.</p>
      ) : (
        <ul className="space-y-1.5">
          {listHits.map((hit) => {
            const key = `${league}:${hit.playerId}`;
            const draftedTeamId = draftedByKey.get(key) ?? null;
            return (
              <PlayerRow
                key={hit.playerId}
                hit={hit}
                rating={ratingMap.get(key)}
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
          {showRanked && shown < available.length && (
            <li className="pt-2">
              <ShowMoreButton onClick={() => setShown((n) => n + RANKED_PAGE_SIZE)} />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function PlayerRow({
  hit,
  rating,
  drafted,
  draftedTeamName,
  queued,
  canDraft,
  picking,
  onDraft,
  onQueue,
}: {
  hit: FantasyPlayerHit;
  rating: PlayerRating | undefined;
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
        'flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2.5 rounded-card-sm',
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
      <RatingRowLine rating={rating} />
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

function BoardPanel({
  draft,
  picks,
  teams,
  autodraftTeamIds,
}: {
  draft: Draft;
  picks: DraftPick[];
  teams: TeamInfo[];
  autodraftTeamIds: Set<string>;
}) {
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
                  <span className="inline-flex items-center gap-1.5">
                    {t?.teamName ?? 'Team'}
                    {t && draft.status === 'live' && autodraftTeamIds.has(t.id) && <AutoBadge />}
                  </span>
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
  ratings,
  onRequireAuth,
}: {
  draft: Draft;
  myTeam: TeamInfo | null;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  ratings: PlayerRating[];
  onRequireAuth: () => void;
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const persist = useCallback(
    (next: DraftRef[]) => {
      setQueue(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Save the newest queue, not this call's: an add from the Players tab
      // saves at once, and a stale timer would overwrite it.
      saveTimer.current = setTimeout(() => {
        saveDraftQueue(draft.id, queueRef.current).catch(() => {});
      }, 400);
    },
    [draft.id, setQueue],
  );

  const ratingMap = useMemo(() => toRatingMap(ratings), [ratings]);

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
          Your queue is empty. Add players from the PLAYERS tab. If your clock runs out, autodraft picks for you: your
          queue first, then the top-ranked player left.
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
            <div className="flex-1 min-w-0">
              <div className="font-tight text-[13.5px] font-semibold text-ink truncate">{entry.playerName}</div>
              <RatingLine rating={ratingMap.get(ratingKey(entry.playerLeague, entry.playerId))} compact />
            </div>
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
                {p.price != null ? ` · $${p.price}` : ''}
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
          View league
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
                    {p.price != null && <span className="text-faint"> &middot; ${p.price}</span>}
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
