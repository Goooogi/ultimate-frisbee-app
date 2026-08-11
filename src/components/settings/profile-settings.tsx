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

// ─── Identity fields (display name + handle, ONE save) ───────────────────────
// A single Save commits whichever of the two fields changed — separate
// per-field save buttons read as clutter (Hunter, 2026-08-11). Field-level
// validation/availability feedback stays inline per field; the button
// disables until every CHANGED field is valid.

function IdentityFields({
  initialName,
  initialHandle,
}: {
  initialName: string;
  initialHandle: string | null;
}) {
  // Saved baselines — updated on a successful save so the button re-disables
  // instead of comparing against a stale initial prop.
  const [savedName, setSavedName] = useState(initialName);
  const [savedHandle, setSavedHandle] = useState((initialHandle ?? '').toLowerCase());

  const [name, setName] = useState(initialName);
  const [handle, setHandle] = useState(initialHandle ?? '');

  const [checkStatus, setCheckStatus] = useState<HandleCheckStatus>('idle');
  const [status, setStatus] = useState<FieldStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Display-name validation
  const trimmedName = name.trim();
  const tooShort = trimmedName.length < 1;
  const tooLong = trimmedName.length > 60;
  const profanityErr = trimmedName ? moderateName(trimmedName, 'Display name') : null;
  const nameInvalid = tooShort || tooLong || !!profanityErr;
  const charCount = trimmedName.length;

  const validateAndCheck = useCallback(
    (raw: string) => {
      const u = raw.trim().toLowerCase();
      if (!u) { setCheckStatus('idle'); return; }
      if (u === savedHandle) { setCheckStatus('unchanged'); return; }
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
    [savedHandle],
  );

  const trimmedU = handle.trim().toLowerCase();
  const nameChanged = trimmedName !== savedName;
  const handleChanged = trimmedU !== savedHandle;
  const handleOk = !handleChanged || checkStatus === 'ok';

  const canSave =
    (nameChanged || handleChanged) &&
    (!nameChanged || !nameInvalid) &&
    handleOk &&
    checkStatus !== 'checking';

  const handleSave = async () => {
    if (!canSave || status === 'saving') return;
    setStatus('saving');
    setError(null);
    try {
      // Save sequentially so a failure leaves a precise error (and the other
      // field's success sticks — baselines update per field).
      if (nameChanged) {
        await setDisplayName(trimmedName);
        setSavedName(trimmedName);
      }
      if (handleChanged) {
        await setMyUsername(trimmedU);
        setSavedHandle(trimmedU);
        setCheckStatus('unchanged');
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStatus('error');
    }
  };
  const ringClass =
    checkStatus === 'ok' || checkStatus === 'unchanged'
      ? 'ring-[#22c55e] focus-visible:ring-[#22c55e]'
      : checkStatus === 'taken' || checkStatus === 'format' || checkStatus === 'profanity'
      ? 'ring-live focus-visible:ring-live'
      : 'ring-transparent focus-visible:ring-accent';

  return (
    <div className="flex flex-col gap-6">
      {/* Display name */}
      <div className="flex flex-col gap-0">
        <FieldLabel
          htmlFor="settings-display-name"
          label="Display name"
          hint="Shown on the fantasy leaderboard"
        />
        <input
          id="settings-display-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
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
            tooLong || (profanityErr && trimmedName)
              ? 'ring-live focus-visible:ring-live'
              : 'focus-visible:ring-accent',
          ].join(' ')}
        />
        <div className="flex items-center justify-between mt-1">
          {profanityErr && trimmedName ? (
            <p className="text-[11px] font-tight text-live m-0">{profanityErr}</p>
          ) : (
            <span />
          )}
          <span
            className={[
              'ml-auto text-[10px] font-tight tabular',
              charCount > 55 ? 'text-live' : 'text-faint',
            ].join(' ')}
          >
            {charCount}/60
          </span>
        </div>
      </div>

      {/* Handle */}
      <div className="flex flex-col gap-0">
        <FieldLabel
          htmlFor="settings-handle"
          label="Handle"
          hint="Your unique @identity"
        />
        <div>
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
              value={handle}
              onChange={(e) => {
                const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                setHandle(cleaned);
                if (status !== 'idle') { setStatus('idle'); setError(null); }
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
            {checkStatus === 'ok' && <span className="text-[#22c55e]">@{trimmedU} is available</span>}
            {checkStatus === 'unchanged' && <span className="text-faint">Your current handle</span>}
            {checkStatus === 'taken' && <span className="text-live">That handle is already taken</span>}
            {checkStatus === 'format' && <span className="text-live">3–30 chars · lowercase letters, numbers, underscores</span>}
            {checkStatus === 'profanity' && <span className="text-live">Handle contains language that isn&apos;t allowed</span>}
            {(checkStatus === 'idle' || checkStatus === 'checking') && (
              <span className="text-faint">Lowercase letters, numbers, underscores</span>
            )}
          </div>
        </div>
      </div>

      {/* One Save for both fields */}
      <div className="flex items-center justify-end gap-3">
        <StatusMessage status={status} error={error} successMsg="Saved." />
        <SaveButton onClick={handleSave} status={status} disabled={!canSave} />
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
        <IdentityFields initialName={profile.displayName ?? ''} initialHandle={profile.username} />
      </div>
    </div>
  );
}
