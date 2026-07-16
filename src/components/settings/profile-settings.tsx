'use client';

// Profile settings — display name + handle editor.
// Both fields save independently with their own loading/success/error states.
// Display name: 1–60 chars, profanity-filtered.
// Handle: USERNAME_RE, profanity-filtered, live availability (skipped when unchanged).

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getMyProfile,
  setDisplayName,
  setMyUsername,
  isUsernameAvailable,
  USERNAME_RE,
} from '@/lib/fantasy/data';
import { moderateName } from '@/lib/moderation';
import { useAuth } from '@/lib/auth/auth-provider';
import { AvatarUploadModal } from '@/components/settings/avatar-upload-modal';
import { AvatarIconView, iconResolvable } from '@/components/profile/avatar-icon-view';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldStatus = 'idle' | 'saving' | 'saved' | 'error';
type HandleCheckStatus = 'idle' | 'checking' | 'ok' | 'taken' | 'format' | 'profanity' | 'unchanged';

// ─── Shared sub-components ────────────────────────────────────────────────────

function FieldLabel({
  htmlFor,
  label,
  hint,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-2 mb-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight"
      >
        {label}
      </label>
      {hint && (
        <span className="text-[9px] font-medium text-faint font-tight normal-case tracking-normal">
          {hint}
        </span>
      )}
    </span>
  );
}

function StatusMessage({
  status,
  error,
  successMsg = 'Saved.',
}: {
  status: FieldStatus;
  error: string | null;
  successMsg?: string;
}) {
  if (status === 'saved') {
    return (
      <p className="text-[11px] font-tight text-[#22c55e] mt-1.5">{successMsg}</p>
    );
  }
  if (status === 'error' && error) {
    return (
      <p role="alert" className="text-[11px] font-tight text-live mt-1.5">
        {error}
      </p>
    );
  }
  return null;
}

function SaveButton({
  onClick,
  status,
  disabled,
}: {
  onClick: () => void;
  status: FieldStatus;
  disabled?: boolean;
}) {
  const isSaving = status === 'saving';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isSaving}
      aria-label="Save"
      className={[
        'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full min-h-[44px] min-w-[72px]',
        'font-tight text-[11px] font-bold tracking-[0.14em] uppercase',
        'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        disabled || isSaving
          ? 'bg-ink/[0.06] text-faint cursor-not-allowed'
          : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
      ].join(' ')}
    >
      {isSaving ? (
        <>
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin"
            aria-hidden="true"
          />
          Saving
        </>
      ) : (
        'Save'
      )}
    </button>
  );
}

// ─── Profile icon (account avatar) ────────────────────────────────────────────
// The nav-bar avatar shown in AccountChip in place of the initials monogram.
// Sourced from useAuth() (not the local getMyProfile() load above) since that's
// the same context AccountChip reads from — keeps this row and the nav in sync
// on the same refreshProfile() signal.

