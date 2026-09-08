'use client';

// FormatCard — Settings → Format (weekly-stats contests only). Head-to-head
// vs total points is a pre-schedule decision: once fantasy_generate_schedule
// has run (settings.schedule exists), matchups are already built against the
// chosen format and switching would orphan them, so the RPC's window closes
// and this card goes read-only with an explainer. Web port of mobile's
// FormatCard.tsx. Caller renders this only when contest.settings.mode ===
// 'weekly-stats'.

import { useState } from 'react';
import { setContestFormat, type ContestView } from '@/lib/fantasy/leagues';
import type { WeeklyStatsSettings } from '@/lib/fantasy/competitions';
import { Card, SaveButton, Feedback } from './shared';

interface Props {
  contest: ContestView;
  onSaved: () => void;
}

const OPTIONS: { value: 'h2h' | 'points'; label: string; sub: string }[] = [
  { value: 'h2h', label: 'Head-to-head', sub: 'Weekly matchups, win/loss standings.' },
  { value: 'points', label: 'Total points', sub: 'Cumulative points, ranked leaderboard.' },
];

export function FormatCard({ contest, onSaved }: Props) {
  const s = contest.settings as WeeklyStatsSettings;
  const locked = !!s.schedule;
  const initial: 'h2h' | 'points' = s.format === 'h2h' ? 'h2h' : 'points';

  const [format, setFormat] = useState<'h2h' | 'points'>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = format !== initial;
  const canSave = dirty && !saving && !locked;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setContestFormat(contest.id, format);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the format.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Format">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {OPTIONS.map((opt) => {
            const selected = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => {
                  if (locked) return;
                  setFormat(opt.value);
                  setError(null);
                  setSaved(false);
                }}
                className={[
                  'flex-1 text-left rounded-card-sm border px-4 py-3 min-h-[44px] transition-colors duration-150',
                  selected ? 'border-accent bg-accent/[0.06]' : 'border-hairline',
                  locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-accent/50',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ].join(' ')}
              >
                <p className={['font-tight text-[14px] font-bold', selected ? 'text-accent' : 'text-ink'].join(' ')}>
                  {opt.label}
                </p>
                <p className="font-tight text-[11.5px] text-faint leading-snug mt-0.5">{opt.sub}</p>
              </button>
            );
          })}
        </div>

        {locked ? (
          <p className="font-tight text-[12px] text-faint">Locked — the schedule is set.</p>
        ) : (
          <div>
            <SaveButton disabled={!canSave} saving={saving} />
          </div>
        )}
      </form>
      {!locked && <Feedback error={error} saved={saved} />}
    </Card>
  );
}
