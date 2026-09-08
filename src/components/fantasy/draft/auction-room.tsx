'use client';

// AuctionRoom — draft.status === 'live', draft.draftType === 'auction'.
// Phase derives from whether an open nomination exists: BIDDING (someone's
// player is up) vs NOMINATING (waiting for the next team to put one up).
// Ported from mobile AuctionRoom.tsx by intent.

import { useCallback, useRef, useState } from 'react';
import { FloatingTabBar, type FloatingTab } from '@/components/floating-tab-bar';
import {
  auctionTeamState,
  nominatePlayer,
  placeBid,
  teamToNominate,
  saveDraftQueue,
  type Draft,
  type DraftPick,
  type DraftRef,
  type DraftNomination,
  type DraftPrice,
} from '@/lib/fantasy/draft-room';
import { searchContestPlayers } from '@/lib/fantasy/draft';
import type { ContestView } from '@/lib/fantasy/leagues';
import type { FantasyPlayerHit } from '@/lib/fantasy/data';
import { BudgetsPanel } from './budgets-panel';
import { NominateSheet } from './nominate-sheet';

interface TeamInfo {
  id: string;
  teamName: string;
}

type RoomTab = 'players' | 'budgets' | 'results' | 'queue';

function priceFor(prices: DraftPrice[], league: string, playerId: string): number | null {
  const hit = prices.find((p) => p.playerLeague === league && p.playerId === playerId);
  return hit ? hit.price : null;
}

export function AuctionRoom({
  contest,
  draft,
  picks,
  teamById,
  myTeam,
  queue,
  setQueue,
  openNomination,
  nominations,
  prices,
  bidRemainingMs,
  nominationRemainingMs,
  onRequireAuth,
  refetch,
}: {
  contest: ContestView;
  draft: Draft;
  picks: DraftPick[];
  teamById: Map<string, TeamInfo>;
  myTeam: TeamInfo | null;
  queue: DraftRef[];
  setQueue: (q: DraftRef[]) => void;
  openNomination: DraftNomination | null;
  nominations: DraftNomination[];
  prices: DraftPrice[];
  bidRemainingMs: number | null;
  nominationRemainingMs: number | null;
  onRequireAuth: () => void;
  refetch: () => void;
}) {
  const [tab, setTab] = useState<RoomTab>('players');
  const [actionError, setActionError] = useState<string | null>(null);
  const [nominateSheet, setNominateSheet] = useState<FantasyPlayerHit | null>(null);

  const isPaused = Boolean(draft.pausedAt);
  const myState = myTeam ? auctionTeamState(draft, picks, myTeam.id) : null;
  const nominatingTeamId = teamToNominate(draft);
  const isMyNominateTurn = Boolean(myTeam) && nominatingTeamId === myTeam?.id && !openNomination && !isPaused;

  const draftedByKey = new Map(picks.map((p) => [`${p.playerLeague}:${p.playerId}`, p.teamId]));

  const handleQueue = (ref: DraftRef) => {
    if (queue.some((q) => q.playerId === ref.playerId && q.playerLeague === ref.playerLeague)) return;
    const next = [...queue, ref];
    setQueue(next);
    saveDraftQueue(draft.id, next).catch(() => {});
  };

  const openNominateSheet = (hit: FantasyPlayerHit) => {
    if (!myTeam) {
      onRequireAuth();
      return;
    }
    setActionError(null);
    setNominateSheet(hit);
  };

  const handleNominate = async (opening: number) => {
    if (!nominateSheet) return;
    setActionError(null);
    try {
      await nominatePlayer(
        draft.id,
        { playerLeague: contest.competitionDef.playerLeague, playerId: nominateSheet.playerId, playerName: nominateSheet.fullName },
        opening,
      );
      setNominateSheet(null);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not nominate that player.');
    }
  };

  const handleBid = async (amount: number) => {
    setActionError(null);
    try {
      await placeBid(draft.id, amount);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not place that bid.');
    }
  };

  const wonResults = nominations.filter((n) => n.status === 'won').sort((a, b) => b.overall - a.overall);

  const tabs: FloatingTab[] = [
    { id: 'players', label: 'Players', icon: PlayersIcon },
    { id: 'budgets', label: 'Budgets', icon: BudgetsIcon },
    { id: 'results', label: 'Results', icon: ResultsIcon },
    { id: 'queue', label: 'Queue', icon: QueueIcon },
  ];

  const railTabs = tabs;

  const panels = {
    players: (
      <AuctionPlayersPanel
        contest={contest}
        draftedByKey={draftedByKey}
        teamById={teamById}
        queue={queue}
        onQueue={handleQueue}
        canNominate={isMyNominateTurn}
        onNominate={openNominateSheet}
        actionError={!nominateSheet ? actionError : null}
      />
    ),
    budgets: <BudgetsPanel draft={draft} picks={picks} teamById={teamById} />,
    results: <ResultsPanel wonResults={wonResults} teamById={teamById} />,
    queue: (
      <AuctionQueuePanel draftId={draft.id} myTeam={myTeam} queue={queue} setQueue={setQueue} onRequireAuth={onRequireAuth} />
    ),
  };

  return (
    <div>
      {openNomination ? (
        <BiddingHeader
          nomination={openNomination}
          teamById={teamById}
          remainingMs={bidRemainingMs}
          bidSeconds={draft.bidSeconds}
          myTeam={myTeam}
          myState={myState}
          onBid={handleBid}
          error={actionError}
          paused={isPaused}
        />
      ) : (
        <NominatingHeader
          teamName={(nominatingTeamId && teamById.get(nominatingTeamId)?.teamName) ?? 'Team'}
          isMine={isMyNominateTurn}
          remainingMs={nominationRemainingMs}
          nominationSeconds={draft.nominationSeconds}
          paused={isPaused}
        />
      )}

      <div className="lg:hidden">
        {panels[tab]}
        <div className="h-4" />
        <FloatingTabBar tabs={tabs} activeId={tab} onChange={(id) => setTab(id as RoomTab)} ariaLabel="Auction room sections" />
      </div>

      <div className="hidden lg:grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <BudgetsPanel draft={draft} picks={picks} teamById={teamById} />
        </div>
        <div>
          <DesktopRail tab={tab} setTab={setTab} tabs={railTabs} panels={panels} />
        </div>
      </div>

      {nominateSheet && (
        <NominateSheet
          hit={nominateSheet}
          minBid={draft.minBid}
          maxBid={myState?.maxBid ?? draft.minBid}
          openingPrice={priceFor(prices, contest.competitionDef.playerLeague, nominateSheet.playerId)}
          onCancel={() => setNominateSheet(null)}
          onConfirm={handleNominate}
        />
      )}
    </div>
  );
}

