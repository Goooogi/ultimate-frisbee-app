'use client';

// The Playbook editor — top-level state owner.
//
// Persistence: Supabase. Plays + steps live in the public.plays /
// public.play_steps tables. Teams come from public.team_members.
//
// Two scopes:
//   - 'personal' → plays where owner_id = me, team_id is null
//   - 'team:<id>' → plays where team_id = <id>
// Whichever scope is active controls both the play list shown in the
// sidebar AND the destination of "+ New play". Switching scope reloads
// the list from the server.
//
// Save model: in-memory state changes immediately on every drag/drop so the
// UI stays snappy. A debounced effect (600ms after the last change) flushes
// the current play's metadata + steps to Supabase. The "saved just now"
// indicator in the editor header reflects the last successful flush.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlaybookShell } from './playbook-shell';
import { Field } from './field';
import { StepStrip } from './step-strip';
import { StepRail } from './step-rail';
import { PlaybackControls } from './playback-controls';
import { PlayList } from './play-list';
import { SidebarPlayList } from './sidebar-play-list';
import { CreatePlayDialog } from './create-play-dialog';
import { DrawToolbar } from './draw-toolbar';
import { uid } from '@/lib/playbook/storage';
import {
  PRESETS,
  BRICK_Y,
  seedDefenders,
  remapForHalfField,
  remapDiscForHalfField,
} from '@/lib/playbook/presets';
import { FIELD_GEOM } from '@/lib/playbook/field';
import { DEFAULT_STEP_MS } from '@/lib/playbook/types';
import {
  createPlay as apiCreatePlay,
  deletePlay as apiDeletePlay,
  listMyTeams,
  listPlays,
  renamePlay as apiRenamePlay,
  replaceSteps,
  touchPlay,
  type Team,
} from '@/lib/playbook/data';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatSupabaseError } from '@/lib/supabase/errors';
import type {
  DiscPos,
  Drawing,
  DrawTool,
  FieldType,
  FormationID,
  Play,
  PlayerPos,
  PlayerTeam,
  Step,
} from '@/lib/playbook/types';

type Scope = { kind: 'personal' } | { kind: 'team'; teamID: string };

const SAVE_DEBOUNCE_MS = 600;

