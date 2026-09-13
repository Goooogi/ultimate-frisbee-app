'use client';

// PlayersPanel — the "Players" tab body. Search (200ms debounce, min 2
// chars) + filter (All | Available | My team) + rows (name · team · season
// preview points (UFA only) · ownership label). Drafted weekly-stats
// contests with a complete draft and a signed-in team get an Add action on
// available rows → modal to pick who to drop, and a Trade action on other
// teams' rostered rows → propose-trade dialog pre-seeded with that team +
// player. Web port of the mobile app's PlayersList.tsx
// (altiusapps/mobileapp-thelayout · src/components/fantasy/PlayersList.tsx).

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  getMyContestTeam,
  getTeamPlayers,
  addDrop,
  getWaiverPlayers,
  waiverSettings,
  type ContestView,
} from '@/lib/fantasy/leagues';
import { getDraft } from '@/lib/fantasy/draft-room';
import { searchContestPlayers } from '@/lib/fantasy/draft';
import { playerSeasonPreview } from '@/lib/fantasy/data';
import type { FantasyPlayerHit } from '@/lib/fantasy/data';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { ProposeTradeDialog } from '@/components/fantasy/trades/propose-trade-dialog';
import { WaiverClaimDialog } from '@/components/fantasy/waivers/waiver-claim-dialog';
import { getContestStandings } from '@/lib/fantasy/leagues';
import { getProjections, projectedPoints, projectionKey, type ProjectionMap } from '@/lib/fantasy/projections';

type Filter = 'all' | 'available' | 'mine';

function waiverClearsLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Waivers';
  return `Waivers · clears ${d.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: d.getMinutes() === 0 ? undefined : '2-digit',
  })}`;
}

interface Row {
  playerId: string;
  fullName: string;
  teamName: string | null;
  ownerLabel: string;
  isMine: boolean;
  isAvailable: boolean;
  ownerTeamId: string | null;
  waiverAvailableAt: string | null;
}

