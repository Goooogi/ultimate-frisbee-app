'use client';

// LimitsCard — Settings → Teams. Commissioner-only team cap (4–12), with an
// "unlimited" override for USAU Club Nationals only (web port of mobile's
// LimitsCard.tsx). Mirrors NameCard/RosterCard's save/dirty/Feedback shape
// so the whole Settings screen reads as one system.

import { useState } from 'react';
import { setContestLimits, type ContestView } from '@/lib/fantasy/leagues';
import { MIN_TEAMS, DEFAULT_MAX_TEAMS } from '@/lib/fantasy/competitions';
import { Card, SaveButton, Feedback, NumberField, ToggleSwitch } from './shared';

interface Props {
  contest: ContestView;
  onSaved: () => void;
}

export function LimitsCard({ contest, onSaved }: Props) {
  const s = contest.settings;
  const showUnlimited = contest.competition === 'usau-club-nationals';

  const [maxTeams, setMaxTeams] = useState(s.maxTeams ?? DEFAULT_MAX_TEAMS);
  const [unlimited, setUnlimited] = useState(Boolean(s.unlimitedTeams));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = maxTeams !== (s.maxTeams ?? DEFAULT_MAX_TEAMS) || unlimited !== Boolean(s.unlimitedTeams);
  const canSave = dirty && !saving;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setContestLimits(contest.id, maxTeams, showUnlimited ? unlimited : false);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update team limits.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Teams">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            label="Max teams"
            value={maxTeams}
            onChange={(n) => {
              setMaxTeams(n);
              setError(null);
              setSaved(false);
            }}
            id={`max-teams-${contest.id}`}
            min={MIN_TEAMS}
            max={12}
          />
          <span className="font-tight text-[12px] text-faint pb-3">Minimum {MIN_TEAMS} teams to draft.</span>
        </div>

        {showUnlimited && (
          <div className="flex items-center justify-between gap-3 max-w-[440px]">
            <div>
              <p className="font-tight text-[13px] font-semibold text-ink">No limit</p>
              <p className="font-tight text-[11.5px] text-faint leading-snug">
                Club Nationals can run an open pool of teams.
              </p>
            </div>
            <ToggleSwitch
              checked={unlimited}
              onChange={() => {
                setUnlimited((v) => !v);
                setError(null);
                setSaved(false);
              }}
              label="No limit on team count"
            />
          </div>
        )}

        <div>
          <SaveButton disabled={!canSave} saving={saving} />
        </div>
      </form>
      <Feedback error={error} saved={saved} />
    </Card>
  );
}
