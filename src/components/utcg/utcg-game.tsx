'use client';

// UtcgGame — the whole client-side game orchestrator (phase/tab state
// machine, like TwelveOhGame). Owns coins/owned/recentPulls/squad-in-progress
// state, lifted here and passed down via props. No context/redux.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { UtcgSnapshot, OwnedCard } from '@/lib/utcg/server';
import type { PackKind } from '@/lib/utcg/packs';
import { PACKS, FREE_PACK_INTERVAL_MS } from '@/lib/utcg/packs';
import type { PackPull, SquadCardRef } from '@/lib/utcg/actions';
import { openPack, quicksell, recordMatch, getPullHeadshots } from '@/lib/utcg/actions';
import type { FormationKey } from '@/lib/utcg/formations';
import { FORMATIONS, scoreSquad, type SquadScoreResult, type ScoredCard } from '@/lib/utcg/formations';
import type { DraftRun, DraftRoundResult } from '@/lib/utcg/draft';
import { mapDraftRun, startDraft, pickDraftCard, playDraftRound, abandonDraft, DRAFT_ENTRY_FEE } from '@/lib/utcg/draft';
import { AuthModal } from '@/components/auth/auth-modal';
import { PackStore } from '@/components/utcg/pack-store';
import { PackOpenAnimation } from '@/components/utcg/pack-open-animation';
import { CollectionGrid } from '@/components/utcg/collection-grid';
import { FormationSelect } from '@/components/utcg/formation-select';
import { SquadBuilder, type SquadAssignment } from '@/components/utcg/squad-builder';
import { MatchResult } from '@/components/utcg/match-result';
import { CoinGlyph } from '@/components/utcg/coin-glyph';
import { PlayModeSelect, type PlayMode } from '@/components/utcg/draft-mode';
import { DraftPick } from '@/components/utcg/draft-pick';
import { DraftGauntlet } from '@/components/utcg/draft-gauntlet';
import { Marketplace } from '@/components/utcg/marketplace/Marketplace';
import { ListCardModal } from '@/components/utcg/marketplace/ListCardModal';
import type { UtcgCard } from '@/lib/utcg/data';

// ─── Types ───────────────────────────────────────────────────────────────

type Tab = 'play' | 'packs' | 'collection' | 'market';
// 'build' phases sit under the Play tab, Squad Battle sub-flow:
// mode-select -> formation-select -> squad-builder -> result
type BuildPhase = 'mode-select' | 'formation-select' | 'squad-builder' | 'result';
// Draft sub-flow phases, entered from mode-select's Draft card.
type DraftPhase = 'formation-select' | 'run';

function ownedKey(o: { playerId: string; teamSlug: string; year: number }): string {
  return `${o.playerId}|${o.teamSlug}|${o.year}`;
}

interface UtcgGameProps {
  snapshot: UtcgSnapshot;
}