function DesktopRail({
  tab,
  setTab,
  tabs,
  panels,
}: {
  tab: RoomTab;
  setTab: (t: RoomTab) => void;
  tabs: FloatingTab[];
  panels: Record<RoomTab, React.ReactNode>;
}) {
  return (
    <div>
      <div className="flex gap-1 mb-4 bg-ink/[0.04] rounded-full p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as RoomTab)}
            className={[
              'flex-1 px-3 py-2 rounded-full font-tight text-[11px] font-bold tracking-[0.08em] uppercase transition-colors duration-150 cursor-pointer',
              tab === t.id ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {panels[tab]}
    </div>
  );
}

// ─── Header variants ────────────────────────────────────────────────────────

function ClockDial({
  remainingMs,
  totalSeconds,
  urgent,
  paused = false,
}: {
  remainingMs: number | null;
  totalSeconds: number;
  urgent: boolean;
  paused?: boolean;
}) {
  const sec = remainingMs === null ? totalSeconds : Math.max(0, Math.ceil(remainingMs / 1000));
  const low = !paused && sec <= 10;
  return (
    <div
      className={[
        'flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-full font-tight text-[20px] font-bold tabular',
        low ? 'bg-live/10 text-live' : urgent && !paused ? 'bg-accent/10 text-accent' : 'bg-ink/5 text-ink',
      ].join(' ')}
      aria-label={paused ? 'Draft paused' : `${sec} seconds remaining`}
    >
      {paused ? 'II' : sec}
    </div>
  );
}

function NominatingHeader({
  teamName,
  isMine,
  remainingMs,
  nominationSeconds,
  paused,
}: {
  teamName: string;
  isMine: boolean;
  remainingMs: number | null;
  nominationSeconds: number;
  paused: boolean;
}) {
  return (
    <div
      className={[
        'bg-surface rounded-card-lg shadow-card p-4 lg:p-5 mb-6',
        isMine ? 'ring-2 ring-accent' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-1">
            Nominating
          </div>
          <div className="font-tight text-[16px] font-bold text-ink truncate">
            {isMine ? "You're nominating" : `${teamName} is nominating`}
          </div>
        </div>
        <ClockDial remainingMs={remainingMs} totalSeconds={nominationSeconds} urgent={isMine} paused={paused} />
      </div>
    </div>
  );
}

function BiddingHeader({
  nomination,
  teamById,
  remainingMs,
  bidSeconds,
  myTeam,
  myState,
  onBid,
  error,
  paused,
}: {
  nomination: DraftNomination;
  teamById: Map<string, TeamInfo>;
  remainingMs: number | null;
  bidSeconds: number;
  myTeam: TeamInfo | null;
  myState: ReturnType<typeof auctionTeamState> | null;
  onBid: (amount: number) => Promise<void>;
  error: string | null;
  paused: boolean;
}) {
  const [customAmount, setCustomAmount] = useState('');
  const [bidding, setBidding] = useState(false);

  const isHighBidder = Boolean(myTeam) && nomination.highTeamId === myTeam?.id;
  const canBid = !paused && Boolean(myTeam) && !isHighBidder && Boolean(myState) && myState!.maxBid > nomination.highBid;

  const submit = async (amount: number) => {
    if (!myState || amount > myState.maxBid || amount <= nomination.highBid) return;
    setBidding(true);
    try {
      await onBid(amount);
      setCustomAmount('');
    } finally {
      setBidding(false);
    }
  };

  const quickBids = [1, 5, 10].map((inc) => nomination.highBid + inc);

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-4 lg:p-5 mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-1">
            Bidding
          </div>
          <div className="font-tight text-[18px] font-bold text-ink truncate">{nomination.playerName}</div>
          <div className="font-tight text-[13px] text-muted mt-0.5">
            High bid ${nomination.highBid} &middot; {teamById.get(nomination.highTeamId)?.teamName ?? 'Team'}
          </div>
        </div>
        <ClockDial remainingMs={remainingMs} totalSeconds={bidSeconds} urgent={canBid} paused={paused} />
      </div>

      {myState && (
        <p className="font-tight text-[12px] text-muted mt-3">
          You: ${myState.remaining} left &middot; max bid ${myState.maxBid} &middot; {myState.openSlots} spots
        </p>
      )}

      {error && (
        <p role="alert" className="font-tight text-[12px] text-live mt-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3.5 flex-wrap">
        {quickBids.map((amount) => {
          const disabled = !canBid || bidding || !myState || amount > myState.maxBid;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => submit(amount)}
              disabled={disabled}
              aria-label={`Bid $${amount}`}
              className={[
                'min-h-[36px] px-3.5 rounded-full font-tight text-[12.5px] font-bold transition-opacity duration-150',
                disabled ? 'bg-ink/[0.06] text-faint cursor-not-allowed' : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
              ].join(' ')}
            >
              ${amount}
            </button>
          );
        })}
        <input
          type="text"
          inputMode="numeric"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Amount"
          aria-label="Custom bid amount"
          disabled={paused}
          className="min-h-[36px] min-w-[72px] px-3 rounded-full bg-ink/[0.05] font-tight text-[13px] text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => submit(Number(customAmount))}
          disabled={!canBid || bidding || !customAmount}
          className={[
            'min-h-[36px] px-4 rounded-full font-tight text-[12.5px] font-bold transition-opacity duration-150',
            !canBid || bidding || !customAmount
              ? 'bg-ink/[0.06] text-faint cursor-not-allowed'
              : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
          ].join(' ')}
        >
          {bidding ? '…' : 'Bid'}
        </button>
      </div>
    </div>
  );
}

// ─── Players panel (nominate variant) ──────────────────────────────────────

function AuctionPlayersPanel({
  contest,
  draftedByKey,
  teamById,
  queue,
  onQueue,
  canNominate,
  onNominate,
  actionError,
}: {
  contest: ContestView;
  draftedByKey: Map<string, string>;
  teamById: Map<string, TeamInfo>;
  queue: DraftRef[];
  onQueue: (ref: DraftRef) => void;
  canNominate: boolean;
  onNominate: (hit: FantasyPlayerHit) => void;
  actionError: string | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FantasyPlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const league = contest.competitionDef.playerLeague;

  const runSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const hits = await searchContestPlayers(contest, q, 30);
          setResults(hits);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 200);
    },
    [contest],
  );

  const handleChange = (v: string) => {
    setQuery(v);
    runSearch(v);
  };

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-4 lg:p-5">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search players…"
        aria-label="Search players"
        className="w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5 font-tight text-[14px] text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] mb-4"
      />

      {actionError && (
        <p role="alert" className="mb-3 text-[12px] text-live font-tight">
          {actionError}
        </p>
      )}

      {query.trim().length < 2 ? (
        <p className="text-faint font-tight text-[13px] py-6 text-center">
          Search the player pool to nominate or queue someone.
        </p>
      ) : searching ? (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">Loading…</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 rounded-card-sm bg-ink/[0.06] animate-pulse" aria-hidden="true" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="text-faint font-tight text-[13px] py-6 text-center">No players found.</p>
      ) : (
        <ul className="space-y-1.5">
          {results.map((hit) => {
            const key = `${league}:${hit.playerId}`;
            const draftedTeamId = draftedByKey.get(key) ?? null;
            const drafted = draftedTeamId !== null;
            const queued = queue.some((q) => q.playerId === hit.playerId && q.playerLeague === league);
            return (
              <li
                key={hit.playerId}
                className={[
                  'flex items-center gap-2 px-3 py-2.5 rounded-card-sm',
                  drafted ? 'opacity-45' : 'hover:bg-surface-hi transition-colors duration-150',
                ].join(' ')}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-tight text-[13.5px] font-semibold text-ink truncate">{hit.fullName}</div>
                  <div className="font-tight text-[11px] text-muted truncate">
                    {drafted ? `Drafted — ${teamById.get(draftedTeamId)?.teamName ?? 'Team'}` : hit.teamName ?? ' '}
                  </div>
                </div>
                {!drafted && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onQueue({ playerLeague: league, playerId: hit.playerId, playerName: hit.fullName })}
                      disabled={queued}
                      aria-label={queued ? `${hit.fullName} is queued` : `Queue ${hit.fullName}`}
                      className={[
                        'flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-150',
                        queued ? 'text-accent bg-accent/10 cursor-default' : 'text-faint hover:text-ink hover:bg-ink/10 cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      ].join(' ')}
                    >
                      <QueueGlyph filled={queued} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNominate(hit)}
                      disabled={!canNominate}
                      className={[
                        'px-3.5 py-2 rounded-full min-h-[36px] font-tight text-[11px] font-bold tracking-[0.08em] uppercase transition-all duration-150',
                        canNominate
                          ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
                          : 'bg-ink/[0.06] text-faint cursor-not-allowed',
                      ].join(' ')}
                    >
                      Nominate
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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

// ─── Results panel (won nominations, newest first) ─────────────────────────

function ResultsPanel({ wonResults, teamById }: { wonResults: DraftNomination[]; teamById: Map<string, TeamInfo> }) {
  if (wonResults.length === 0) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
        <p className="text-muted font-tight text-[13px]">No sales yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      <ul aria-label="Auction results">
        {wonResults.map((n, idx) => (
          <li
            key={n.id}
            className={['flex items-center gap-3 px-4 py-3', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
          >
            <div className="min-w-0 flex-1">
              <div className="font-tight text-[13.5px] font-semibold text-ink truncate">{n.playerName}</div>
              <div className="font-tight text-[11px] text-muted truncate">
                {teamById.get(n.highTeamId)?.teamName ?? 'Team'}
              </div>
            </div>
            <span className="font-tight text-[14px] font-bold text-accent tabular flex-shrink-0">${n.highBid}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Queue panel (auction variant) ─────────────────────────────────────────

function AuctionQueuePanel({
  draftId,
  myTeam,
  queue,
  setQueue,
  onRequireAuth,
}: {
  draftId: string;
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
        saveDraftQueue(draftId, next).catch(() => {});
      }, 400);
    },
    [draftId, setQueue],
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
          Your queue is empty. Add players from the PLAYERS tab.
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
    persist(queue.filter((_, i) => i !== idx));
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

// ─── Tab icons ──────────────────────────────────────────────────────────────

function PlayersIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function BudgetsIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v9M9.5 9.5c0-1.1 1.1-2 2.5-2s2.5.9 2.5 2c0 2.5-5 1.5-5 4 0 1.1 1.1 2 2.5 2s2.5-.9 2.5-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function ResultsIcon({ size }: { active: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l5 5L20 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