export function PlayersPanel({ contest }: { contest: ContestView }) {
  const { user } = useAuth();
  const isUfa = contest.competitionDef.playerLeague === 'ufa';
  const isDrafted = contest.settings.draft === true;
  const isWeekly = contest.settings.mode === 'weekly-stats';

  const [projections, setProjections] = useState<ProjectionMap | undefined>(undefined);
  useEffect(() => {
    if (!isWeekly) {
      setProjections(undefined);
      return;
    }
    let cancelled = false;
    getProjections(contest.id)
      .then((m) => !cancelled && setProjections(m))
      .catch(() => !cancelled && setProjections(undefined));
    return () => {
      cancelled = true;
    };
  }, [contest.id, isWeekly]);

  const [myTeam, setMyTeam] = useState<{ id: string; teamName: string } | null>(null);
  const [allOwnership, setAllOwnership] = useState<{ playerId: string; teamId: string }[]>([]);
  const [myOwnership, setMyOwnership] = useState<{ playerId: string; playerName: string }[]>([]);
  const [draftComplete, setDraftComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (isDrafted) {
      getTeamPlayers(contest.id)
        .then((rows) => !cancelled && setAllOwnership(rows.map((r) => ({ playerId: r.playerId, teamId: r.teamId }))))
        .catch(() => !cancelled && setAllOwnership([]));
    }
    getDraft(contest.id)
      .then((d) => !cancelled && setDraftComplete(d?.status === 'complete'))
      .catch(() => !cancelled && setDraftComplete(false));
    return () => {
      cancelled = true;
    };
  }, [contest.id, isDrafted]);

  useEffect(() => {
    if (!user) {
      setMyTeam(null);
      return;
    }
    let cancelled = false;
    getMyContestTeam(contest.id)
      .then((t) => !cancelled && setMyTeam(t))
      .catch(() => !cancelled && setMyTeam(null));
    return () => {
      cancelled = true;
    };
  }, [user, contest.id]);

  useEffect(() => {
    if (!myTeam || !isDrafted) {
      setMyOwnership([]);
      return;
    }
    let cancelled = false;
    getTeamPlayers(contest.id, myTeam.id)
      .then((rows) => !cancelled && setMyOwnership(rows.map((r) => ({ playerId: r.playerId, playerName: r.playerName }))))
      .catch(() => !cancelled && setMyOwnership([]));
    return () => {
      cancelled = true;
    };
  }, [contest.id, myTeam, isDrafted]);

  const canAddDrop = isWeekly && isDrafted && draftComplete && Boolean(myTeam);
  const canTrade = isWeekly && isDrafted && draftComplete && Boolean(myTeam);

  const isFaab = waiverSettings(contest.settings).mode === 'faab';
  const [waiverByPlayer, setWaiverByPlayer] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!isFaab || !canAddDrop) {
      setWaiverByPlayer(new Map());
      return;
    }
    let cancelled = false;
    getWaiverPlayers(contest.id)
      .then((rows) => {
        if (cancelled) return;
        const now = Date.now();
        const m = new Map<string, string>();
        for (const w of rows) {
          if (new Date(w.availableAt).getTime() > now) m.set(w.playerId, w.availableAt);
        }
        setWaiverByPlayer(m);
      })
      .catch(() => !cancelled && setWaiverByPlayer(new Map()));
    return () => {
      cancelled = true;
    };
  }, [contest.id, isFaab, canAddDrop]);

  const [standings, setStandings] = useState<{ teamId: string; teamName: string }[]>([]);
  useEffect(() => {
    if (!canTrade) return;
    let cancelled = false;
    getContestStandings(contest.id)
      .then((rows) => !cancelled && setStandings(rows.map((r) => ({ teamId: r.teamId, teamName: r.teamName }))))
      .catch(() => !cancelled && setStandings([]));
    return () => {
      cancelled = true;
    };
  }, [contest.id, canTrade]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [results, setResults] = useState<FantasyPlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchContestPlayers(contest, query, 30)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, contest.id]);

  const ownerByPlayer = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allOwnership) m.set(t.playerId, t.teamId);
    return m;
  }, [allOwnership]);

  const myPlayerIds = useMemo(() => new Set(myOwnership.map((t) => t.playerId)), [myOwnership]);

  const hasQuery = query.trim().length >= 2;
  const showMyTeamDefault = !hasQuery && isDrafted;

  const baseHits: FantasyPlayerHit[] = hasQuery
    ? results
    : showMyTeamDefault
      ? myOwnership.map((t) => ({ playerId: t.playerId, fullName: t.playerName, teamId: null, teamName: null }))
      : [];

  const rows: Row[] = baseHits.map((hit) => {
    const ownerId = ownerByPlayer.get(hit.playerId);
    const isMine = myPlayerIds.has(hit.playerId);
    const isAvailable = isDrafted ? !ownerId : true;
    const ownerLabel = isMine ? 'You' : ownerId ? 'Owned' : 'Free agent';
    return {
      playerId: hit.playerId,
      fullName: hit.fullName,
      teamName: hit.teamName,
      ownerLabel,
      isMine,
      isAvailable,
      ownerTeamId: ownerId ?? null,
      waiverAvailableAt: waiverByPlayer.get(hit.playerId) ?? null,
    };
  });

  const filteredRows = rows.filter((r) => {
    if (filter === 'available') return r.isAvailable;
    if (filter === 'mine') return r.isMine;
    return true;
  });

  const showAvailableFilter = isDrafted;

  const [dropSheetPlayer, setDropSheetPlayer] = useState<{ playerId: string; playerName: string } | null>(null);
  const [tradeTarget, setTradeTarget] = useState<{ teamId: string; playerId: string } | null>(null);
  const [claimPlayer, setClaimPlayer] = useState<{ playerId: string; playerName: string } | null>(null);

  return (
    <div className="space-y-5">
      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search the ${contest.competitionDef.shortLabel} player pool`}
          aria-label="Search players"
          className={[
            'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
            'font-tight text-[14px] text-ink placeholder:text-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'min-h-[44px]',
          ].join(' ')}
        />
        {searching && (
          <div className="absolute right-3 w-4 h-4 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
        )}
      </div>

      {/* ── Segmented filter ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <SegmentButton label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        {showAvailableFilter && (
          <SegmentButton label="Available" active={filter === 'available'} onClick={() => setFilter('available')} />
        )}
        <SegmentButton label="My team" active={filter === 'mine'} onClick={() => setFilter('mine')} />
      </div>

      {/* ── Rows ───────────────────────────────────────────────────────── */}
      {filteredRows.length === 0 ? (
        <p className="text-center font-tight text-[13px] text-faint py-8">
          {hasQuery
            ? `No players found for "${query.trim()}"`
            : showMyTeamDefault
              ? 'No players on your team yet.'
              : `Search the ${contest.competitionDef.shortLabel} player pool`}
        </p>
      ) : (
        <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
          {filteredRows.map((row, idx) => (
            <PlayerRow
              key={row.playerId}
              row={row}
              first={idx === 0}
              isUfa={isUfa}
              seasonYear={contest.seasonYear}
              playerLeague={contest.competitionDef.playerLeague}
              projections={projections}
              canAdd={canAddDrop && row.isAvailable && !row.isMine && row.waiverAvailableAt == null}
              onOpenAdd={(playerId, playerName) => setDropSheetPlayer({ playerId, playerName })}
              canClaim={canAddDrop && row.waiverAvailableAt != null}
              onOpenClaim={(playerId, playerName) => setClaimPlayer({ playerId, playerName })}
              canTrade={canTrade && !row.isMine && row.ownerTeamId != null}
              onOpenTrade={(playerId, teamId) => setTradeTarget({ teamId, playerId })}
            />
          ))}
        </div>
      )}

      {/* ── Propose trade dialog ──────────────────────────────────────── */}
      {tradeTarget && myTeam && (
        <ProposeTradeDialog
          contest={contest}
          myTeam={{ teamId: myTeam.id, teamName: myTeam.teamName }}
          otherTeams={standings.filter((s) => s.teamId !== myTeam.id)}
          initialTeamId={tradeTarget.teamId}
          initialGetPlayerId={tradeTarget.playerId}
          onClose={() => setTradeTarget(null)}
          onDone={async () => {
            setTradeTarget(null);
            await revalidateFantasyLeague(contest.leagueId, contest.id).catch(() => null);
          }}
        />
      )}

      {/* ── Add/Drop modal ────────────────────────────────────────────── */}
      {dropSheetPlayer && myTeam && (
        <DropModal
          contest={contest}
          addPlayer={dropSheetPlayer}
          myOwnership={myOwnership}
          onClose={() => setDropSheetPlayer(null)}
          onDone={async () => {
            setDropSheetPlayer(null);
            await revalidateFantasyLeague(contest.leagueId, contest.id).catch(() => null);
            const rows = await getTeamPlayers(contest.id, myTeam.id).catch(() => []);
            setMyOwnership(rows.map((r) => ({ playerId: r.playerId, playerName: r.playerName })));
            if (isDrafted) {
              const all = await getTeamPlayers(contest.id).catch(() => []);
              setAllOwnership(all.map((r) => ({ playerId: r.playerId, teamId: r.teamId })));
            }
          }}
        />
      )}

      {/* ── Waiver claim dialog ───────────────────────────────────────── */}
      {claimPlayer && myTeam && (
        <WaiverClaimDialog
          contest={contest}
          teamId={myTeam.id}
          addPlayer={claimPlayer}
          onClose={() => setClaimPlayer(null)}
          onDone={async () => {
            setClaimPlayer(null);
            await revalidateFantasyLeague(contest.leagueId, contest.id).catch(() => null);
          }}
        />
      )}
    </div>
  );
}

function SegmentButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'px-3.5 py-2 rounded-full font-tight text-[11.5px] font-bold tracking-[0.06em] uppercase transition-colors duration-150 cursor-pointer',
        active ? 'bg-accent text-accent-ink' : 'bg-ink/5 text-muted hover:bg-ink/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function PlayerRow({
  row,
  first,
  isUfa,
  seasonYear,
  playerLeague,
  projections,
  canAdd,
  onOpenAdd,
  canClaim,
  onOpenClaim,
  canTrade,
  onOpenTrade,
}: {
  row: Row;
  first: boolean;
  isUfa: boolean;
  seasonYear: number;
  playerLeague: string;
  projections: ProjectionMap | undefined;
  canAdd: boolean;
  onOpenAdd: (playerId: string, playerName: string) => void;
  canClaim: boolean;
  onOpenClaim: (playerId: string, playerName: string) => void;
  canTrade: boolean;
  onOpenTrade: (playerId: string, teamId: string) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (!isUfa) return;
    let cancelled = false;
    playerSeasonPreview(row.playerId, 'offender', seasonYear)
      .then((pts) => !cancelled && setPreview(pts))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [row.playerId, isUfa, seasonYear]);

  const proj = projections
    ? projectedPoints(projections.get(projectionKey(playerLeague, row.playerId)), 'offender')
    : null;

  const nameBlock = (
    <div className="min-w-0 flex-1">
      {isUfa ? (
        <Link
          href={`/players/${row.playerId}`}
          prefetch={false}
          className="block font-tight text-[14px] font-semibold text-ink truncate hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:underline"
        >
          {row.fullName}
        </Link>
      ) : (
        <span className="block font-tight text-[14px] font-semibold text-ink truncate">{row.fullName}</span>
      )}
      {row.teamName && <span className="block font-tight text-[11.5px] text-muted truncate">{row.teamName}</span>}
      <span className="block font-tight text-[10.5px] text-faint mt-0.5">{row.ownerLabel}</span>
      {row.waiverAvailableAt && (
        <span className="block font-tight text-[10.5px] text-faint mt-0.5">
          {waiverClearsLabel(row.waiverAvailableAt)}
        </span>
      )}
    </div>
  );

  return (
    <div className={['flex items-center gap-3 px-5 py-3', !first ? 'border-t border-hairline' : ''].join(' ')}>
      {nameBlock}
      {isUfa && preview != null && (
        <div className="flex-shrink-0 text-right">
          <span className="font-tight text-[13px] font-bold tabular text-ink">{preview}</span>
          <span className="font-tight text-[9.5px] text-faint ml-1">pts</span>
          {projections && (
            <span className="block font-tight text-[10.5px] text-faint mt-0.5">
              {proj != null ? `Proj ${proj}` : 'Proj —'}
            </span>
          )}
        </div>
      )}
      {canAdd && (
        <button
          type="button"
          onClick={() => onOpenAdd(row.playerId, row.fullName)}
          className={[
            'flex-shrink-0 px-4 py-2 rounded-full min-h-[36px]',
            'bg-accent text-accent-ink font-tight text-[11px] font-bold tracking-[0.04em] uppercase',
            'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          Add
        </button>
      )}
      {canClaim && (
        <button
          type="button"
          onClick={() => onOpenClaim(row.playerId, row.fullName)}
          className={[
            'flex-shrink-0 px-4 py-2 rounded-full min-h-[36px]',
            'bg-accent text-accent-ink font-tight text-[11px] font-bold tracking-[0.04em] uppercase',
            'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          Claim
        </button>
      )}
      {canTrade && row.ownerTeamId && (
        <button
          type="button"
          onClick={() => onOpenTrade(row.playerId, row.ownerTeamId as string)}
          className={[
            'flex-shrink-0 px-4 py-2 rounded-full min-h-[36px]',
            'bg-ink/5 text-ink font-tight text-[11px] font-bold tracking-[0.04em] uppercase',
            'hover:bg-ink/10 transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          Trade
        </button>
      )}
    </div>
  );
}

function DropModal({
  contest,
  addPlayer,
  myOwnership,
  onClose,
  onDone,
}: {
  contest: ContestView;
  addPlayer: { playerId: string; playerName: string };
  myOwnership: { playerId: string; playerName: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const league = contest.competitionDef.playerLeague;

  const handleDrop = async (dropPlayerId: string, dropPlayerName: string) => {
    setSaving(dropPlayerId);
    setError(null);
    try {
      await addDrop(
        contest.id,
        { playerLeague: league, playerId: dropPlayerId, playerName: dropPlayerName },
        { playerLeague: league, playerId: addPlayer.playerId, playerName: addPlayer.playerName },
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the swap.');
      setSaving(null);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drop-modal-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-[440px] max-h-[75%] overflow-y-auto bg-surface rounded-t-card-lg sm:rounded-card-lg shadow-hero">
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3">
          <span id="drop-modal-title" className="font-tight text-[15px] font-bold text-ink">
            Drop who?
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className={[
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
              'text-faint hover:text-ink hover:bg-ink/5 transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="px-6 pb-3 font-tight text-[12.5px] text-muted">
          Adding {addPlayer.playerName} — choose a player to drop from your roster.
        </p>
        {error && <p className="px-6 pb-2 font-tight text-[12px] text-live">{error}</p>}
        <div className="pb-6">
          {myOwnership.map((p, idx) => (
            <button
              key={p.playerId}
              type="button"
              onClick={() => void handleDrop(p.playerId, p.playerName)}
              disabled={saving != null}
              className={[
                'w-full flex items-center gap-3 px-6 py-3 text-left cursor-pointer',
                'hover:bg-surface-hi transition-colors duration-150',
                idx > 0 ? 'border-t border-hairline' : '',
                'focus-visible:outline-none focus-visible:bg-surface-hi',
              ].join(' ')}
            >
              <span className="flex-1 font-tight text-[14px] font-medium text-ink">{p.playerName}</span>
              {saving === p.playerId && (
                <div className="w-4 h-4 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default PlayersPanel;
