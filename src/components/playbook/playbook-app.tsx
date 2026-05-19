'use client';

// The Playbook editor — top-level state owner.
//
// Responsibilities:
//   - load + persist plays (localStorage)
//   - own the editor state (selected play, current step, selected player, playback)
//   - render the field + step strip + formation picker + play list + chrome
//
// Layout:
//   - Mobile / tablet portrait: editor on top (name + formation + field +
//     step strip + controls), saved plays in a collapsed accordion below.
//   - Desktop (lg+): editor centered, saved plays sidebar on the right.

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
import {
  loadOpenPlayID,
  loadPlays,
  savePlays,
  uid,
} from '@/lib/playbook/storage';
import {
  loadTeams,
  saveTeams,
  seedTeam,
  type Team,
} from '@/lib/playbook/teams';
import {
  PRESETS,
  BRICK_Y,
  seedDefenders,
  remapForHalfField,
  remapDiscForHalfField,
} from '@/lib/playbook/presets';
import { FIELD_GEOM } from '@/lib/playbook/field';
import { DEFAULT_STEP_MS } from '@/lib/playbook/types';
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

const STARTING_FORMATION: Exclude<FormationID, 'custom'> = 'vert';

export function PlaybookApp() {
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

  // Team state (frontend-only stub until auth/backend land).
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamID, setCurrentTeamID] = useState<string | undefined>(undefined);

  // Show the create-play modal. Closed by default; user clicks "+ New play"
  // anywhere to open it. Replaces the inline preset picker that used to live
  // in the editor — field type + preset are now decided up-front.
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Active editor tool. `cursor` lets the user drag players/disc; the three
  // draw tools turn the field into a sketch surface for the current step.
  const [tool, setTool] = useState<DrawTool>('cursor');

  // ── hydrate from localStorage ─────────────────────────────────────────────
  useEffect(() => {
    const stored = loadPlays();
    const openID = loadOpenPlayID();
    if (stored.length === 0) {
      // First-time visitors (and anyone who's deleted everything) land on the
      // empty state instead of a phantom "Untitled play" seed.
      setPlays([]);
      setCurrentID(undefined);
    } else {
      setPlays(stored);
      const open = openID && stored.some((p) => p.id === openID) ? openID : stored[0].id;
      setCurrentID(open);
    }

    const tstore = loadTeams();
    if (tstore.teams.length === 0) {
      const seed = seedTeam();
      setTeams([seed]);
      setCurrentTeamID(seed.id);
    } else {
      setTeams(tstore.teams);
      setCurrentTeamID(
        tstore.currentTeamID && tstore.teams.some((t) => t.id === tstore.currentTeamID)
          ? tstore.currentTeamID
          : tstore.teams[0].id,
      );
    }

    setHydrated(true);
  }, []);

  // ── persist on every change ───────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    savePlays(plays, currentID);
  }, [plays, currentID, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveTeams(teams, currentTeamID);
  }, [teams, currentTeamID, hydrated]);

  // ── derived ──────────────────────────────────────────────────────────────
  const currentPlay = useMemo(
    () => plays.find((p) => p.id === currentID),
    [plays, currentID],
  );
  const currentStep = currentPlay?.steps[currentStepIndex] ?? currentPlay?.steps[0];
  const prevStep =
    currentPlay && currentStepIndex > 0 ? currentPlay.steps[currentStepIndex - 1] : undefined;
  const canPlay = (currentPlay?.steps.length ?? 0) > 1;

  // ── play mutation helpers ─────────────────────────────────────────────────
  const updatePlay = useCallback(
    (mutator: (p: Play) => Play) => {
      setPlays((all) =>
        all.map((p) =>
          p.id === currentID
            ? { ...mutator(p), updatedAt: Date.now() }
            : p,
        ),
      );
    },
    [currentID],
  );

  const updateCurrentStep = useCallback(
    (mutator: (s: Step) => Step) => {
      updatePlay((p) => ({
        ...p,
        steps: p.steps.map((s, i) => (i === currentStepIndex ? mutator(s) : s)),
        // Once a user moves anything, the formation no longer matches the
        // preset exactly — mark as custom so the chip group tells the truth.
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
      // Carry defenders over too if the play was created with defense — a
      // step without them would make the defense vanish mid-playback.
      defenders: currentStep.defenders
        ? currentStep.defenders.map((p) => ({ ...p }))
        : undefined,
      disc: { ...currentStep.disc },
      // Drawings are step-specific — start each new step with a clean
      // sketch surface so cuts/throws don't pile up visually across the
      // animation. Users can re-draw on the new step.
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

  // "+ New play" now opens the create dialog — actual play creation happens
  // in handleConfirmCreate once the user picks field type + preset.
  const handleOpenCreateDialog = useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const handleConfirmCreate = useCallback(
    (payload: {
      name: string;
      fieldType: FieldType;
      formation: Exclude<FormationID, 'custom'>;
      withDefense: boolean;
    }) => {
      const p = createPlay(
        payload.formation,
        payload.name,
        payload.fieldType,
        payload.withDefense,
      );
      setPlays((all) => [...all, p]);
      setCurrentID(p.id);
      setCurrentStepIndex(0);
      setSelectedPlayerKey(null);
      setIsPlaying(false);
      setShowCreateDialog(false);
    },
    [],
  );

  const handleSelectPlay = useCallback((id: string) => {
    setCurrentID(id);
    setCurrentStepIndex(0);
    setSelectedPlayerKey(null);
    setIsPlaying(false);
  }, []);

  const handleDeletePlay = useCallback(
    (id: string) => {
      setPlays((all) => {
        const remaining = all.filter((p) => p.id !== id);
        if (id === currentID) {
          // Drop selection if we just deleted the open play; if other plays
          // remain we fall through to the first one, otherwise the editor
          // renders the empty state.
          setCurrentID(remaining[0]?.id);
          setCurrentStepIndex(0);
          setSelectedPlayerKey(null);
          setIsPlaying(false);
        }
        return remaining;
      });
    },
    [currentID],
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

  // Cancel playback if user touches anything.
  const handleStepSelect = useCallback((i: number) => {
    setIsPlaying(false);
    setCurrentStepIndex(i);
    setSelectedPlayerKey(null);
    // Drop back to the cursor tool whenever we move steps — keeps drawing
    // mode from carrying over into a step the user didn't intend to sketch on.
    setTool('cursor');
  }, []);

  const handleSwitchTeam = useCallback((id: string) => {
    setCurrentTeamID(id);
  }, []);

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
        onSwitchTeam={handleSwitchTeam}
        playsNavExtras={sidebarList}
      >
        <div className="p-8 text-faint text-[13px]">Loading playbook…</div>
      </PlaybookShell>
    );
  }

  // Empty state — no plays in the library yet (first visit or just deleted
  // everything). The sidebar still shows "+ New play" under Plays so the
  // primary action stays visible from the chrome too.
  if (!currentPlay || !currentStep) {
    return (
      <PlaybookShell
        teams={teams}
        currentTeamID={currentTeamID}
        onSwitchTeam={handleSwitchTeam}
        pageTitle="Plays · Editor"
        playsNavExtras={sidebarList}
      >
        <div className="px-4 pt-16 pb-12 lg:px-6 lg:pt-24 lg:pb-12">
          <div className="max-w-[520px] mx-auto text-center flex flex-col items-center gap-5">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              No plays yet
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

  // Editor card content. Renders the same in mobile and desktop, but the
  // mobile version embeds the horizontal step strip after the field while
  // the desktop version delegates steps to the right rail.
  const initials = computeInitials(currentPlay.name);
  const currentTeam = teams.find((t) => t.id === currentTeamID);
  const stepNumLabel = `Step · ${pad2(currentStepIndex + 1)}`;

  const editor = (
    <div className="flex flex-col gap-3">
      {/* Breadcrumb + status — sits above the editor card, no border so it
          reads as page chrome rather than another panel. */}
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-1">
        <nav
          aria-label="Play breadcrumb"
          className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase font-tight text-faint min-w-0"
        >
          <span>Playbook</span>
          <span aria-hidden="true" className="text-faint/60">/</span>
          <span className="truncate">{currentTeam?.shortName ?? 'TEAM'}</span>
          <span aria-hidden="true" className="text-faint/60">/</span>
          <span className="text-ink tabular">{initials}</span>
        </nav>
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase font-tight">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-accent">Editing</span>
          <span aria-hidden="true" className="text-faint/60">·</span>
          <span className="text-faint">Saved just now</span>
        </div>
      </header>

      {/* Big italic play title — inline-editable. Width auto-grows with the
          name so the input still reads as a title rather than a form field;
          the breadcrumb above still shows the auto-derived initials for
          quick scanning. */}
      <div className="px-1">
        <input
          type="text"
          value={currentPlay.name}
          onChange={(e) => handleRename(e.target.value)}
          placeholder="Untitled play"
          spellCheck={false}
          aria-label="Play name"
          className={[
            'block w-full bg-transparent border-0 outline-none',
            // Smaller on mobile/tablet so the field gets more vertical room.
            'font-display italic font-bold text-[24px] md:text-[32px] lg:text-[56px] leading-[0.95] tracking-[-0.04em] text-ink',
            'placeholder-faint focus:placeholder-transparent',
            'py-0.5 transition-colors',
          ].join(' ')}
        />
      </div>

      {/* Editor card holding the field, step strip (mobile only), playback. */}
      <div className="flex flex-col bg-bg border border-hairline rounded-sm overflow-hidden">
        {/* Field frame — yard scale on the left, EZ labels on the right
            edges, "STEP · NN" overlay top-right of the field SVG. */}
        <div className="relative bg-surface px-2 py-2 lg:py-2">
          {/* top EZ */}
          <div className="flex justify-end pr-2 pb-1 lg:pb-1.5">
            <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">EZ</span>
          </div>

          <div className="relative flex items-stretch gap-1 lg:gap-1.5 pl-2 lg:pl-4">
            {/* drawing toolbar — vertical strip on the left, padded in a bit
                so it doesn't sit flush against the editor card edge */}
            <DrawToolbar
              tool={tool}
              onToolChange={setTool}
              onClear={handleClearDrawings}
              canClear={(currentStep.drawings?.length ?? 0) > 0}
            />

            {/* field */}
            <div className="flex-1 relative flex justify-center">
              <div
                className={[
                  // Mobile/tablet — let the field absorb most of the column,
                  // width-driven so the player chips stay big and touchable.
                  // Desktop caps tighter so the editor still fits a laptop
                  // viewport without scrolling, height-driven.
                  'w-full',
                  fieldType === 'horizontal'
                    ? 'max-w-[760px]'
                    : fieldType === 'half'
                      ? 'max-w-[640px]'
                      // Mobile keeps the field width-driven (chips stay big
                      // and touchable). Tablet (lg) gets a wider width cap so
                      // it can absorb portrait iPad's vertical room; xl
                      // desktop drops to a tight width to keep the editor on
                      // a 13" laptop without scrolling.
                      : 'max-w-[480px] lg:max-w-[560px] xl:max-w-[280px]',
                  // Height caps. Anchor to viewport height minus the editor
                  // chrome (top bar + title + EZ rows + step strip +
                  // playback). This way portrait iPad fills the column, but
                  // landscape iPad (~834px tall) still keeps the play button
                  // above the fold. Desktop hard-caps at 440px so the full
                  // editor fits a 13" laptop (~800px tall).
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

              {/* STEP · NN overlay (top-right of the field area) */}
              <span className="absolute top-1 right-1 text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight tabular bg-bg/80 px-1.5 py-0.5 rounded">
                {stepNumLabel}
              </span>
            </div>

            {/* spacer so the field stays centered against the toolbar */}
            <div className="w-2 lg:w-5" aria-hidden="true" />
          </div>

          {/* bottom EZ */}
          <div className="flex justify-end pr-2 pt-1 lg:pt-1.5">
            <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight">EZ</span>
          </div>

          <p className="text-center text-[10px] text-faint font-medium font-tight mt-1 lg:hidden">
            Drag a player or the disc · tap the disc and snap it onto a player to set who&rsquo;s holding it
          </p>
        </div>

      {/* mobile-only horizontal step strip (desktop uses the right rail) */}
      <div className="xl:hidden">
        <StepStrip
          steps={currentPlay.steps}
          currentIndex={currentStepIndex}
          onSelect={handleStepSelect}
          onAdd={handleAddStep}
          onDelete={handleDeleteStep}
        />
      </div>

        {/* playback */}
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
      onSwitchTeam={handleSwitchTeam}
      pageTitle="Plays · Editor"
      // Desktop sidebar gets the compact play list indented under "Plays".
      playsNavExtras={sidebarList}
    >
      <div className="px-2 pt-2 pb-6 md:px-3 lg:px-6 lg:pt-3 lg:pb-3">
        <div className="max-w-[1200px] mx-auto">
          {/* Desktop: editor + sticky step rail. Mobile: editor only + plays accordion. */}
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

            {/* Mobile-only plays accordion. On desktop the saved plays live
                in the sidebar under "Plays". */}
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

function createPlay(
  formation: Exclude<FormationID, 'custom'>,
  name: string,
  fieldType: FieldType = 'full',
  withDefense = false,
): Play {
  let positions: PlayerPos[] = PRESETS[formation].map((p) => ({ ...p }));
  // For the empty preset the disc sits with the first player at midfield
  // since there's no canonical "handler with the disc" position.
  let disc =
    formation === 'empty'
      ? { ownerID: 0, x: positions[0].x, y: positions[0].y }
      : { ownerID: 0, x: 0.5, y: BRICK_Y };

  // Half-field plays only show the upper half of the field — compress the
  // full-field preset coords into that visible band so every player is
  // reachable on the canvas.
  if (fieldType === 'half') {
    positions = remapForHalfField(positions);
    disc = remapDiscForHalfField(disc);
  }

  const step: Step = {
    id: uid('step'),
    players: positions,
    defenders: withDefense ? seedDefenders(positions) : undefined,
    disc,
  };
  return {
    id: uid('play'),
    name,
    formation,
    fieldType,
    steps: [step],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** "Big sky run" → "BSR" · "MJ iso" → "MJI" · "" → "—". Used as the
 *  decorative codename atop the editor. Auto-derived from play name. */
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
