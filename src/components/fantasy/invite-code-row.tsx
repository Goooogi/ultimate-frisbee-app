'use client';

// InviteCodeRow — compact join-code chip + copy, and the Invite button
// (InviteMenu: Email invite or Text message). Commissioner-only: the code RPC
// refuses everyone else, so the row renders nothing for them. The code no
// longer regenerates on web (Hunter, 2026-10-09). Web port of the mobile app's InviteCodeRow.tsx
// (altiusapps/mobileapp-thelayout · src/components/fantasy/InviteCodeRow.tsx).

import { useEffect, useState } from 'react';
import { getLeagueCode } from '@/lib/fantasy/leagues';
import { InviteMenu } from '@/components/fantasy/invite-menu';

interface Props {
  leagueId: string;
}

export function InviteCodeRow({ leagueId }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

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

  const handleCopyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1800);
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
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate font-tight text-[15px] font-bold tracking-[0.04em] text-ink">{code}</span>
            <button
              type="button"
              onClick={handleCopyCode}
              aria-label={codeCopied ? 'Join code copied' : 'Copy join code'}
              className={[
                'w-8 h-8 -my-1 rounded-full flex items-center justify-center flex-shrink-0',
                'text-muted hover:text-ink hover:bg-ink/5 transition-colors duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {codeCopied ? (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 3.5v-.5A1.5 1.5 0 009 1.5H4A1.5 1.5 0 002.5 3v5A1.5 1.5 0 004 9.5h.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <InviteMenu leagueId={leagueId} code={code} trigger="pill" />
      </div>
    </>
  );
}

export default InviteCodeRow;
