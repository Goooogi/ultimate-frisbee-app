'use client';

// InviteCodeRow — compact join-code chip + copy/share for the league page's
// "jump in" row. Members see the code (read-only reminder); the commissioner
// also gets Regenerate. Web port of the mobile app's InviteCodeRow.tsx
// (altiusapps/mobileapp-thelayout · src/components/fantasy/InviteCodeRow.tsx).
// Web has its own fuller LeagueMembersPanel invite UI (join link + email) —
// this is the compact single-row version shown above it on the league page.

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { getLeagueCode, regenerateLeagueCode } from '@/lib/fantasy/leagues';

interface Props {
  leagueId: string;
  canRegenerate: boolean;
}

export function InviteCodeRow({ leagueId, canRegenerate }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLeagueCode(leagueId)
      .then((v) => !cancelled && setCode(v))
      .catch(() => !cancelled && setCode(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const handleCopy = async () => {
    if (!code) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      await navigator.clipboard.writeText(`${origin}/fantasy/join/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in insecure contexts — non-fatal.
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenError(null);
    try {
      const next = await regenerateLeagueCode(leagueId);
      setCode(next);
      setRegenOpen(false);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Could not regenerate the code.');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-5">
        <div className="h-6 w-32 rounded-card-sm bg-ink/[0.06] animate-pulse" />
      </div>
    );
  }
  if (!code) return null;

  return (
    <>
      <div className="bg-surface rounded-card-lg shadow-card p-5 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1">
            Join code
          </div>
          <div className="font-tight text-[18px] font-bold tracking-[0.1em] text-ink">{code}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className={[
              'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full min-h-[44px]',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.06em] uppercase',
              'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            ].join(' ')}
          >
            {copied ? 'Copied!' : 'Share'}
          </button>
          {canRegenerate && (
            <button
              type="button"
              onClick={() => setRegenOpen(true)}
              aria-label="Regenerate join code"
              className={[
                'w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0',
                'text-muted hover:text-ink hover:bg-ink/5 transition-colors duration-150 cursor-pointer',
                'font-tight text-[9.5px] font-bold',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              REGEN
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={regenOpen}
        title="Regenerate join code?"
        body="The old code will stop working immediately. Anyone you've already shared it with won't be able to join with it."
        confirmLabel="Regenerate"
        busyLabel="Regenerating…"
        busy={regenerating}
        error={regenError}
        onConfirm={handleRegenerate}
        onCancel={() => setRegenOpen(false)}
      />
    </>
  );
}

export default InviteCodeRow;
