'use client';

// WaiversCard — Settings → Waivers (weekly-stats contests only). Segmented
// mode (first come / FAAB), and when FAAB is selected: a budget stepper
// ($50-$500 in $10 steps) and a waiver window stepper (24/48/72h). Web port
// of the mobile app's WaiversCard.tsx (altiusapps/mobileapp-thelayout ·
// src/components/fantasy/settings/WaiversCard.tsx).

import { useState } from 'react';
import { setWaiverSettings, waiverSettings, type ContestView, type WaiverMode } from '@/lib/fantasy/leagues';
import { Card, SaveButton, Feedback } from './shared';

interface Props {
  contest: ContestView;
  onSaved: () => void;
}

const MODE_OPTIONS: { value: WaiverMode; label: string; sub: string }[] = [
  { value: 'none', label: 'First come', sub: 'Adds and drops happen instantly, first tap wins.' },
  { value: 'faab', label: 'FAAB bidding', sub: 'Dropped players sit on waivers; teams bid a budget to claim them.' },
];

const BUDGET_MIN = 50;
const BUDGET_MAX = 500;
const BUDGET_STEP = 10;
const HOUR_OPTIONS = [24, 48, 72];

export function WaiversCard({ contest, onSaved }: Props) {
  if (contest.settings.mode !== 'weekly-stats') return null;

  const current = waiverSettings(contest.settings);
  const [mode, setMode] = useState<WaiverMode>(current.mode);
  const [budget, setBudget] = useState(current.budget);
  const [hours, setHours] = useState(current.hours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    mode !== current.mode || (mode === 'faab' && (budget !== current.budget || hours !== current.hours));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setWaiverSettings(contest.id, mode, budget, hours);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update waiver settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Waivers">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          {MODE_OPTIONS.map((opt) => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setMode(opt.value);
                  setError(null);
                  setSaved(false);
                }}
                className={[
                  'text-left rounded-card-sm border px-4 py-3 min-h-[44px] transition-colors duration-150',
                  selected ? 'border-accent bg-accent/[0.06]' : 'border-hairline',
                  'cursor-pointer hover:border-accent/50',
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

        {mode === 'faab' && (
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-2">
                Budget
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setBudget((v) => Math.max(BUDGET_MIN, v - BUDGET_STEP))}
                  aria-label="Decrease budget"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-ink/[0.05] hover:bg-ink/10 transition-colors duration-150 cursor-pointer font-tight text-[17px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  −
                </button>
                <span className="min-w-[48px] text-center font-tight text-[15px] font-bold text-ink tabular">
                  ${budget}
                </span>
                <button
                  type="button"
                  onClick={() => setBudget((v) => Math.min(BUDGET_MAX, v + BUDGET_STEP))}
                  aria-label="Increase budget"
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-ink/[0.05] hover:bg-ink/10 transition-colors duration-150 cursor-pointer font-tight text-[17px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <p className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-2">
                Waiver window
              </p>
              <div className="flex items-center gap-2">
                {HOUR_OPTIONS.map((h) => {
                  const selected = hours === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setHours(h)}
                      className={[
                        'px-3.5 py-2 rounded-full font-tight text-[13px] font-bold transition-colors duration-150 cursor-pointer',
                        selected ? 'bg-accent text-accent-ink' : 'bg-ink/[0.05] text-ink hover:bg-ink/10',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      ].join(' ')}
                    >
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div>
          <SaveButton disabled={!dirty || saving} saving={saving} />
        </div>
      </form>
      <Feedback error={error} saved={saved} />
    </Card>
  );
}

export default WaiversCard;
