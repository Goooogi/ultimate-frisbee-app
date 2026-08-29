'use client';

// Notifications settings card — two push toggles that mirror the mobile app's
// prefs screen exactly ("Tournament updates" / "Player stats"; Push
// Notifications.md). game_start/game_final/news aren't editable here — they
// were never surfaced on web and stay out of scope.
//
// Card chrome mirrors ProfileSettings/FavoritesSettings (bg-surface card,
// uppercase section header + helper copy, px-5 py-5 body). Each row is
// optimistic: flips immediately, saves in the background, rolls back +
// shows an inline error on failure — same shape as FavoritesPicker's league
// toggle, just for a single boolean instead of a cascading set.

import { useEffect, useState } from 'react';
import {
  getMyNotificationPrefs,
  setNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notifications/data';

type RowKey = keyof NotificationPrefs;

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={[
        'relative inline-flex items-center flex-shrink-0 w-[42px] h-[26px] rounded-full transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        checked ? 'bg-accent' : 'bg-ink/15',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block w-[20px] h-[20px] rounded-full bg-surface shadow-card transition-transform duration-150',
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  );
}

function NotificationRow({
  label,
  description,
  checked,
  disabled,
  error,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  error: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink font-tight leading-tight">
          {label}
        </span>
        <span className="block text-[12px] text-faint font-tight leading-snug mt-0.5">
          {description}
        </span>
        {error && (
          <span role="alert" className="block text-[11px] font-tight text-live mt-1">
            Couldn&apos;t save. Try again.
          </span>
        )}
      </div>
      <ToggleSwitch checked={checked} onChange={onToggle} disabled={disabled} label={label} />
    </div>
  );
}

export function NotificationsSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState<Partial<Record<RowKey, boolean>>>({});
  const [rowError, setRowError] = useState<Partial<Record<RowKey, boolean>>>({});

  useEffect(() => {
    getMyNotificationPrefs()
      .then((p) => {
        setPrefs(p);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  async function handleToggle(key: RowKey) {
    if (!prefs) return;
    const prev = prefs;
    const next: NotificationPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setRowError((r) => ({ ...r, [key]: false }));
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await setNotificationPrefs(next);
    } catch {
      setPrefs(prev);
      setRowError((r) => ({ ...r, [key]: true }));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className="m-0 font-tight text-[11px] font-bold tracking-[0.18em] uppercase text-muted">
          Notifications
        </h2>
        <p className="mt-1 text-[12px] text-faint font-tight leading-snug">
          These control push notifications on the mobile app.
        </p>
      </div>

      <div className="px-5 py-1">
        {loading && (
          <div className="py-6 flex justify-center">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight text-faint animate-pulse">
              Loading…
            </span>
          </div>
        )}

        {!loading && (loadError || !prefs) && (
          <div role="alert" className="py-5 px-4 -mx-1 rounded-card-sm bg-live/[0.08]">
            <span className="font-tight text-[13px] text-ink">
              Couldn&apos;t load your notification settings. Please refresh and try again.
            </span>
          </div>
        )}

        {!loading && prefs && (
          <div className="flex flex-col divide-y divide-hairline">
            <NotificationRow
              label="Tournament updates"
              description="Starts, bracket play, and results for tournaments you star."
              checked={prefs.eventUpdates}
              disabled={!!saving.eventUpdates}
              error={!!rowError.eventUpdates}
              onToggle={() => handleToggle('eventUpdates')}
            />
            <NotificationRow
              label="Player stats"
              description="New stats for players you favorite."
              checked={prefs.playerStats}
              disabled={!!saving.playerStats}
              error={!!rowError.playerStats}
              onToggle={() => handleToggle('playerStats')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