export function PlaybookApp() {
  const { user } = useAuth();

  // ── state ────────────────────────────────────────────────────────────────
  const [plays, setPlays] = useState<Play[]>([]);
  const [currentID, setCurrentID] = useState<string | undefined>(undefined);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  // Encoded as `${team}:${id}` so the same selection state can target either
  // an offender or a defender (e.g. "offense:3" / "defense:5").
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hydrated, setHydrated] = useState(false);

  // Teams (the user's memberships).
  const [teams, setTeams] = useState<Team[]>([]);
  const [scope, setScope] = useState<Scope>({ kind: 'personal' });

  // Save state — surfaces "saving…" / "saved just now" / "save failed".
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [tool, setTool] = useState<DrawTool>('cursor');

  // Track which plays have a *dirty* in-memory state vs. last persisted.
  // Only dirty plays get re-flushed by the debounce effect. A play becomes
  // dirty when handlePlayerMove / handleDiscMove / handleAddStep / etc.
  // mutate it. It becomes clean again after a successful flush.
  const dirtyPlaysRef = useRef<Set<string>>(new Set());

  // ── hydrate teams + initial play list ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function hydrate() {
      try {
        const [t, p] = await Promise.all([
          listMyTeams(),
          listPlays({ scope: 'personal' }),
        ]);
        if (cancelled) return;
        setTeams(t);
        setPlays(p);
        setCurrentID(p[0]?.id);
        setCurrentStepIndex(0);
      } catch (err) {
        if (cancelled) return;
        setLastError(formatSupabaseError(err, 'Load playbook'));
        console.error('[playbook-app] hydrate failed', err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Whenever scope changes, refetch plays. We don't reuse the old list —
  // RLS already filtered it, and mixing scopes in the editor would be a
  // mental-model leak.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setPlays([]);
    setCurrentID(undefined);
    setCurrentStepIndex(0);
    setSelectedPlayerKey(null);
    setIsPlaying(false);

    async function load() {
      try {
        const list =
          scope.kind === 'personal'
            ? await listPlays({ scope: 'personal' })
            : await listPlays({ scope: 'team', teamID: scope.teamID });
        if (cancelled) return;
        setPlays(list);
        setCurrentID(list[0]?.id);
      } catch (err) {
        if (cancelled) return;
        setLastError(formatSupabaseError(err, 'Load plays'));
        console.error('[playbook-app] load plays failed', err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.kind === 'team' ? scope.teamID : null]);

  // ── derived ──────────────────────────────────────────────────────────────
  const currentPlay = useMemo(
    () => plays.find((p) => p.id === currentID),
    [plays, currentID],
  );
  const currentStep = currentPlay?.steps[currentStepIndex] ?? currentPlay?.steps[0];
  const prevStep =
    currentPlay && currentStepIndex > 0 ? currentPlay.steps[currentStepIndex - 1] : undefined;
  const canPlay = (currentPlay?.steps.length ?? 0) > 1;

  // ── debounced persistence ────────────────────────────────────────────────
  // Whenever the in-memory plays change, schedule a flush. We only flush
  // plays that are marked dirty. A play that's still being edited gets its
  // flush repeatedly postponed by the debounce, which is what we want —
  // the server only sees the resting state, not every intermediate drag.
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (dirtyPlaysRef.current.size === 0) return;

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    setSaveState('saving');

    flushTimerRef.current = setTimeout(async () => {
      const ids = Array.from(dirtyPlaysRef.current);
      dirtyPlaysRef.current.clear();
      try {
        // Snapshot current state for each dirty play.
        const snapshot = plays.filter((p) => ids.includes(p.id));
        await Promise.all(
          snapshot.map(async (p) => {
            await apiRenamePlay(p.id, p.name);
            await replaceSteps(p.id, p.steps);
            await touchPlay(p.id);
          }),
        );
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        setLastError(formatSupabaseError(err, 'Save'));
        console.error('[playbook-app] flush failed', err);
        // Re-mark the plays as dirty so a future change will retry.
        ids.forEach((id) => dirtyPlaysRef.current.add(id));
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [plays, hydrated]);

  // ── play mutation helpers ────────────────────────────────────────────────
  const markDirty = useCallback((id: string) => {
    dirtyPlaysRef.current.add(id);
  }, []);

  const updatePlay = useCallback(
    (mutator: (p: Play) => Play) => {
      if (!currentID) return;
      markDirty(currentID);
      setPlays((all) =>
        all.map((p) =>
          p.id === currentID
            ? { ...mutator(p), updatedAt: Date.now() }
            : p,
        ),
      );
    },
    [currentID, markDirty],
  );

  const updateCurrentStep = useCallback(
    (mutator: (s: Step) => Step) => {
      updatePlay((p) => ({
        ...p,
        steps: p.steps.map((s, i) => (i === currentStepIndex ? mutator(s) : s)),
        formation: 'custom',
      }));
    },
    [updatePlay, currentStepIndex],
  );

  const handlePlayerMove = useCallback(
    (id: number, x: number, y: number, team: PlayerTeam) => {
      updateCurrentStep((s) => {
        if (team === 'defense') {
          if (!s.defenders) return s;
          return {
            ...s,
            defenders: s.defenders.map((p) => (p.id === id ? { ...p, x, y } : p)),
          };
        }
        return {
          ...s,
          players: s.players.map((p) => (p.id === id ? { ...p, x, y } : p)),
        };
      });
    },
    [updateCurrentStep],
  );

  const handleDiscMove = useCallback(
    (disc: DiscPos) => {
      updateCurrentStep((s) => ({ ...s, disc }));
    },
    [updateCurrentStep],
  );

  const handleDrawingCommit = useCallback(
    (drawing: Drawing) => {
      updateCurrentStep((s) => ({
        ...s,
        drawings: [...(s.drawings ?? []), drawing],
      }));
    },
    [updateCurrentStep],
  );

  const handleClearDrawings = useCallback(() => {
    updateCurrentStep((s) => ({ ...s, drawings: undefined }));
  }, [updateCurrentStep]);

  const handleAddStep = useCallback(() => {
    if (!currentPlay || !currentStep) return;
    const snap: Step = {
      id: uid('step'),
      players: currentStep.players.map((p) => ({ ...p })),
      defenders: currentStep.defenders
        ? currentStep.defenders.map((p) => ({ ...p }))
        : undefined,
      disc: { ...currentStep.disc },
      drawings: undefined,
      durationMs: DEFAULT_STEP_MS,
    };
    updatePlay((p) => ({
      ...p,
      steps: [
        ...p.steps.slice(0, currentStepIndex + 1),
        snap,
        ...p.steps.slice(currentStepIndex + 1),
      ],
    }));
    setCurrentStepIndex((i) => i + 1);
  }, [currentPlay, currentStep, currentStepIndex, updatePlay]);

  const handleDeleteStep = useCallback(
    (idx: number) => {
      if (!currentPlay || currentPlay.steps.length <= 1) return;
      updatePlay((p) => ({ ...p, steps: p.steps.filter((_, i) => i !== idx) }));
      setCurrentStepIndex((i) => Math.max(0, Math.min(i, (currentPlay.steps.length - 2))));
    },
    [currentPlay, updatePlay],
  );

  const handleRename = useCallback(
    (name: string) => {
      updatePlay((p) => ({ ...p, name }));
    },
    [updatePlay],
  );

  const handleOpenCreateDialog = useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const handleConfirmCreate = useCallback(
    async (payload: {
      name: string;
      fieldType: FieldType;
      formation: Exclude<FormationID, 'custom'>;
      withDefense: boolean;
    }) => {
      const firstStep = buildSeedStep(
        payload.formation,
        payload.fieldType,
        payload.withDefense,
      );
      try {
        setSaveState('saving');
        const created = await apiCreatePlay({
          name: payload.name,
          formation: payload.formation,
          fieldType: payload.fieldType,
          firstStep,
          scope:
            scope.kind === 'personal'
              ? { scope: 'personal' }
              : { scope: 'team', teamID: scope.teamID },
        });
        setPlays((all) => [created, ...all]);
        setCurrentID(created.id);
        setCurrentStepIndex(0);
        setSelectedPlayerKey(null);
        setIsPlaying(false);
        setShowCreateDialog(false);
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        setLastError(formatSupabaseError(err, 'Create play'));
        console.error('[playbook-app] createPlay failed', err);
      }
    },
    [scope],
  );

  const handleSelectPlay = useCallback((id: string) => {
    setCurrentID(id);
    setCurrentStepIndex(0);
    setSelectedPlayerKey(null);
    setIsPlaying(false);
  }, []);

  const handleDeletePlay = useCallback(
    async (id: string) => {
      const target = plays.find((p) => p.id === id);
      if (!target) return;
      if (!confirm(`Delete "${target.name}"? This cannot be undone.`)) return;
      try {
        await apiDeletePlay(id);
        setPlays((all) => {
          const remaining = all.filter((p) => p.id !== id);
          if (id === currentID) {
            setCurrentID(remaining[0]?.id);
            setCurrentStepIndex(0);
            setSelectedPlayerKey(null);
            setIsPlaying(false);
          }
          return remaining;
        });
        dirtyPlaysRef.current.delete(id);
      } catch (err) {
        setLastError(formatSupabaseError(err, 'Delete play'));
        console.error('[playbook-app] deletePlay failed', err);
      }
    },
    [plays, currentID],
  );

  // ── playback ─────────────────────────────────────────────────────────────
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (playbackTimer.current) {
      clearTimeout(playbackTimer.current);
      playbackTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPlaying || !currentPlay) return;
    if (currentStepIndex >= currentPlay.steps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const next = currentPlay.steps[currentStepIndex + 1];
    const dwell = Math.max(180, (next.durationMs ?? DEFAULT_STEP_MS) / speed + 200);
    playbackTimer.current = setTimeout(() => {
      setCurrentStepIndex((i) => i + 1);
    }, dwell);
    return clearTimer;
  }, [isPlaying, currentStepIndex, currentPlay, speed, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleTogglePlay = useCallback(() => {
    if (!canPlay) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (currentStepIndex >= (currentPlay?.steps.length ?? 0) - 1) {
      setCurrentStepIndex(0);
      setTimeout(() => setIsPlaying(true), 0);
    } else {
      setIsPlaying(true);
    }
  }, [canPlay, isPlaying, currentStepIndex, currentPlay]);

  const handleRestart = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  }, []);

  const handleStepSelect = useCallback((i: number) => {
    setIsPlaying(false);
    setCurrentStepIndex(i);
    setSelectedPlayerKey(null);
    setTool('cursor');
  }, []);

  // Scope switch — either personal or a specific team. Used by both the
  // sidebar TeamSwitcher and the new "scope" pill chip.
  const handleSwitchScope = useCallback((next: Scope) => {
    setScope(next);
  }, []);

  // PlaybookShell still takes a flat team list + currentTeamID; we
  // translate Scope -> currentTeamID at the boundary.
  const currentTeamID = scope.kind === 'team' ? scope.teamID : undefined;
  const handleShellSwitchTeam = useCallback(
    (id: string) => {
      // The shell's TeamSwitcher uses "personal" as a magic id for the
      // personal scope to avoid changing its signature.
      if (id === '__personal__') {
        handleSwitchScope({ kind: 'personal' });
      } else {
        handleSwitchScope({ kind: 'team', teamID: id });
      }
    },
    [handleSwitchScope],
  );

  // Sidebar plays list is the same in every render path — pre-compute it
  // so loading / empty / editor states can share it.
  const sidebarList = (
    <SidebarPlayList
      plays={plays}
      currentID={currentID}
      onSelect={handleSelectPlay}
      onCreate={handleOpenCreateDialog}
      onDelete={handleDeletePlay}
    />
  );

  // ── render ───────────────────────────────────────────────────────────────
  if (!hydrated) {
    return (
      <PlaybookShell
        teams={teams}
        currentTeamID={currentTeamID}
        onSwitchTeam={handleShellSwitchTeam}
        playsNavExtras={sidebarList}
      >
        <div className="p-8 text-faint text-[13px]">Loading playbook…</div>
      </PlaybookShell>
    );
  }

  if (!currentPlay || !currentStep) {
    return (
      <PlaybookShell
        teams={teams}
        currentTeamID={currentTeamID}
        onSwitchTeam={handleShellSwitchTeam}
        pageTitle="Plays · Editor"
        playsNavExtras={sidebarList}
      >
        <div className="px-4 pt-16 pb-12 lg:px-6 lg:pt-24 lg:pb-12">
          <div className="max-w-[520px] mx-auto text-center flex flex-col items-center gap-5">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              {scope.kind === 'personal' ? 'No personal plays yet' : 'No team plays yet'}
            </span>
            <h1 className="m-0 font-display italic font-bold text-[42px] lg:text-[56px] leading-none tracking-[-0.04em] text-ink">
              Diagram your first play.
            </h1>
            <p className="text-[14px] text-muted font-tight max-w-[440px]">
              Pick a field, a starting formation, and drop your seven on the
              grid. You can always rename, restack, or add steps after.
            </p>
            <button
              type="button"
              onClick={handleOpenCreateDialog}
              className={[
                'inline-flex items-center gap-2 px-5 py-3 rounded-md cursor-pointer mt-2',
                'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
                'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity',
              ].join(' ')}
            >
              + New play
            </button>
          </div>
        </div>

        <CreatePlayDialog
          open={showCreateDialog}
          defaultName={`Play ${plays.length + 1}`}
          onCancel={() => setShowCreateDialog(false)}
          onCreate={handleConfirmCreate}
        />
      </PlaybookShell>
    );
  }

  const transitionMs = isPlaying ? (currentStep.durationMs ?? DEFAULT_STEP_MS) / speed : 0;
  const fieldType: FieldType = currentPlay.fieldType ?? 'full';
  const fieldAspect = FIELD_GEOM[fieldType].aspect;

  const initials = computeInitials(currentPlay.name);
  const currentTeam = teams.find((t) => t.id === currentTeamID);
  const scopeLabel =
    scope.kind === 'personal' ? 'Personal' : (currentTeam?.shortName ?? 'TEAM');
  const stepNumLabel = `Step · ${pad2(currentStepIndex + 1)}`;

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : saveState === 'saved'
          ? 'Saved just now'
          : 'Up to date';

  const editor = (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-1">
        <nav
          aria-label="Play breadcrumb"
          className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase font-tight text-faint min-w-0"
        >
          <span>Playbook</span>
          <span aria-hidden="true" className="text-faint/60">/</span>
          <span className="truncate">{scopeLabel}</span>
          <span aria-hidden="true" className="text-faint/60">/</span>
          <span className="text-ink tabular">{initials}</span>
        </nav>
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase font-tight">
          <span
            aria-hidden="true"
            className={[
              'w-1.5 h-1.5 rounded-full',
              saveState === 'error' ? 'bg-live' : 'bg-accent',
            ].join(' ')}
          />
          <span className={saveState === 'error' ? 'text-live' : 'text-accent'}>Editing</span>
          <span aria-hidden="true" className="text-faint/60">·</span>
          <span className="text-faint">{saveLabel}</span>
        </div>
      </header>

      <div className="px-1">
        <input
          type="text"
          value={currentPlay.name}
          onChange={(e) => handleRename(e.target.value)}
          placeholder="Untitled play"
          spellCheck={false}
          aria-label="Play name"
          // The display font is italic + heavy with negative tracking, which
          // makes WebKit render the text-caret visually *inside* the last
          // glyph (the italic slant overhangs the character's advance width).
          // pr-3 reserves space past the rightmost glyph so the caret sits
          // clearly after the last letter. leading-tight also gives the line
          // box enough vertical room that the caret aligns to the baseline.
          className={[
            'block w-full bg-transparent border-0 outline-none',
            'font-display italic font-bold text-[24px] md:text-[32px] lg:text-[56px] leading-tight tracking-[-0.04em] text-ink',
            'placeholder-faint focus:placeholder-transparent',
            'py-0.5 pr-3 transition-colors',
          ].join(' ')}
        />
      </div>

      <div className="flex flex-col bg-bg border border-hairline rounded-sm overflow-hidden">
        <div className="relative bg-surface px-2 py-2 lg:py-2">
          <div className="flex justify-end pr-2 pb-1 lg:pb-1.5">
            <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">EZ</span>
          </div>

          <div className="relative flex items-stretch gap-1 lg:gap-1.5 pl-2 lg:pl-4">
            <DrawToolbar
              tool={tool}
              onToolChange={setTool}
              onClear={handleClearDrawings}
              canClear={(currentStep.drawings?.length ?? 0) > 0}
            />

            <div className="flex-1 relative flex justify-center">
              <div
                className={[
                  'w-full',
                  fieldType === 'horizontal'
                    ? 'max-w-[760px]'
                    : fieldType === 'half'
                      ? 'max-w-[640px]'
                      : 'max-w-[480px] lg:max-w-[560px] xl:max-w-[280px]',
                  'lg:max-h-[calc(100vh-380px)] xl:max-h-[min(60vh,440px)]',
                ].join(' ')}
                style={{ aspectRatio: fieldAspect }}
              >
                <Field
                  step={currentStep}
                  prevStep={prevStep}
                  fieldType={fieldType}
                  selectedKey={selectedPlayerKey}
                  onSelect={setSelectedPlayerKey}
                  onPlayerMove={handlePlayerMove}
                  onDiscMove={handleDiscMove}
                  tool={tool}
                  onDrawingCommit={handleDrawingCommit}
                  transitionMs={transitionMs}
                  animating={isPlaying}
                />
              </div>

              <span className="absolute top-1 right-1 text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight tabular bg-bg/80 px-1.5 py-0.5 rounded">
                {stepNumLabel}
              </span>
            </div>

            <div className="w-2 lg:w-5" aria-hidden="true" />
          </div>

          <div className="flex justify-end pr-2 pt-1 lg:pt-1.5">
            <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">EZ</span>
          </div>

          <p className="text-center text-[10px] text-faint font-medium font-tight mt-1 lg:hidden">
            Drag a player or the disc · tap the disc and snap it onto a player to set who&rsquo;s holding it
          </p>
        </div>

        <div className="xl:hidden">
          <StepStrip
            steps={currentPlay.steps}
            currentIndex={currentStepIndex}
            onSelect={handleStepSelect}
            onAdd={handleAddStep}
            onDelete={handleDeleteStep}
          />
        </div>

        <PlaybackControls
          isPlaying={isPlaying}
          canPlay={canPlay}
          speed={speed}
          onTogglePlay={handleTogglePlay}
          onRestart={handleRestart}
          onSpeedChange={setSpeed}
        />
      </div>
    </div>
  );

  return (
    <PlaybookShell
      teams={teams}
      currentTeamID={currentTeamID}
      onSwitchTeam={handleShellSwitchTeam}
      pageTitle={scope.kind === 'personal' ? 'Personal · Editor' : `${currentTeam?.shortName ?? 'Team'} · Editor`}
      playsNavExtras={sidebarList}
    >
      <div className="px-2 pt-2 pb-6 md:px-3 lg:px-6 lg:pt-3 lg:pb-3">
        <div className="max-w-[1200px] mx-auto">
          {lastError && saveState === 'error' && (
            <div
              role="alert"
              className="mb-3 text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
            >
              {lastError}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_180px] gap-5 xl:gap-5 items-start">
            {editor}

            <aside className="hidden xl:block sticky top-[72px]">
              <StepRail
                steps={currentPlay.steps}
                currentIndex={currentStepIndex}
                onSelect={handleStepSelect}
                onAdd={handleAddStep}
                onDelete={handleDeleteStep}
              />
            </aside>

            <details className="lg:hidden bg-bg border border-hairline">
              <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
                <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink font-tight">
                  My plays · {plays.length}
                </span>
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted font-tight">
                  Show
                </span>
              </summary>
              <div className="px-4 py-3">
                <PlayList
                  plays={plays}
                  currentID={currentID}
                  onSelect={handleSelectPlay}
                  onCreate={handleOpenCreateDialog}
                  onDelete={handleDeletePlay}
                />
              </div>
            </details>
          </div>
        </div>
      </div>

      <CreatePlayDialog
        open={showCreateDialog}
        defaultName={`Play ${plays.length + 1}`}
        onCancel={() => setShowCreateDialog(false)}
        onCreate={handleConfirmCreate}
      />
    </PlaybookShell>
  );
}

/** Build the initial Step a new play starts with. Mirrors the old in-memory
 *  helper but returns an unpersisted Step (id created here is replaced by
 *  the server-issued UUID after createPlay returns). */
function buildSeedStep(
  formation: Exclude<FormationID, 'custom'>,
  fieldType: FieldType,
  withDefense: boolean,
): Omit<Step, 'id'> {
  let positions: PlayerPos[] = PRESETS[formation].map((p) => ({ ...p }));
  let disc =
    formation === 'empty'
      ? { ownerID: 0, x: positions[0].x, y: positions[0].y }
      : { ownerID: 0, x: 0.5, y: BRICK_Y };

  if (fieldType === 'half') {
    positions = remapForHalfField(positions);
    disc = remapDiscForHalfField(disc);
  }

  return {
    players: positions,
    defenders: withDefense ? seedDefenders(positions) : undefined,
    disc,
    durationMs: 0,
  };
}

function computeInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return '—';
  const parts = cleaned.split(/\s+/).slice(0, 3);
  const initials = parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
  return initials || cleaned.slice(0, 2).toUpperCase();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
