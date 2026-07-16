'use client';

// Profile-icon (account avatar) upload modal.
//
// This is the USER'S ACCOUNT avatar shown in the nav (AccountChip) — not a
// player photo. Single upload panel, no tabs: an earlier ask for a
// "league tab switcher" here was a misunderstanding (that's player content,
// not this), so keep this a plain single-purpose dialog.
//
// Upload mechanics mirror player-content-uploader.tsx's FileUploadForm:
// upload to Storage under `${user.id}/…` (RLS requires the own-uid folder),
// then persist the public URL via setAvatarUrl(), then refreshProfile() so
// the nav updates instantly. On a post-upload persist failure, the storage
// object is rolled back so we don't leave an orphaned file.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { setAvatarUrl } from '@/lib/fantasy/data';

interface AvatarUploadModalProps {
  open: boolean;
  onClose: () => void;
  currentAvatarUrl: string | null;
  displayName: string;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type Status = 'idle' | 'uploading' | 'error';

function guessExtension(file: File): string {
  const fromName = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName.toLowerCase();
  switch (file.type) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '';
  }
}

function validateFile(f: File): string | null {
  if (!(ALLOWED_MIME as readonly string[]).includes(f.type)) {
    return "That file isn't a supported type. Use JPG, PNG, WEBP, or GIF.";
  }
  if (f.size > MAX_BYTES) {
    return `That file is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}

export function AvatarUploadModal({
  open,
  onClose,
  currentAvatarUrl,
  displayName,
}: AvatarUploadModalProps) {
  const { refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reset local state each time the modal opens so a prior selection/error
  // doesn't linger into the next open.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreviewUrl(null);
    setStatus('idle');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  // Revoke the object URL when it's replaced/unmounted to avoid leaking memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Esc closes (unless mid-upload).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && status !== 'uploading') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, status, onClose]);

  if (!open || !mounted) return null;

  function pickFile(next: FileList | null) {
    setError(null);
    if (!next || next.length === 0) return;
    const picked = next[0];
    const err = validateFile(picked);
    if (err) {
      setError(err);
      setFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setStatus('idle');
  }

  async function handleSave() {
    if (!file || status === 'uploading') return;
    setStatus('uploading');
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus('error');
      setError('You must be signed in to upload a photo.');
      return;
    }

    const ext = guessExtension(file);
    const objectPath = `${user.id}/${crypto.randomUUID()}${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(objectPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      setStatus('error');
      setError(uploadError.message || 'Upload failed. Please try again.');
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath);

    try {
      await setAvatarUrl(data.publicUrl);
    } catch (e) {
      // Roll back the orphaned storage object since the DB write didn't stick.
      await supabase.storage.from('avatars').remove([objectPath]);
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not save your photo. Please try again.');
      return;
    }

    await refreshProfile();
    onClose();
  }

  async function handleRemove() {
    if (status === 'uploading') return;
    setStatus('uploading');
    setError(null);
    try {
      await setAvatarUrl(null);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not remove your photo. Please try again.');
      return;
    }
    await refreshProfile();
    onClose();
  }

  const initials = initialsOf(displayName);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 bg-ink/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && status !== 'uploading') onClose();
      }}
    >
      <div className="w-full max-w-[400px] max-h-full overflow-y-auto bg-surface rounded-card-lg shadow-hero flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            Account
          </span>
          <h2
            id="avatar-modal-title"
            className="m-0 font-display italic font-bold text-[26px] leading-[0.95] tracking-[-0.03em] text-ink"
          >
            Profile photo.
          </h2>
          <p className="text-[13px] text-muted font-tight leading-snug">
            Shown in the nav bar in place of your initials.
          </p>
        </div>

        {/* Preview + picker */}
        <div className="px-6 py-4 flex flex-col items-center gap-4">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-ink/5 flex items-center justify-center shrink-0">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Selected photo preview"
                className="w-full h-full object-cover"
              />
            ) : currentAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatarUrl}
                alt={`${displayName} current photo`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-display italic font-bold text-[36px] text-muted" aria-hidden="true">
                {initials}
              </span>
            )}
          </div>

          <label className="w-full flex flex-col gap-1.5">
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              Choose a photo
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => pickFile(e.target.files)}
              disabled={status === 'uploading'}
              className={[
                'w-full text-[12.5px] font-tight text-muted rounded-card-sm bg-ink/5 px-3 py-2.5',
                'file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0',
                'file:text-[10px] file:font-bold file:tracking-[0.12em] file:uppercase file:font-tight',
                'file:bg-ink file:text-bg file:cursor-pointer hover:file:opacity-90 file:transition-opacity',
                'cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
              ].join(' ')}
            />
            <span className="text-[10.5px] text-faint font-tight">
              JPG, PNG, WEBP, or GIF · up to 5 MB
            </span>
          </label>

          {error && (
            <p role="alert" className="w-full text-[12px] font-medium font-tight text-live bg-live/[0.08] rounded-card-sm px-3.5 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer / actions */}
        <div className="px-6 pb-6 pt-2 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={!file || status === 'uploading'}
            className={[
              'inline-flex items-center justify-center gap-2 w-full py-3 rounded-full cursor-pointer',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
              'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {status === 'uploading' ? (
              <>
                <span
                  className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin"
                  aria-hidden="true"
                />
                Saving…
              </>
            ) : (
              'Save photo'
            )}
          </button>

          {currentAvatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={status === 'uploading'}
              className={[
                'w-full py-2.5 rounded-full cursor-pointer text-center',
                'text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-live',
                'hover:bg-live/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              Remove photo
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={status === 'uploading'}
            className={[
              'text-[10px] font-bold tracking-[0.16em] uppercase text-faint hover:text-ink font-tight transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm mx-auto',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// First letter of the first word + first letter of the last word, matching
// the initials logic used elsewhere (PlayerHeadshot, computeInitials).
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0][0]?.toUpperCase() ?? '';
  const first = words[0][0] ?? '';
  const last = words[words.length - 1][0] ?? '';
  return (first + last).toUpperCase();
}