export function UtcgGame({ snapshot }: UtcgGameProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('play');

  // Wallet + collection — seeded from snapshot, optimistically mutated.
  const [coins, setCoins] = useState(snapshot.wallet?.coins ?? 0);
  const [owned, setOwned] = useState<OwnedCard[]>(snapshot.owned);
  const [freePackReadyInMs, setFreePackReadyInMs] = useState(snapshot.wallet?.freePackReadyInMs ?? 0);

  // Re-sync local state whenever the server snapshot prop reference changes
  // (i.e. after router.refresh() re-runs getUtcgSnapshot() on the page).
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    if (snapshotRef.current === snapshot) return;
    snapshotRef.current = snapshot;
    setCoins(snapshot.wallet?.coins ?? 0);
    setOwned(snapshot.owned);
    setFreePackReadyInMs(snapshot.wallet?.freePackReadyInMs ?? 0);
  }, [snapshot]);

  // Pack opening flow
  const [opening, setOpening] = useState<PackKind | null>(null);
  const [recentPulls, setRecentPulls] = useState<PackPull[] | null>(null);
  const [openingPackKind, setOpeningPackKind] = useState<PackKind | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  // Build/play flow — starts at the Squad Battle vs Draft mode picker.
  const [buildPhase, setBuildPhase] = useState<BuildPhase>('mode-select');
  const [formationKey, setFormationKey] = useState<FormationKey | null>(null);
  const [assignment, setAssignment] = useState<SquadAssignment>([]);
  const [matchResultData, setMatchResultData] = useState<SquadScoreResult | null>(null);
  const [coinsAwarded, setCoinsAwarded] = useState<number | null>(null);
  const [rewardCapped, setRewardCapped] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  // ── Draft mode ────────────────────────────────────────────────────────
  // Seed from the snapshot's activeDraftRun (server-resolved, survives a
  // reload) so a run mid-draft or mid-gauntlet resumes on its own screen
  // rather than dropping the user back at mode-select.
  const [draftRun, setDraftRun] = useState<DraftRun | null>(() =>
    snapshot.activeDraftRun ? mapDraftRun(snapshot.activeDraftRun) : null,
  );
  const [playMode, setPlayMode] = useState<PlayMode | null>(() => (snapshot.activeDraftRun ? 'draft' : null));
  const [draftPhase, setDraftPhase] = useState<DraftPhase>(() => (snapshot.activeDraftRun ? 'run' : 'formation-select'));
  const [draftPicking, setDraftPicking] = useState(false);
  const [draftPickError, setDraftPickError] = useState<string | null>(null);
  const [draftPlaying, setDraftPlaying] = useState(false);
  const [draftRoundResult, setDraftRoundResult] = useState<DraftRoundResult | null>(null);
  const [draftGauntletError, setDraftGauntletError] = useState<string | null>(null);
  const [draftStartError, setDraftStartError] = useState<string | null>(null);
  // Headshots for the players in the active draft run (deals + picks). The RPC
  // payload stays thin, so we resolve photos client-side from ufa_players —
  // same idiom as the pack reveal — and pass them into draftCardToUtcgCard so
  // draft & gauntlet cards show real photos instead of always-monogram.
  const [draftHeadshots, setDraftHeadshots] = useState<Map<string, string>>(() => new Map());

  // Market — the card currently open in the ListCardModal (Collection tab's
  // "tap a card to list it" entry point). null = modal closed.
  const [listingCard, setListingCard] = useState<UtcgCard | null>(null);

  // Auth CTA
  const [authOpen, setAuthOpen] = useState(false);

  // Coin pill "charge" flash — briefly pulses the header pill after a paid
  // pack purchase fires, giving purchase feedback while the request is in
  // flight (mock: .coinpill-in.flash). Free-pack opens don't spend coins, so
  // they're excluded.
  const [flashCoins, setFlashCoins] = useState(false);
  useEffect(() => {
    if (!opening || opening === 'free') return;
    setFlashCoins(true);
    const t = setTimeout(() => setFlashCoins(false), 700);
    return () => clearTimeout(t);
  }, [opening]);

  const ownedByKey = useCallback(
    (key: string) => owned.find((o) => ownedKey(o.card) === key) ?? null,
    [owned],
  );

  // ── Pack opening ─────────────────────────────────────────────────────────

  const handleOpenPack = useCallback(
    async (kind: PackKind) => {
      setPackError(null);
      setOpening(kind);
      try {
        const pulls = await openPack(kind);
        // Optimistic: decrement coins immediately for a snappy feel.
        setCoins((c) => Math.max(0, c - PACKS[kind].price));
        // Optimistically fold pulls into `owned` so the collection feels live
        // even before router.refresh() reconciles the authoritative list.
        setOwned((prev) => {
          const next = [...prev];
          for (const p of pulls) {
            const key = `${p.playerId}|${p.teamSlug}|${p.year}`;
            const idx = next.findIndex((o) => ownedKey(o.card) === key);
            if (idx >= 0) {
              next[idx] = { ...next[idx], copies: next[idx].copies + 1 };
            }
            // New cards (isNew) aren't hydrated to a full UtcgCard here — the
            // reveal screen shows them from `recentPulls` instead; the
            // background refresh reconciles `owned` with full card data.
          }
          return next;
        });
        if (kind === 'free') setFreePackReadyInMs(FREE_PACK_INTERVAL_MS);
        setRecentPulls(pulls);
        setOpeningPackKind(kind);
        // Reconcile the authoritative owned list + wallet in the background.
        router.refresh();
      } catch (err) {
        setPackError(err instanceof Error ? err.message : 'Could not open pack — try again.');
      } finally {
        setOpening(null);
      }
    },
    [router],
  );

  const handleSellDuplicates = useCallback(
    async (dupes: { playerId: string; teamSlug: string; year: number; qty: number }[]) => {
      setSelling(true);
      setSellError(null);
      try {
        let wallet = null;
        for (const d of dupes) {
          wallet = await quicksell(d.playerId, d.teamSlug, d.year, d.qty);
        }
        if (wallet) setCoins(wallet.coins);
        // Locally decrement/remove sold copies from owned.
        setOwned((prev) =>
          prev
            .map((o) => {
              const dupe = dupes.find((d) => ownedKey(o.card) === `${d.playerId}|${d.teamSlug}|${d.year}`);
              if (!dupe) return o;
              return { ...o, copies: Math.max(0, o.copies - dupe.qty) };
            })
            .filter((o) => o.copies > 0),
        );
        router.refresh();
      } catch (err) {
        setSellError(err instanceof Error ? err.message : 'Could not sell duplicates — try again.');
      } finally {
        setSelling(false);
      }
    },
    [router],
  );

  const handleDonePack = useCallback(() => {
    setRecentPulls(null);
    setOpeningPackKind(null);
    setSellError(null);
    setTab('packs');
  }, []);

  // ── Build / Play flow (Squad Battle) ─────────────────────────────────────

  const handleSelectSquadBattle = useCallback(() => {
    setPlayMode('squad');
    setBuildPhase('formation-select');
  }, []);

  const handleSelectFormation = useCallback((key: FormationKey) => {
    setFormationKey(key);
    setAssignment(new Array(FORMATIONS[key].slots.length).fill(null));
    setBuildPhase('squad-builder');
  }, []);

  // Back out of a chosen game mode (Squad Battle / Draft) at the formation
  // picker, returning to the Play mode-select screen. Clears any in-progress
  // formation choice and the draft start error.
  const handleBackToModeSelect = useCallback(() => {
    setPlayMode(null);
    setFormationKey(null);
    setAssignment([]);
    setDraftStartError(null);
    setDraftPhase('formation-select');
    setBuildPhase('mode-select');
  }, []);

  const handleChangeFormation = useCallback(() => {
    setFormationKey(null);
    setAssignment([]);
    setBuildPhase('formation-select');
  }, []);

  const handlePlayMatch = useCallback(async () => {
    if (!formationKey) return;
    const formation = FORMATIONS[formationKey];
    // Ordered card refs, one per slot (handlers first). All 7 must be filled —
    // the Play Match button is only enabled when the squad is complete.
    const cards: ScoredCard[] = [];
    const refs: SquadCardRef[] = [];
    for (let i = 0; i < assignment.length; i++) {
      const key = assignment[i];
      if (!key) continue;
      const o = ownedByKey(key);
      if (!o) continue;
      cards.push({
        teamSlug: o.card.teamSlug,
        division: o.card.division,
        position: o.card.position,
        slot: formation.slots[i],
        playerScore: o.card.playerScore,
      });
      refs.push({ playerId: o.card.playerId, teamSlug: o.card.teamSlug, year: o.card.year });
    }

    // Local scoreSquad() drives the instant preview (record + strength bar);
    // the SERVER recomputes authoritatively and its numbers win for coins.
    const result = scoreSquad(cards);
    setMatchResultData(result);
    setCoinsAwarded(null);
    setRewardCapped(false);
    setMatchError(null);
    setBuildPhase('result');

    try {
      const outcome = await recordMatch(formationKey, refs);
      setCoins(outcome.coins);
      setCoinsAwarded(outcome.reward);
      setRewardCapped(outcome.capped);
      // Reconcile the displayed record to the server's authoritative result
      // (near-always identical to the preview; this guarantees they never drift).
      setMatchResultData((prev) =>
        prev
          ? { ...prev, record: { ...prev.record, wins: outcome.wins, losses: outcome.losses } }
          : prev,
      );
      router.refresh();
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Could not record match — coins not awarded.');
    }
  }, [formationKey, assignment, ownedByKey, router]);

  const handleBuildAgain = useCallback(() => {
    setFormationKey(null);
    setAssignment([]);
    setMatchResultData(null);
    setCoinsAwarded(null);
    setRewardCapped(false);
    setMatchError(null);
    setBuildPhase('mode-select');
  }, []);

  const handleBackToPlay = useCallback(() => {
    handleBuildAgain();
    setTab('play');
  }, [handleBuildAgain]);

  const goToPacks = useCallback(() => setTab('packs'), []);

  // ── Draft mode ────────────────────────────────────────────────────────

  const handleSelectDraft = useCallback(() => {
    setPlayMode('draft');
    // A run is already active (resumed from the snapshot, or started earlier
    // this session) — jump straight to its current screen instead of the
    // formation picker.
    if (draftRun) {
      setDraftPhase('run');
      return;
    }
    setDraftPhase('formation-select');
    setBuildPhase('formation-select'); // reuse the shared formation-select render branch below
  }, [draftRun]);

  // Resolve headshots for whoever is currently in the run (dealt candidates +
  // locked picks). Fetches only ids we don't already have, so advancing a slot
  // or a gauntlet round only pulls the new faces. Cosmetic — failures are
  // swallowed by getPullHeadshots and just fall back to monograms.
  useEffect(() => {
    if (!draftRun) return;
    const ids = [
      ...draftRun.deals.map((c) => c.playerId),
      ...draftRun.picks.map((c) => c.playerId),
    ];
    const missing = ids.filter((id) => !draftHeadshots.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    getPullHeadshots(missing).then((map) => {
      if (cancelled || map.size === 0) return;
      setDraftHeadshots((prev) => {
        const next = new Map(prev);
        for (const [id, url] of map) next.set(id, url);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [draftRun, draftHeadshots]);

  const handleSelectDraftFormation = useCallback(
    async (key: FormationKey) => {
      setDraftStartError(null);
      try {
        // Optimistic: decrement the header coin count immediately. The
        // server is authoritative — a failed start (insufficient coins, a
        // run already active) never actually charges, and router.refresh()
        // below reconciles the real balance either way.
        setCoins((c) => Math.max(0, c - DRAFT_ENTRY_FEE));
        const run = await startDraft(key);
        setDraftRun(run);
        setDraftPhase('run');
        router.refresh();
      } catch (err) {
        // Roll back the optimistic decrement — the entry fee was never charged.
        setCoins((c) => c + DRAFT_ENTRY_FEE);
        const message = err instanceof Error ? err.message : 'Could not start draft — try again.';
        setDraftStartError(message);
        // "already in progress" — the server has a run we don't know about
        // locally yet (e.g. a second tab). Reconcile from a fresh snapshot
        // read instead of leaving the user stuck on a start error.
        if (/already in progress/i.test(message)) {
          router.refresh();
        }
      }
    },
    [router],
  );

  const handleDraftPick = useCallback(
    async (index: number) => {
      if (!draftRun) return;
      setDraftPicking(true);
      setDraftPickError(null);
      try {
        const next = await pickDraftCard(draftRun.id, index);
        setDraftRun(next);
      } catch (err) {
        setDraftPickError(err instanceof Error ? err.message : 'Could not lock in that pick — try again.');
      } finally {
        setDraftPicking(false);
      }
    },
    [draftRun],
  );

  const handlePlayDraftRound = useCallback(async () => {
    if (!draftRun) return;
    setDraftPlaying(true);
    setDraftGauntletError(null);
    try {
      const result = await playDraftRound(draftRun.id);
      setDraftRoundResult(result);
      setDraftRun((prev) =>
        prev
          ? {
              ...prev,
              status: result.status,
              round: result.round,
              bank: result.bank,
              payout: result.payout,
            }
          : prev,
      );
      if (result.coins !== null) setCoins(result.coins);
      if (result.status === 'complete') router.refresh();
    } catch (err) {
      setDraftGauntletError(err instanceof Error ? err.message : 'Could not play that round — try again.');
    } finally {
      setDraftPlaying(false);
    }
  }, [draftRun, router]);

  const handleDraftCashOut = useCallback(async () => {
    if (!draftRun) return;
    try {
      // abandonDraft's payout is already folded into the returned coins
      // balance — no need to apply it separately.
      const { coins: newCoins } = await abandonDraft(draftRun.id);
      setCoins(newCoins);
      setDraftRun(null);
      setDraftRoundResult(null);
      setPlayMode(null);
      setBuildPhase('mode-select');
      router.refresh();
    } catch (err) {
      // Cash-out failing is rare (network) — surface inline rather than
      // silently stranding the user on the draft screen.
      setDraftGauntletError(err instanceof Error ? err.message : 'Could not cash out — try again.');
    }
  }, [draftRun, router]);

  const handleDraftRunDone = useCallback(
    (again: boolean) => {
      setDraftRun(null);
      setDraftRoundResult(null);
      setDraftPickError(null);
      setDraftGauntletError(null);
      if (again) {
        setPlayMode('draft');
        setDraftPhase('formation-select');
        setBuildPhase('formation-select');
      } else {
        setPlayMode(null);
        setBuildPhase('mode-select');
      }
    },
    [],
  );

  // ── Signed-out state ─────────────────────────────────────────────────────

  if (!snapshot.signedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight">
            UTCG
          </p>
          <h1 className="font-display italic text-4xl sm:text-5xl font-bold text-ink leading-[0.95] tracking-[-0.02em]">
            Collect. Build. <span className="text-accent">Go undefeated.</span>
          </h1>
          <p className="text-sm text-muted font-tight max-w-[320px]">
            Open packs of UFA player cards, build a squad around real chemistry, and simulate your season.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className={[
              'inline-flex items-center justify-center px-8 py-3.5 rounded-full',
              'text-[12px] font-bold tracking-[0.16em] uppercase font-tight',
              'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'min-h-[52px] cursor-pointer',
            ].join(' ')}
          >
            Sign in to play
          </button>
        </div>
        <AuthModal
          open={authOpen}
          dismissible
          initialMode="signin"
          onDismiss={() => setAuthOpen(false)}
          headline="Sign in to collect cards"
        />
      </div>
    );
  }

  const showPackReveal = recentPulls !== null && openingPackKind !== null;
  // Draft's pick/gauntlet screens are full-screen takeovers (same idiom as
  // PackOpenAnimation), shown whenever a run exists and we're in the 'run'
  // draft phase — regardless of which tab is active, mirroring how a pack
  // reveal also overlays everything.
  const showDraftRun = playMode === 'draft' && draftPhase === 'run' && draftRun !== null;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header: compact single row (wordmark + eyebrow, coin pill) + a
          desktop-only segmented tab row beneath it. The full marketing
          tagline only belongs on the signed-out hero above — once signed in,
          the user already knows what UTCG is, so this stays slim and lets
          tab content start higher on screen. */}
      <div className="border-b border-hairline px-4 py-3 sm:px-6 lg:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h1 className="font-display italic text-2xl font-bold text-ink leading-none tracking-[-0.02em]">
                UTCG
              </h1>
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight truncate">
                The Layout
              </p>
            </div>
            <div
              className={[
                'flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3.5 py-2 min-h-[36px]',
                'motion-safe:transition-transform motion-safe:duration-300',
                flashCoins ? 'motion-safe:scale-110' : 'motion-safe:scale-100',
              ].join(' ')}
            >
              <CoinGlyph size={15} className="text-accent" />
              <span className="font-display font-bold text-[15px] text-ink tabular leading-none">
                {coins.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase content — bottom padding clears the fixed tab bar. */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-6 pb-[calc(env(safe-area-inset-bottom)+96px)]">
          {tab === 'play' && (
            <>
              {/* First-time onboarding — a new user owns no cards yet, so they
                  can't build a Squad Battle squad. Prompt them to open their
                  first (free) pack right away instead of the mode picker —
                  Draft doesn't need this gate (its cards are server-dealt,
                  not from the collection), but a brand-new signed-in user
                  reaching UTCG for the first time should meet the free-pack
                  hook before either mode, matching the existing first-run flow. */}
              {owned.length === 0 && buildPhase === 'mode-select' ? (
                <FirstPackPrompt
                  freePackReadyInMs={freePackReadyInMs}
                  opening={opening === 'free'}
                  onOpenFreePack={() => handleOpenPack('free')}
                  onGoToPacks={goToPacks}
                  error={packError}
                />
              ) : (
                buildPhase === 'mode-select' && (
                  <PlayModeSelect
                    activeDraftRun={draftRun}
                    onSelectSquad={handleSelectSquadBattle}
                    onSelectDraft={handleSelectDraft}
                  />
                )
              )}
              {buildPhase === 'formation-select' && playMode === 'squad' && (
                <FormationSelect onSelect={handleSelectFormation} onBack={handleBackToModeSelect} />
              )}
              {buildPhase === 'formation-select' && playMode === 'draft' && (
                <>
                  {draftStartError && (
                    <p className="text-[12px] text-center text-muted font-tight rounded-card bg-surface shadow-card px-4 py-3 mb-4" role="alert">
                      {draftStartError}
                      {/insufficient/i.test(draftStartError) && (
                        <button
                          type="button"
                          onClick={goToPacks}
                          className="ml-2 font-bold text-accent underline underline-offset-2 cursor-pointer"
                        >
                          Open Packs
                        </button>
                      )}
                    </p>
                  )}
                  <FormationSelect onSelect={handleSelectDraftFormation} onBack={handleBackToModeSelect} />
                </>
              )}
              {buildPhase === 'squad-builder' && formationKey && (
                <SquadBuilder
                  formationKey={formationKey}
                  owned={owned}
                  assignment={assignment}
                  onAssignmentChange={setAssignment}
                  onChangeFormation={handleChangeFormation}
                  onPlayMatch={handlePlayMatch}
                  onGoToPacks={goToPacks}
                />
              )}
              {buildPhase === 'result' && matchResultData && (
                <MatchResult
                  result={matchResultData}
                  coinsAwarded={coinsAwarded}
                  rewardCapped={rewardCapped}
                  matchError={matchError}
                  onBuildAgain={handleBuildAgain}
                  onBackToPlay={handleBackToPlay}
                />
              )}
            </>
          )}

          {tab === 'packs' && (
            <PackStore
              coins={coins}
              freePackReadyInMs={freePackReadyInMs}
              onOpenPack={handleOpenPack}
              opening={opening}
              actionError={packError}
            />
          )}

          {tab === 'collection' && <CollectionGrid owned={owned} onListCard={setListingCard} />}

          {tab === 'market' && (
            <Marketplace
              owned={owned}
              coins={coins}
              userId={snapshot.userId}
              onCoinsChange={setCoins}
              onMutated={() => router.refresh()}
            />
          )}
        </div>
      </div>

      {listingCard && (
        <ListCardModal
          card={listingCard}
          onClose={() => setListingCard(null)}
          onListed={() => {
            setListingCard(null);
            router.refresh();
          }}
        />
      )}

      {/* Bottom tab bar — matches the app's floating-pill mobile nav pattern,
          but state-driven (UTCG's tabs are internal, not routes). Hidden while
          a full-screen pack reveal or draft run is up (those overlays sit
          above it anyway). */}
      {!showPackReveal && !showDraftRun && (
        <UtcgTabBar tab={tab} onChange={setTab} />
      )}

      {showPackReveal && (
        <PackOpenAnimation
          pulls={recentPulls}
          packKind={openingPackKind}
          onSellDuplicates={handleSellDuplicates}
          selling={selling}
          sellError={sellError}
          onDone={handleDonePack}
        />
      )}

      {showDraftRun && draftRun && (
        draftRun.status === 'drafting' ? (
          <DraftPick
            run={draftRun}
            headshots={draftHeadshots}
            onPick={handleDraftPick}
            onCashOut={handleDraftCashOut}
            picking={draftPicking}
            error={draftPickError}
          />
        ) : (
          <DraftGauntlet
            run={draftRun}
            headshots={draftHeadshots}
            lastResult={draftRoundResult}
            onPlayRound={handlePlayDraftRound}
            onCashOut={handleDraftCashOut}
            onDone={handleDraftRunDone}
            playing={draftPlaying}
            error={draftGauntletError}
          />
        )
      )}
    </div>
  );
}

// First-run onboarding shown on the Play tab when the user owns no cards yet.
// Prompts them to open their free pack (a full 7-card squad) right away.
function FirstPackPrompt({
  freePackReadyInMs,
  opening,
  onOpenFreePack,
  onGoToPacks,
  error,
}: {
  freePackReadyInMs: number;
  opening: boolean;
  onOpenFreePack: () => void;
  onGoToPacks: () => void;
  error: string | null;
}) {
  const freeReady = freePackReadyInMs <= 0;
  return (
    <div className="flex flex-col items-center text-center gap-6 py-10 sm:py-16 max-w-md mx-auto">
      <span className="inline-flex items-center px-3 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-[0.16em] font-tight">
        Welcome
      </span>
      <h2 className="font-display italic text-3xl sm:text-4xl font-bold text-ink leading-[0.95] tracking-[-0.02em]">
        Open your <span className="text-accent">first pack</span>
      </h2>
      <p className="text-sm text-muted font-tight max-w-[320px]">
        Every pack is a full 7-card squad. Rip your free one to get your starting
        lineup — then build for chemistry and play your first match.
      </p>

      {freeReady ? (
        <button
          type="button"
          onClick={onOpenFreePack}
          disabled={opening}
          className={[
            'inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full',
            'text-[13px] font-bold tracking-[0.14em] uppercase font-tight',
            'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'min-h-[56px] min-w-[220px] cursor-pointer disabled:opacity-60 disabled:cursor-wait',
          ].join(' ')}
        >
          {opening ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Opening…
            </>
          ) : (
            'Open Free Pack'
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onGoToPacks}
          className={[
            'inline-flex items-center justify-center px-8 py-4 rounded-full',
            'text-[13px] font-bold tracking-[0.14em] uppercase font-tight',
            'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'min-h-[56px] min-w-[220px] cursor-pointer',
          ].join(' ')}
        >
          Browse Packs
        </button>
      )}

      {error && (
        <p className="text-[12px] text-live font-tight" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Tab definitions — single source of truth rendered by BOTH the mobile
// floating bar and the desktop segmented control below.
const UTCG_TABS: { id: Tab; label: string; icon: 'play' | 'packs' | 'collection' | 'market' }[] = [
  { id: 'play', label: 'Play', icon: 'play' },
  { id: 'packs', label: 'Packs', icon: 'packs' },
  { id: 'collection', label: 'Cards', icon: 'collection' },
  { id: 'market', label: 'Market', icon: 'market' },
];

// Bottom tab bar — a floating glass pill matching the app's MobileBottomNav
// pattern (fixed above the safe-area, rounded-full, backdrop-blur, accent-disc
// on the active tab). UTCG's tabs are internal state, so this is state-driven
// rather than route-based; icon + short label since there are only three.
// Shown on every breakpoint — a centered pill that stays compact (max-w-sm)
// so it reads as a deliberate floating control rather than stranded in empty
// space at 1440px, matching how we bottom-anchor the switcher on mobile.
function UtcgTabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="UTCG sections"
      className={[
        'fixed bottom-[max(env(safe-area-inset-bottom),0.75rem)] inset-x-3 z-40 mx-auto max-w-sm',
        'rounded-full border border-hairline/60 bg-surface/90 backdrop-blur-md shadow-lift',
        'px-2 py-2 flex items-center justify-around',
      ].join(' ')}
    >
      {UTCG_TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={active ? 'page' : undefined}
            aria-label={t.label}
            className={[
              'flex flex-col items-center justify-center gap-0.5 min-w-[64px] h-12 rounded-full',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'cursor-pointer',
              active ? 'bg-accent/15' : '',
            ].join(' ')}
          >
            <UtcgTabIcon kind={t.icon} active={active} />
            <span
              className={[
                'text-[9px] font-bold tracking-[0.08em] uppercase font-tight leading-none',
                active ? 'text-accent' : 'text-muted',
              ].join(' ')}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function UtcgTabIcon({ kind, active, size = 20 }: { kind: 'play' | 'packs' | 'collection' | 'market'; active: boolean; size?: number }) {
  // Active = full accent; inactive = a muted ink tone (NOT low-opacity accent
  // — accent/45 on cream washes out to near-illegible, confirmed in the
  // pre-restyle screenshots).
  const c = active ? 'text-accent' : 'text-muted';
  if (kind === 'play') {
    // Disc-in-motion / play — a flying disc arc.
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={c}>
        <ellipse cx="10" cy="10" rx="8" ry="4.2" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="10" cy="10" rx="4" ry="2.1" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      </svg>
    );
  }
  if (kind === 'packs') {
    // Pack / envelope glyph.
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={c}>
        <rect x="4" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 6.5h12" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3v3.5M12 3v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    );
  }
  if (kind === 'collection') {
    // collection — stacked cards.
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={c}>
        <rect x="6" y="4" width="10" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.5 6.5v8A1.5 1.5 0 0 0 5 16h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    );
  }
  // market — price tag.
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className={c}>
      <path
        d="M10.5 3.5h4a1 1 0 0 1 1 1v4a1 1 0 0 1-.3.7l-7.2 7.2a1 1 0 0 1-1.4 0l-4.7-4.7a1 1 0 0 1 0-1.4l7.2-7.2a1 1 0 0 1 .7-.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="7" r="1.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
