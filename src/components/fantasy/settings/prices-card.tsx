'use client';

// PricesCard — Settings → Player prices. Auction drafts only, and only while
// the draft is still 'scheduled' (caller gates this). Commissioner searches
// the contest's player pool, adds rows with an opening-bid price, and saves
// the whole sheet via setDraftPrices (full replace). Web port of mobile's
// PricesCard.tsx.
//
// Existing prices load via getDraftPrices, which returns rows WITHOUT a
// resolved name (the prices table only stores playerLeague/playerId/price —
// playerName comes back equal to playerId). Per the mobile comment we keep
// this simple and intentional: when a later search result's playerId matches
// an existing never-resolved row, backfill that row's playerName from the
// search hit. Not a bug — keep it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchContestPlayers } from '@/lib/fantasy/draft';
import { getDraftPrices, setDraftPrices, type Draft, type DraftPrice } from '@/lib/fantasy/draft-room';
import type { ContestView } from '@/lib/fantasy/leagues';
import type { FantasyPlayerHit } from '@/lib/fantasy/data';
import { Card, SaveButton, Feedback } from './shared';

interface Props {
  contest: ContestView;
  draft: Draft;
  onSaved: () => void;
}

interface PriceRow {
  playerLeague: string;
  playerId: string;
  playerName: string;
  price: string; // input text, validated on save
}

const SEARCH_DEBOUNCE_MS = 200;

export function PricesCard({ contest, draft, onSaved }: Props) {
  const playerLeague = contest.competitionDef.playerLeague;

  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FantasyPlayerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load existing prices once.
  useEffect(() => {
    let cancelled = false;
    getDraftPrices(draft.id)
      .then((prices) => {
        if (cancelled) return;
        setRows(
          prices.map((p) => ({
            playerLeague: p.playerLeague,
            playerId: p.playerId,
            playerName: p.playerId,
            price: String(p.price),
          })),
        );
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load saved prices.');
      });
    return () => {
      cancelled = true;
    };
  }, [draft.id]);

  // Resolve names for loaded rows once we have search hits to match against.
  useEffect(() => {
    if (!rows || results.length === 0) return;
    const byId = new Map(results.map((r) => [r.playerId, r.fullName]));
    setRows((prev) =>
      prev
        ? prev.map((r) => (byId.has(r.playerId) && r.playerName === r.playerId ? { ...r, playerName: byId.get(r.playerId)! } : r))
        : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchContestPlayers(contest, q, 20)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, contest]);

  const addPlayer = useCallback(
    (hit: FantasyPlayerHit) => {
      setRows((prev) => {
        const base = prev ?? [];
        if (base.some((r) => r.playerId === hit.playerId)) return base;
        return [...base, { playerLeague, playerId: hit.playerId, playerName: hit.fullName, price: '' }];
      });
      setQuery('');
      setResults([]);
      setSaved(false);
    },
    [playerLeague],
  );

  const removeRow = useCallback((playerId: string) => {
    setRows((prev) => (prev ? prev.filter((r) => r.playerId !== playerId) : prev));
    setSaved(false);
  }, []);

  const setPrice = useCallback((playerId: string, price: string) => {
    setRows((prev) => (prev ? prev.map((r) => (r.playerId === playerId ? { ...r, price } : r)) : prev));
    setSaved(false);
  }, []);

  const existingIds = useMemo(() => new Set((rows ?? []).map((r) => r.playerId)), [rows]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rows || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const priced: DraftPrice[] = rows
        .filter((r) => r.price.trim() !== '')
        .map((r) => ({
          playerLeague: r.playerLeague,
          playerId: r.playerId,
          playerName: r.playerName,
          price: Number(r.price),
        }));
      if (priced.some((p) => !Number.isFinite(p.price) || p.price < 0)) {
        throw new Error('Prices must be non-negative numbers.');
      }
      await setDraftPrices(draft.id, priced);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save prices.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Player prices">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="max-w-[420px]">
          <label htmlFor="prices-search" className="sr-only">
            Search players to price
          </label>
          <input
            id="prices-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players to price…"
            autoComplete="off"
            className={[
              'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
              'font-tight text-[14px] text-ink placeholder:text-faint',
              'focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]',
            ].join(' ')}
          />
        </div>

        {searching ? (
          <p className="font-tight text-[12px] text-faint">Searching…</p>
        ) : results.length > 0 ? (
          <ul className="rounded-card-sm bg-ink/[0.02] overflow-hidden divide-y divide-hairline">
            {results.map((hit) => {
              const already = existingIds.has(hit.playerId);
              return (
                <li key={hit.playerId}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => addPlayer(hit)}
                    className={[
                      'w-full flex items-baseline gap-2 px-3 py-2.5 min-h-[44px] text-left',
                      already ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:bg-ink/[0.04]',
                    ].join(' ')}
                  >
                    <span className="font-tight text-[13.5px] text-ink truncate">{hit.fullName}</span>
                    {hit.teamName && <span className="font-tight text-[11.5px] text-faint truncate">{hit.teamName}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {loadError && (
          <p role="alert" className="text-[12px] text-live font-tight">
            {loadError}
          </p>
        )}

        {rows === null ? (
          <p className="font-tight text-[12.5px] text-faint">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="font-tight text-[12.5px] text-faint">No priced players yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {rows.map((row) => (
              <li key={row.playerId} className="flex items-center gap-2.5 py-2">
                <span className="flex-1 font-tight text-[13.5px] text-ink truncate">{row.playerName}</span>
                <label htmlFor={`price-${row.playerId}`} className="sr-only">
                  Opening price for {row.playerName}
                </label>
                <input
                  id={`price-${row.playerId}`}
                  type="text"
                  inputMode="numeric"
                  value={row.price}
                  onChange={(e) => setPrice(row.playerId, e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="$"
                  className={[
                    'w-[70px] px-2.5 py-2 rounded-card-sm bg-ink/5 text-center',
                    'font-tight text-[13px] font-bold text-ink',
                    'focus:outline-none focus:ring-2 focus:ring-accent min-h-[40px]',
                  ].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.playerId)}
                  aria-label={`Remove ${row.playerName}`}
                  className="w-8 h-8 flex items-center justify-center text-faint hover:text-ink transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full"
                >
                  <span aria-hidden="true" className="text-[18px] leading-none">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <SaveButton disabled={rows === null || saving} saving={saving} label="Save prices" />
        </div>
        <p className="font-tight text-[11px] text-faint">
          Prices are opening bids. Unpriced players open at the minimum bid.
        </p>
      </form>
      <Feedback error={error} saved={saved} />
    </Card>
  );
}
