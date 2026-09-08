'use client';

// "+ Play" menu — the fantasy hub's create/join entry point (Sleeper's PLAY
// button). Self-contained: owns its own open/close state and trigger button,
// so any page can drop it in (currently just the hub's PageShell controls).
// Visual weight matches FantasyRulesModal: portal to body, dark scrim,
// bg-surface rounded-card-lg shadow-hero card. Two states: 'menu' (create /
// join) and 'join' (invite-code form), mirroring the mobile app's PlaySheet.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { joinLeagueByCode, getLeagueContests } from '@/lib/fantasy/leagues';

type Mode = 'menu' | 'join';

function friendlyJoinError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes('not found') || r.includes('invalid')) {
    return 'That code is invalid or has been rotated by the commissioner.';
  }
  if (r.includes('already') && r.includes('member')) return "You're already a member of this league.";
  if (r.includes('full')) return 'That league is full.';
  return raw;
}

export function PlayMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setMode('menu');
    setCode('');
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const handleCreate = () => {
    close();
    router.push('/fantasy/leagues/new');
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || joining) return;
    setJoining(true);
    setError(null);
    try {
      const leagueId = await joinLeagueByCode(trimmed);
      const contests = await getLeagueContests(leagueId).catch(() => []);
      close();
      router.push(contests[0] ? `/fantasy/l/${contests[0].id}` : `/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? friendlyJoinError(err.message) : 'Could not join with that code.');
    } finally {
      setJoining(false);
    }
  };

  const canJoin = code.trim().length > 0 && !joining;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={[
          'inline-flex items-center justify-center gap-1.5',
          'px-5 py-2.5 rounded-full min-h-[40px]',
          'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.1em] uppercase',
          'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        ].join(' ')}
      >
        <PlusGlyph />
        Play
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="play-menu-title"
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 bg-ink/40 backdrop-blur-sm"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="w-full max-w-[420px] max-h-full overflow-y-auto bg-surface rounded-card-lg shadow-hero">
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
                <span
                  id="play-menu-title"
                  className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight pt-1"
                >
                  {mode === 'menu' ? 'Play' : 'Join a league'}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className={[
                    'flex-shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center',
                    'text-faint hover:text-ink hover:bg-ink/5',
                    'transition-colors duration-150 cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  ].join(' ')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="px-6 pb-6">
                {mode === 'menu' ? (
                  <div className="flex flex-col mt-3">
                    <button
                      type="button"
                      onClick={handleCreate}
                      className={[
                        'flex items-center gap-3.5 py-3.5 text-left cursor-pointer',
                        'border-b border-hairline',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                      ].join(' ')}
                    >
                      <span className="flex-shrink-0 w-9 h-9 rounded-card-sm bg-accent/10 flex items-center justify-center">
                        <PlusGlyph className="text-accent" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-tight text-[14px] font-bold text-ink">Create a league</span>
                        <span className="block font-tight text-[12px] text-muted leading-snug mt-0.5">
                          You&apos;re the commissioner. Pick the game, invite friends.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('join')}
                      className={[
                        'flex items-center gap-3.5 py-3.5 text-left cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                      ].join(' ')}
                    >
                      <span className="flex-shrink-0 w-9 h-9 rounded-card-sm bg-accent/10 flex items-center justify-center">
                        <KeyGlyph className="text-accent" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-tight text-[14px] font-bold text-ink">Join with a code</span>
                        <span className="block font-tight text-[12px] text-muted leading-snug mt-0.5">
                          Got an invite code from a friend? Enter it here.
                        </span>
                      </span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleJoin} className="flex flex-col gap-2.5 mt-3">
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setError(null);
                      }}
                      placeholder="e.g. FR0STY9"
                      maxLength={16}
                      autoFocus
                      aria-label="League invite code"
                      className={[
                        'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
                        'font-tight text-[16px] text-ink placeholder:text-faint tracking-[0.08em] font-bold',
                        'focus:outline-none focus:ring-2 focus:ring-accent',
                        'min-h-[44px]',
                      ].join(' ')}
                    />
                    {error && (
                      <p role="alert" className="text-[12px] text-live font-tight">
                        {error}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={!canJoin}
                      className={[
                        'inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full min-h-[44px]',
                        'font-tight text-[12px] font-bold tracking-[0.1em] uppercase transition-colors duration-150',
                        canJoin
                          ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
                          : 'bg-ink/[0.08] text-faint cursor-not-allowed',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      ].join(' ')}
                    >
                      {joining ? (
                        <>
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />
                          Joining…
                        </>
                      ) : (
                        'Join league'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('menu');
                        setError(null);
                      }}
                      className={[
                        'mx-auto mt-1 text-[11px] font-bold tracking-[0.14em] uppercase text-faint hover:text-ink font-tight transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm',
                      ].join(' ')}
                    >
                      Back
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function PlusGlyph({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function KeyGlyph({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M14 10a4 4 0 10-3.46 3.96L12 15.5v2h2v2h2v2h2.5l1-1v-3.5L14 12.5V10z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10.5 7.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