function ProfileIconField() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const avatarUrl = user?.profile?.avatar_url ?? null;
  const avatarIcon = user?.profile?.avatar_icon ?? null;
  const displayName = user?.name ?? '';
  const initials = user?.initials ?? '';

  return (
    <div className="flex flex-col gap-0">
      <FieldLabel htmlFor="settings-profile-icon" label="Profile icon" />
      <div className="flex items-center gap-3.5">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-ink/5 flex items-center justify-center shrink-0">
          {avatarIcon && iconResolvable(avatarIcon) ? (
            <AvatarIconView icon={avatarIcon} size={56} />
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`${displayName} profile photo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-display italic font-bold text-[18px] text-muted" aria-hidden="true">
              {initials}
            </span>
          )}
        </div>
        <button
          id="settings-profile-icon"
          type="button"
          onClick={() => setModalOpen(true)}
          className={[
            'inline-flex items-center justify-center px-4 py-2 rounded-full min-h-[44px] cursor-pointer',
            'bg-ink/[0.06] text-ink font-tight text-[11px] font-bold tracking-[0.14em] uppercase',
            'hover:bg-ink/[0.1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          {avatarIcon || avatarUrl ? 'Change icon' : 'Set icon'}
        </button>
      </div>

      <AvatarUploadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentAvatarUrl={avatarUrl}
        currentAvatarIcon={avatarIcon}
        displayName={displayName}
      />
    </div>
  );
}

// ─── Display Name field ───────────────────────────────────────────────────────

function DisplayNameField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<FieldStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Client-side pre-validation
  const trimmed = value.trim();
  const tooShort = trimmed.length < 1;
  const tooLong = trimmed.length > 60;
  const profanityErr = trimmed ? moderateName(trimmed, 'Display name') : null;
  const isInvalid = tooShort || tooLong || !!profanityErr;

  // Format hint — char count, turns red at limit
  const charCount = trimmed.length;

  const handleSave = async () => {
    if (isInvalid || status === 'saving') return;
    if (profanityErr) { setError(profanityErr); setStatus('error'); return; }
    setStatus('saving');
    setError(null);
    try {
      await setDisplayName(trimmed);
      setStatus('saved');
      // Reset to idle after 3s
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col gap-0">
      <FieldLabel
        htmlFor="settings-display-name"
        label="Display name"
        hint="Shown on the fantasy leaderboard"
      />
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <input
            id="settings-display-name"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (status !== 'idle') setStatus('idle');
              setError(null);
            }}
            maxLength={60}
            placeholder="What should we call you?"
            autoComplete="name"
            spellCheck={false}
            className={[
              'w-full bg-ink/5 px-3.5 py-2.5 text-[14px] font-semibold text-ink font-tight rounded-card-sm ring-1 ring-inset ring-transparent',
              'focus-visible:outline-none focus-visible:ring-2 transition-colors min-h-[44px]',
              tooLong || (profanityErr && trimmed)
                ? 'ring-live focus-visible:ring-live'
                : 'focus-visible:ring-accent',
            ].join(' ')}
          />
          <div className="flex items-center justify-between mt-1">
            <StatusMessage status={status} error={error} />
            <span
              className={[
                'ml-auto text-[10px] font-tight tabular',
                charCount > 55 ? 'text-live' : 'text-faint',
              ].join(' ')}
            >
              {charCount}/60
            </span>
          </div>
          {profanityErr && trimmed && status !== 'error' && (
            <p className="text-[11px] font-tight text-live mt-1">
              {profanityErr}
            </p>
          )}
        </div>
        <SaveButton
          onClick={handleSave}
          status={status}
          disabled={isInvalid || value.trim() === initial}
        />
      </div>
    </div>
  );
}

// ─── Handle field ─────────────────────────────────────────────────────────────

function HandleField({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? '');
  const [checkStatus, setCheckStatus] = useState<HandleCheckStatus>('idle');
  const [saveStatus, setSaveStatus] = useState<FieldStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateAndCheck = useCallback(
    (raw: string) => {
      const u = raw.trim().toLowerCase();
      if (!u) { setCheckStatus('idle'); return; }
      if (u === (initial ?? '').toLowerCase()) { setCheckStatus('unchanged'); return; }
      if (!USERNAME_RE.test(u)) { setCheckStatus('format'); return; }
      const profErr = moderateName(u, 'Handle');
      if (profErr) { setCheckStatus('profanity'); return; }
      setCheckStatus('checking');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const avail = await isUsernameAvailable(u);
          setCheckStatus(avail ? 'ok' : 'taken');
        } catch {
          setCheckStatus('idle');
        }
      }, 400);
    },
    [initial],
  );

  const canSave =
    checkStatus === 'ok' || checkStatus === 'unchanged';

  const handleSave = async () => {
    if (!canSave || saveStatus === 'saving') return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await setMyUsername(value.trim().toLowerCase());
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Something went wrong.');
      setSaveStatus('error');
    }
  };

  const trimmedU = value.trim().toLowerCase();
  const ringClass =
    checkStatus === 'ok' || checkStatus === 'unchanged'
      ? 'ring-[#22c55e] focus-visible:ring-[#22c55e]'
      : checkStatus === 'taken' || checkStatus === 'format' || checkStatus === 'profanity'
      ? 'ring-live focus-visible:ring-live'
      : 'ring-transparent focus-visible:ring-accent';

  return (
    <div className="flex flex-col gap-0">
      <FieldLabel
        htmlFor="settings-handle"
        label="Handle"
        hint="Your unique @identity"
      />
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <div className="relative flex items-center">
            <span
              className="absolute left-3 font-tight text-[14px] text-faint pointer-events-none select-none"
              aria-hidden="true"
            >
              @
            </span>
            <input
              id="settings-handle"
              type="text"
              value={value}
              onChange={(e) => {
                const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                setValue(cleaned);
                if (saveStatus !== 'idle') { setSaveStatus('idle'); setSaveError(null); }
                validateAndCheck(cleaned);
              }}
              maxLength={30}
              placeholder="your_handle"
              autoComplete="username"
              spellCheck={false}
              className={[
                'w-full bg-ink/5 pl-7 pr-10 py-2.5 text-[14px] font-semibold text-ink font-tight rounded-card-sm ring-1 ring-inset',
                'focus-visible:outline-none focus-visible:ring-2 transition-colors min-h-[44px]',
                ringClass,
              ].join(' ')}
            />
            {/* Inline status icon */}
            <span className="absolute right-3 flex items-center" aria-hidden="true">
              {checkStatus === 'checking' && (
                <span className="w-4 h-4 rounded-full border-2 border-ink/15 border-t-accent animate-spin block" />
              )}
              {(checkStatus === 'ok' || checkStatus === 'unchanged') && trimmedU && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2.5 7l3.5 3.5 5.5-6"
                    stroke="#22c55e"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {(checkStatus === 'taken' || checkStatus === 'format' || checkStatus === 'profanity') && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 3l8 8M11 3l-8 8"
                    stroke="rgb(var(--live))"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          </div>
          {/* Feedback line */}
          <div className="mt-1.5 text-[11px] font-tight min-h-[16px]">
            {saveStatus === 'saved' && (
              <span className="text-[#22c55e]">Handle updated.</span>
            )}
            {saveStatus === 'error' && saveError && (
              <span role="alert" className="text-live">{saveError}</span>
            )}
            {saveStatus !== 'saved' && saveStatus !== 'error' && (
              <>
                {checkStatus === 'ok' && <span className="text-[#22c55e]">@{trimmedU} is available</span>}
                {checkStatus === 'unchanged' && <span className="text-faint">Your current handle</span>}
                {checkStatus === 'taken' && <span className="text-live">That handle is already taken</span>}
                {checkStatus === 'format' && <span className="text-live">3–30 chars · lowercase letters, numbers, underscores</span>}
                {checkStatus === 'profanity' && <span className="text-live">Handle contains language that isn&apos;t allowed</span>}
                {(checkStatus === 'idle' || checkStatus === 'checking') && (
                  <span className="text-faint">Lowercase letters, numbers, underscores</span>
                )}
              </>
            )}
          </div>
        </div>
        <SaveButton
          onClick={handleSave}
          status={saveStatus}
          disabled={!canSave || value.trim().toLowerCase() === (initial ?? '')}
        />
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ProfileSettings() {
  const [profile, setProfile] = useState<{ displayName: string | null; username: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => { setProfile(p); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight text-faint animate-pulse">
          Loading…
        </span>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div
        role="alert"
        className="px-4 py-3 rounded-card-sm bg-live/[0.08]"
      >
        <span className="font-tight text-[13px] text-ink">
          Couldn&apos;t load your profile. Please refresh and try again.
        </span>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className="m-0 font-tight text-[11px] font-bold tracking-[0.18em] uppercase text-muted">
          Public identity
        </h2>
        <p className="mt-1 text-[12px] text-faint font-tight leading-snug">
          Your display name shows on the fantasy leaderboard. Your handle is your unique @identity across the platform.
        </p>
      </div>

      {/* Fields */}
      <div className="px-5 py-5 flex flex-col gap-6">
        <ProfileIconField />
        <DisplayNameField initial={profile.displayName ?? ''} />
        <HandleField initial={profile.username} />
      </div>
    </div>
  );
}
