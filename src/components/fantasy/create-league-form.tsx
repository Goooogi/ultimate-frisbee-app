'use client';

// Create-league form — auth-gated. name → createLeague → revalidate → redirect.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { createLeague } from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';

export function CreateLeagueForm() {
  return (
    <AuthGate
      headline="Sign in to create a league."
      subhead="Leagues are free — invite your friends and pick your competitions once you're in."
    >
      <Form />
    </AuthGate>
  );
}

function Form() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 60 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const leagueId = await createLeague(trimmed);
      await revalidateFantasyLeague(leagueId).catch(() => null);
      router.push(`/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your league. Please try again.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-[480px]">
      <div className="bg-surface rounded-card shadow-card p-5 lg:p-6">
        <label
          htmlFor="league-name"
          className="block text-[11px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1.5"
        >
          League Name
        </label>
        <input
          id="league-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          placeholder="e.g. The Huckin' Crew"
          className={[
            'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
            'font-tight text-[14px] text-ink placeholder:text-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'min-h-[44px]',
          ].join(' ')}
        />
        <p className="mt-1 text-[11px] text-faint font-tight">{trimmed.length}/60 characters</p>

        {error && (
          <div className="mt-4 px-4 py-3 rounded-card-sm bg-live/[0.08]">
            <span className="font-tight text-[13px] text-ink">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            'mt-5 inline-flex items-center justify-center gap-2',
            'px-6 py-3 rounded-full min-h-[44px] w-full sm:w-auto',
            'font-tight text-[13px] font-bold tracking-[0.06em] uppercase',
            'transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            canSubmit
              ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
              : 'bg-ink/[0.08] text-faint cursor-not-allowed',
          ].join(' ')}
        >
          {saving && (
            <span
              className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
              aria-hidden="true"
            />
          )}
          {saving ? 'Creating…' : 'Create league'}
        </button>
      </div>
    </form>
  );
}
