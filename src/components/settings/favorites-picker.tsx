'use client';

// FavoritesPicker — league-first favorites editor (leagues.ts LEAGUE_DISPLAY
// order: UFA, USAU, PUL, WUL, Worlds). Each league is a toggle row; turning a
// league ON expands it inline to a team search (scoped to that league only)
// plus the user's favorited teams in that league, each removable. Turning a
// league OFF removes the league AND cascades to remove every team nested
// under it (optimistic, no confirm — it's the user's own data).
//
// Self-contained + chrome-less by design: the parent (a settings card or a
// modal) supplies the surrounding container/header, passes in the initial
// favorites (already fetched via getMyFavorites), and this component owns all
// persistence (setFavoriteLeagues / addFavoriteTeam / removeFavoriteTeam,
// called optimistically) plus an onChange callback so the parent can key a
// "Done" button off the latest state.
//
// Lifts its tokens, SaveIndicator idiom, TeamSearch dropdown behavior, and
// SearchResultIcon usage directly from favorites-settings.tsx (the flat UI
// this replaces) — same font-tight / text-ink/muted/faint / bg-surface /
// bg-accent / border-hairline system, same 44px touch targets.

import { useEffect, useRef, useState } from 'react';
import {
  FAVORITE_LEAGUES,
  MAX_FAVORITE_TEAMS,
  MAX_FAVORITE_PLAYERS,
  addFavoriteTeam,
  removeFavoriteTeam,
  addFavoritePlayer,
  removeFavoritePlayer,
  setFavoriteLeagues,
  type FavoriteLeague,
  type FavoriteTeam,
  type FavoritePlayer,
} from '@/lib/favorites/data';
import { LEAGUE_DISPLAY } from '@/lib/for-you/leagues';
import { searchAll } from '@/lib/ufa/search-actions';
import type { SearchResult } from '@/lib/usau/search-nav';
import { SearchResultIcon } from '@/components/search-result-icon';
import { SearchGlyph } from '@/components/search-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface FavoritesPickerProps {
  initialLeagues: FavoriteLeague[];
  initialTeams: FavoriteTeam[];
  /** Favorite players, if the caller loaded them. Defaults to [] — a caller
   *  that doesn't pass them (or passes an empty list) simply shows no players
   *  and the picker still works team-only. */
  initialPlayers?: FavoritePlayer[];
  onChange?: (state: {
    leagues: FavoriteLeague[];
    teams: FavoriteTeam[];
    players: FavoritePlayer[];
  }) => void;
}

// ─── Small shared bits (lifted from favorites-settings.tsx) ───────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-faint font-tight normal-case tracking-normal">
        <span
          className="w-2.5 h-2.5 rounded-full border-2 border-current/30 border-t-current animate-spin"
          aria-hidden="true"
        />
        Saving
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="text-[9px] font-medium text-[#22c55e] font-tight normal-case tracking-normal">
        Saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-[9px] font-medium text-live font-tight normal-case tracking-normal">
        Save failed
      </span>
    );
  }
  return null;
}

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Down chevron, rotates 180° open — matches usau-schedule.tsx's disclosure
// convention (transition-transform duration-150, group-open:rotate-180),
// adapted here to a controlled `open` boolean since the toggle switch itself
// (not a <summary>) drives expand/collapse.
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={[
        'text-faint transition-transform duration-150 flex-shrink-0',
        open ? 'rotate-180' : '',
      ].join(' ')}
    >
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

// ─── Per-league scoped search (teams OR players) ────────────────────────────────

function LeagueEntitySearch({
  league,
  mode,
  existingIds,
  onAdd,
}: {
  league: FavoriteLeague;
  mode: 'team' | 'player';
  /** Ids already favorited in this mode, to disable them in results. */
  existingIds: Set<string>;
  onAdd: (r: SearchResult) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const noun = mode === 'team' ? 'team' : 'player';

  // Debounced, league-scoped search filtered to the active mode.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchAll(q, 16);
        if (!cancelled) {
          setResults(r.filter((res) => res.kind === mode && res.league === league));
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, league, mode]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const alreadyFavorited = (r: SearchResult) => existingIds.has(r.id);

  async function handleSelect(r: SearchResult) {
    if (!r.league || alreadyFavorited(r)) return;
    setAddError(null);
    setQuery('');
    setResults([]);
    setOpen(false);
    try {
      await onAdd(r);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <span aria-hidden="true" className="absolute left-3 text-faint pointer-events-none">
          <SearchGlyph size={13} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAddError(null);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={`Add a ${LEAGUE_DISPLAY[league]} ${noun}…`}
          aria-label={`Search ${LEAGUE_DISPLAY[league]} ${noun}s to favorite`}
          spellCheck={false}
          className={[
            'w-full bg-surface px-3 pl-8 py-2 text-[13px] font-semibold text-ink font-tight rounded-full',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors min-h-[40px]',
          ].join(' ')}
        />
        {loading && (
          <span
            className="absolute right-3 w-3.5 h-3.5 rounded-full border-2 border-ink/15 border-t-accent animate-spin"
            aria-hidden="true"
          />
        )}
      </div>

      {addError && (
        <p role="alert" className="text-[11px] font-tight text-live mt-1.5">
          {addError}
        </p>
      )}

      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 left-0 right-0 mt-1.5 bg-surface rounded-card shadow-lift overflow-hidden">
          <div className="max-h-[240px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-4 text-[12px] text-faint font-tight">
                {loading ? 'Searching…' : `No ${LEAGUE_DISPLAY[league]} ${noun}s found.`}
              </div>
            ) : (
              results.map((r) => {
                const already = alreadyFavorited(r);
                return (
                  <button
                    key={`${r.league}-${r.id}`}
                    type="button"
                    onClick={() => handleSelect(r)}
                    disabled={already}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      'focus-visible:outline-none',
                      already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-hi cursor-pointer',
                    ].join(' ')}
                  >
                    <SearchResultIcon result={r} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-ink font-tight leading-tight truncate">
                        {r.name}
                      </span>
                      {r.hint && (
                        <span className="block text-[11px] font-medium text-faint font-tight truncate mt-0.5">
                          {r.hint}
                        </span>
                      )}
                    </span>
                    {already && (
                      <span className="shrink-0 text-[9px] font-bold tracking-[0.1em] uppercase font-tight text-faint">
                        Added
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nested favorite row (team or player) ───────────────────────────────────────

function NestedEntityRow({
  icon,
  name,
  hint,
  onRemove,
}: {
  icon: SearchResult;
  name: string;
  hint: string | null;
  onRemove: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  function handleRemove() {
    if (removing) return;
    setRemoving(true);
    onRemove();
  }

  return (
    <div className="flex items-center gap-3 pl-3 pr-2 py-2 rounded-full bg-surface">
      <SearchResultIcon result={icon} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-semibold text-ink font-tight leading-tight truncate">
          {name}
        </span>
        {hint && (
          <span className="block text-[10.5px] font-medium text-faint font-tight leading-tight truncate mt-0.5">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        aria-label={`Remove ${name} from favorites`}
        className={[
          'inline-flex items-center justify-center min-w-[36px] min-h-[36px] -my-2 -mr-1 rounded-full flex-shrink-0',
          'text-faint hover:text-ink hover:bg-ink/[0.06] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          removing ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <CloseGlyph />
      </button>
    </div>
  );
}

// ─── Single league row (toggle + nested expand) ────────────────────────────────

function LeagueRow({
  league,
  isSelected,
  teams,
  players,
  onToggle,
  onAddTeam,
  onRemoveTeam,
  onAddPlayer,
  onRemovePlayer,
  status,
}: {
  league: FavoriteLeague;
  isSelected: boolean;
  teams: FavoriteTeam[];
  players: FavoritePlayer[];
  onToggle: () => void;
  onAddTeam: (team: FavoriteTeam) => Promise<void>;
  onRemoveTeam: (team: FavoriteTeam) => void;
  onAddPlayer: (player: FavoritePlayer) => Promise<void>;
  onRemovePlayer: (player: FavoritePlayer) => void;
  status: SaveStatus;
}) {
  // Which entity the expanded search targets. WFDF players route by-name and
  // have no rich stats, but they're still favoritable (their profile resolves),
  // so we allow the players tab for every league.
  const [mode, setMode] = useState<'team' | 'player'>('team');

  const count = teams.length + players.length;

  async function handleAdd(r: SearchResult) {
    if (mode === 'team') {
      await onAddTeam({ league, teamId: r.id, name: r.name, logoUrl: r.logoUrl ?? null });
    } else {
      await onAddPlayer({
        league,
        playerId: r.id,
        name: r.name,
        teamName: r.hint ?? null,
        headshotUrl: null, // headshot enriched at feed time (UFA only); not in search results
      });
    }
  }

  const existingIds =
    mode === 'team'
      ? new Set(teams.map((t) => t.teamId))
      : new Set(players.map((p) => p.playerId));

  return (
    <div
      className={[
        'rounded-card-sm transition-colors',
        isSelected ? 'bg-bg' : 'bg-transparent',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isSelected}
        aria-label={
          isSelected ? `Remove ${LEAGUE_DISPLAY[league]} from favorites` : `Add ${LEAGUE_DISPLAY[league]} to favorites`
        }
        className={[
          'flex w-full items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-card-sm',
          'font-tight text-left transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {/* Checkbox-style indicator */}
        <span
          aria-hidden="true"
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 transition-colors',
            isSelected ? 'bg-accent text-accent-ink' : 'bg-ink/10',
          ].join(' ')}
        >
          {isSelected && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <span className="flex-1 text-[14px] font-bold text-ink tracking-[0.01em]">
          {LEAGUE_DISPLAY[league]}
        </span>

        {isSelected && count > 0 && (
          <span className="text-[10px] font-semibold text-faint font-tight normal-case tracking-normal">
            {count} {count === 1 ? 'pick' : 'picks'}
          </span>
        )}

        {isSelected && status !== 'idle' && <SaveIndicator status={status} />}

        <Chevron open={isSelected} />
      </button>

      {isSelected && (
        <div className="px-3 pb-3 pt-0.5 flex flex-col gap-2">
          {/* Teams / Players sub-toggle */}
          <div className="flex items-center gap-1 self-start rounded-full bg-surface p-0.5">
            {(['team', 'player'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={[
                  'px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.1em] uppercase font-tight cursor-pointer transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  mode === m ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {m === 'team' ? 'Teams' : 'Players'}
              </button>
            ))}
          </div>

          <LeagueEntitySearch
            league={league}
            mode={mode}
            existingIds={existingIds}
            onAdd={handleAdd}
          />

          {/* Favorited teams */}
          {teams.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {teams.map((team) => (
                <NestedEntityRow
                  key={`t-${team.league}-${team.teamId}`}
                  name={team.name}
                  hint={null}
                  icon={{
                    kind: 'team',
                    id: team.teamId,
                    name: team.name,
                    hint: null,
                    league: team.league,
                    logoUrl: team.logoUrl,
                  }}
                  onRemove={() => onRemoveTeam(team)}
                />
              ))}
            </div>
          )}

          {/* Favorited players */}
          {players.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {players.map((player) => (
                <NestedEntityRow
                  key={`p-${player.league}-${player.playerId}`}
                  name={player.name}
                  hint={player.teamName}
                  icon={{
                    kind: 'player',
                    id: player.playerId,
                    name: player.name,
                    hint: player.teamName,
                    league: player.league,
                  }}
                  onRemove={() => onRemovePlayer(player)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function FavoritesPicker({
  initialLeagues,
  initialTeams,
  initialPlayers = [],
  onChange,
}: FavoritesPickerProps) {
  const [leagues, setLeagues] = useState<FavoriteLeague[]>(initialLeagues);
  const [teams, setTeams] = useState<FavoriteTeam[]>(initialTeams);
  const [players, setPlayers] = useState<FavoritePlayer[]>(initialPlayers);
  const [leagueStatus, setLeagueStatus] = useState<Partial<Record<FavoriteLeague, SaveStatus>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Fire onChange after every committed state change (not on mount) so a
  // parent modal can react to the very first edit, not just re-renders.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChange?.({ leagues, teams, players });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagues, teams, players]);

  function setStatus(league: FavoriteLeague, status: SaveStatus) {
    setLeagueStatus((prev) => ({ ...prev, [league]: status }));
    if (status === 'saved') {
      setTimeout(() => {
        setLeagueStatus((prev) => (prev[league] === 'saved' ? { ...prev, [league]: 'idle' } : prev));
      }, 2000);
    }
  }

  async function handleToggle(league: FavoriteLeague) {
    const wasSelected = leagues.includes(league);
    const nextLeagues = wasSelected ? leagues.filter((l) => l !== league) : [...leagues, league];
    const removedTeams = wasSelected ? teams.filter((t) => t.league === league) : [];
    const removedPlayers = wasSelected ? players.filter((p) => p.league === league) : [];
    const nextTeams = wasSelected ? teams.filter((t) => t.league !== league) : teams;
    const nextPlayers = wasSelected ? players.filter((p) => p.league !== league) : players;

    const prevLeagues = leagues;
    const prevTeams = teams;
    const prevPlayers = players;
    setLeagues(nextLeagues);
    setTeams(nextTeams);
    setPlayers(nextPlayers);
    setGlobalError(null);
    setStatus(league, 'saving');

    try {
      // Turning OFF cascades: drop the league AND every nested team + player
      // favorite. Optimistic + no confirm — it's the user's own data.
      await Promise.all([
        setFavoriteLeagues(nextLeagues),
        ...removedTeams.map((t) => removeFavoriteTeam(t.league, t.teamId)),
        ...removedPlayers.map((p) => removeFavoritePlayer(p.league, p.playerId)),
      ]);
      setStatus(league, 'saved');
    } catch (e) {
      // Revert everything for this toggle on failure.
      setLeagues(prevLeagues);
      setTeams(prevTeams);
      setPlayers(prevPlayers);
      setGlobalError(e instanceof Error ? e.message : 'Something went wrong.');
      setStatus(league, 'error');
    }
  }

  async function handleAddTeam(team: FavoriteTeam) {
    // Optimistic add — revert if the write fails (e.g. MAX_FAVORITE_TEAMS cap).
    // Thrown back to LeagueEntitySearch so it can surface the error inline.
    setTeams((prev) => [team, ...prev]);
    try {
      await addFavoriteTeam(team);
    } catch (e) {
      setTeams((prev) => prev.filter((t) => !(t.league === team.league && t.teamId === team.teamId)));
      throw e;
    }
  }

  function handleRemoveTeam(team: FavoriteTeam) {
    const prev = teams;
    setTeams((cur) => cur.filter((t) => !(t.league === team.league && t.teamId === team.teamId)));
    removeFavoriteTeam(team.league, team.teamId).catch(() => {
      setTeams(prev);
    });
  }

  async function handleAddPlayer(player: FavoritePlayer) {
    setPlayers((prev) => [player, ...prev]);
    try {
      await addFavoritePlayer(player);
    } catch (e) {
      setPlayers((prev) =>
        prev.filter((p) => !(p.league === player.league && p.playerId === player.playerId)),
      );
      throw e;
    }
  }

  function handleRemovePlayer(player: FavoritePlayer) {
    const prev = players;
    setPlayers((cur) =>
      cur.filter((p) => !(p.league === player.league && p.playerId === player.playerId)),
    );
    removeFavoritePlayer(player.league, player.playerId).catch(() => {
      setPlayers(prev);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
          Leagues, teams &amp; players
        </span>
        <span className="text-[9px] font-medium text-faint font-tight normal-case tracking-normal">
          {teams.length}/{MAX_FAVORITE_TEAMS} teams · {players.length}/{MAX_FAVORITE_PLAYERS} players
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {FAVORITE_LEAGUES.map((league) => (
          <LeagueRow
            key={league}
            league={league}
            isSelected={leagues.includes(league)}
            teams={teams.filter((t) => t.league === league)}
            players={players.filter((p) => p.league === league)}
            onToggle={() => handleToggle(league)}
            onAddTeam={handleAddTeam}
            onRemoveTeam={handleRemoveTeam}
            onAddPlayer={handleAddPlayer}
            onRemovePlayer={handleRemovePlayer}
            status={leagueStatus[league] ?? 'idle'}
          />
        ))}
      </div>

      {globalError && (
        <p role="alert" className="text-[11px] font-tight text-live">
          {globalError}
        </p>
      )}
    </div>
  );
}
