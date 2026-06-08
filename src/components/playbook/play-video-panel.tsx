'use client';

// Reference video panel for the play editor.
//
// Shows a collapsible "Reference video" row beneath the field card. When no
// video is attached it renders a two-path picker:
//   - "Paste link"   → YouTube/Vimeo URL input (existing behaviour).
//   - "Upload file"  → video file → Supabase Storage bucket "playbook-videos".
//
// Stored value in pb_plays.video_url:
//   - YouTube/Vimeo:  canonical watch URL (parseEmbed handles render → iframe).
//   - Uploaded file:  "storage:{objectPath}" e.g. "storage:uid/playId-ts.mp4".
//     The panel detects the prefix and fetches a 1h signed URL for a <video>.
//
// Edit controls (Replace / Remove) only render when `canEdit` is true;
// the embed/video itself is always visible to all authenticated viewers.

import { useRef, useState, useEffect } from 'react';
import { parseEmbed } from '@/lib/player-content/embed';
import { useAuth } from '@/lib/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { STORAGE_VIDEO_PREFIX } from '@/lib/playbook/data';

const PLAYBOOK_BUCKET = 'playbook-videos';
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB (mirrors bucket cap)

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Extract the raw object path from a storage: prefixed value. */
function storagePath(videoUrl: string): string {
  return videoUrl.slice(STORAGE_VIDEO_PREFIX.length);
}

function isStorageUrl(videoUrl: string | null | undefined): videoUrl is string {
  return typeof videoUrl === 'string' && videoUrl.startsWith(STORAGE_VIDEO_PREFIX);
}

function guessExt(file: File): string {
  const fromName = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/m4v': '.m4v',
  };
  return map[file.type] ?? '';
}

// ─── signed URL hook ───────────────────────────────────────────────────────────

/**
 * Resolves a private storage object path to a 1-hour signed URL.
 * Returns { signedUrl, loading, error }.
 */
function useSignedUrl(objectPath: string | null) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectPath) {
      setSignedUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedUrl(null);

    createClient()
      .storage.from(PLAYBOOK_BUCKET)
      .createSignedUrl(objectPath, 3600)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data?.signedUrl) {
          setError('Could not load video — try refreshing.');
        } else {
          setSignedUrl(data.signedUrl);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [objectPath]);

  return { signedUrl, loading, error };
}

// ─── component ────────────────────────────────────────────────────────────────

type InputMode = 'idle' | 'link' | 'upload';

interface PlayVideoPanelProps {
  playID: string;
  videoUrl: string | null | undefined;
  canEdit: boolean;
  /** Called optimistically after a successful attach/remove so the parent can
   *  update local state without waiting for a full reload. */
  onVideoChange: (url: string | null) => void;
  /** Called to perform the actual Supabase write. Should throw on failure. */
  onSave: (playID: string, url: string | null) => Promise<void>;
}

export function PlayVideoPanel({
  playID,
  videoUrl,
  canEdit,
  onVideoChange,
  onSave,
}: PlayVideoPanelProps) {
  const { user } = useAuth();

  // ── derived state ──────────────────────────────────────────────────────────

  const isStorage = isStorageUrl(videoUrl);
  const embedInfo = (!isStorage && videoUrl) ? parseEmbed(videoUrl) : null;
  const hasVideo = isStorage || !!embedInfo;

  // Signed URL for uploaded files.
  const objectPath = isStorage ? storagePath(videoUrl as string) : null;
  const { signedUrl, loading: signedLoading, error: signedError } = useSignedUrl(objectPath);

  // ── UI state ───────────────────────────────────────────────────────────────

  const [open, setOpen] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('idle');
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Upload-specific
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const linkInputRef = useRef<HTMLInputElement>(null);

  // ── attach via URL ─────────────────────────────────────────────────────────

  function openLinkInput() {
    setDraft('');
    setInputError(null);
    setInputMode('link');
    requestAnimationFrame(() => linkInputRef.current?.focus());
  }

  function openUploadInput() {
    setInputError(null);
    setInputMode('upload');
    // Trigger file picker immediately.
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  async function handleAttachLink() {
    const trimmed = draft.trim();
    if (!trimmed) { setInputMode('idle'); return; }
    const info = parseEmbed(trimmed);
    if (!info) {
      setInputError('Paste a YouTube or Vimeo link');
      linkInputRef.current?.focus();
      return;
    }
    setSaving(true);
    setInputError(null);
    try {
      await onSave(playID, trimmed);
      onVideoChange(info.watchUrl);
      setInputMode('idle');
      setOpen(true);
    } catch {
      setInputError('Could not save — try again');
    } finally {
      setSaving(false);
    }
  }

  function handleLinkKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); handleAttachLink(); }
    if (e.key === 'Escape') { setInputMode('idle'); setDraft(''); setInputError(null); }
  }

  // ── upload file ────────────────────────────────────────────────────────────

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setInputMode('idle'); return; }

    // Client-side size guard.
    if (file.size > MAX_UPLOAD_BYTES) {
      setInputError(`File too large — max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      setInputMode('upload');
      return;
    }

    if (!user) {
      setInputError('Sign in to upload files.');
      setInputMode('idle');
      return;
    }

    const ext = guessExt(file);
    const objectPath = `${user.id}/${playID}-${Date.now()}${ext}`;
    const storageValue = `${STORAGE_VIDEO_PREFIX}${objectPath}`;

    setInputError(null);
    setUploading(true);
    setUploadProgress(0);
    setInputMode('upload');

    const supabase = createClient();

    // Supabase JS v2 doesn't expose upload progress natively; simulate with
    // a short poll so the user sees feedback on large files.
    const ticker = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 8, 85));
    }, 400);

    const { error: uploadErr } = await supabase.storage
      .from(PLAYBOOK_BUCKET)
      .upload(objectPath, file, {
        cacheControl: '3600',
        contentType: file.type,
      });

    clearInterval(ticker);

    if (uploadErr) {
      setUploading(false);
      setUploadProgress(0);
      setInputError(uploadErr.message || 'Upload failed — try again.');
      return;
    }

    setUploadProgress(100);

    // Persist the storage path marker to the DB.
    try {
      await onSave(playID, storageValue);
      onVideoChange(storageValue);
      setInputMode('idle');
      setOpen(true);
    } catch {
      // DB write failed — delete the orphaned object (best-effort).
      await supabase.storage.from(PLAYBOOK_BUCKET).remove([objectPath]);
      setInputError('Could not save — try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ── remove / replace ───────────────────────────────────────────────────────

  async function handleRemove() {
    setSaving(true);
    try {
      // If it's an uploaded file, delete the storage object too.
      if (isStorage && objectPath) {
        const supabase = createClient();
        const { error: delErr } = await supabase.storage
          .from(PLAYBOOK_BUCKET)
          .remove([objectPath]);
        if (delErr) {
          // Log but don't block — orphaned files are acceptable.
          console.warn('[PlayVideoPanel] storage delete failed:', delErr.message);
        }
      }
      await onSave(playID, null);
      onVideoChange(null);
      setOpen(false);
    } catch {
      // RLS rejection or network hiccup — keep embed visible.
    } finally {
      setSaving(false);
    }
  }

  async function handleReplace() {
    // For uploaded files: delete storage object before clearing.
    setSaving(true);
    try {
      if (isStorage && objectPath) {
        const supabase = createClient();
        const { error: delErr } = await supabase.storage
          .from(PLAYBOOK_BUCKET)
          .remove([objectPath]);
        if (delErr) {
          console.warn('[PlayVideoPanel] storage delete on replace failed:', delErr.message);
        }
      }
      await onSave(playID, null);
      onVideoChange(null);
      setOpen(true);
      setInputMode('idle');
    } catch {
      // Keep current video intact if clear fails.
    } finally {
      setSaving(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="border border-hairline rounded-sm overflow-hidden">
      {/* ── header / toggle ── */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="play-video-panel-body"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full flex items-center justify-between gap-3 px-4 py-3',
          'text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'transition-colors hover:bg-surface/60 cursor-pointer',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">
          {/* Film icon */}
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="flex-shrink-0 text-faint"
          >
            <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 3V11M10 3V11M1 5.5H4M10 5.5H13M1 8.5H4M10 8.5H13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] font-bold tracking-[0.16em] uppercase font-tight text-muted">
            Reference video
          </span>
          {hasVideo && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-label="Video attached" />
          )}
        </span>
        {/* Chevron */}
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={[
            'flex-shrink-0 text-faint transition-transform duration-150',
            open ? 'rotate-180' : '',
          ].join(' ')}
          style={{ ['--tw-rotate' as string]: open ? '180deg' : '0deg' }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── body ── */}
      {open && (
        <div
          id="play-video-panel-body"
          className="px-4 pb-4 pt-1 border-t border-hairline"
        >
          {!hasVideo ? (
            /* ── No video: picker ── */
            canEdit ? (
              <div className="mt-2">
                {/* Hidden file input — always mounted so the ref is stable */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={handleFileSelected}
                  aria-label="Upload video file"
                />

                {inputMode === 'link' ? (
                  /* Link input */
                  <div className="flex flex-col gap-2">
                    <label htmlFor="video-url-input" className="sr-only">
                      YouTube or Vimeo URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        ref={linkInputRef}
                        id="video-url-input"
                        type="url"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); setInputError(null); }}
                        onKeyDown={handleLinkKeyDown}
                        placeholder="https://youtube.com/watch?v=…"
                        disabled={saving}
                        className={[
                          'flex-1 min-w-0 bg-bg border rounded px-3 py-2',
                          'text-[12px] font-tight text-ink placeholder-faint',
                          inputError ? 'border-live' : 'border-border',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          'disabled:opacity-50',
                        ].join(' ')}
                      />
                      <button
                        type="button"
                        onClick={handleAttachLink}
                        disabled={saving}
                        className={[
                          'flex-shrink-0 px-3 h-[38px] rounded',
                          'bg-accent text-accent-ink text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
                          'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          'disabled:opacity-50 transition-opacity cursor-pointer',
                        ].join(' ')}
                      >
                        {saving ? 'Saving…' : 'Attach'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setInputMode('idle'); setDraft(''); setInputError(null); }}
                        disabled={saving}
                        aria-label="Cancel"
                        className={[
                          'flex-shrink-0 px-3 h-[38px] rounded border border-border',
                          'text-muted hover:text-ink text-[11px] font-bold tracking-[0.14em] uppercase font-tight',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          'disabled:opacity-50 transition-colors cursor-pointer',
                        ].join(' ')}
                      >
                        Cancel
                      </button>
                    </div>
                    {inputError && (
                      <p role="alert" className="text-[11px] text-live font-tight font-medium">
                        {inputError}
                      </p>
                    )}
                  </div>
                ) : inputMode === 'upload' && uploading ? (
                  /* Upload in progress */
                  <div className="flex flex-col gap-2 py-1">
                    <div className="flex items-center gap-2">
                      {/* Spinner */}
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="flex-shrink-0 text-muted animate-spin"
                        style={{ ['--tw-rotate' as string]: undefined }}
                      >
                        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
                      </svg>
                      <span className="text-[11px] text-muted font-tight">
                        Uploading… {uploadProgress < 100 ? `${uploadProgress}%` : 'Saving…'}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 w-full rounded-full bg-border overflow-hidden" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    {inputError && (
                      <p role="alert" className="text-[11px] text-live font-tight font-medium">
                        {inputError}
                      </p>
                    )}
                  </div>
                ) : (
                  /* Idle: two-button picker */
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openLinkInput}
                        className={[
                          'inline-flex items-center gap-2 px-3 py-2 rounded',
                          'border border-dashed border-border',
                          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                          'hover:text-ink hover:border-ink transition-colors cursor-pointer',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          'min-h-[44px]',
                        ].join(' ')}
                      >
                        {/* Link icon */}
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M5 6.5a2.5 2.5 0 003.77.27l1.5-1.5a2.5 2.5 0 00-3.54-3.54l-.86.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M7 5.5a2.5 2.5 0 00-3.77-.27l-1.5 1.5a2.5 2.5 0 003.54 3.54l.85-.86" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Paste link
                      </button>
                      <button
                        type="button"
                        onClick={openUploadInput}
                        className={[
                          'inline-flex items-center gap-2 px-3 py-2 rounded',
                          'border border-dashed border-border',
                          'text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                          'hover:text-ink hover:border-ink transition-colors cursor-pointer',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          'min-h-[44px]',
                        ].join(' ')}
                      >
                        {/* Upload icon */}
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 8.5v1a.5.5 0 00.5.5h7a.5.5 0 00.5-.5v-1M6 1.5v6M3.5 4l2.5-2.5L8.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Upload file
                      </button>
                    </div>
                    {inputError && (
                      <p role="alert" className="text-[11px] text-live font-tight font-medium">
                        {inputError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-faint font-tight">No reference video attached.</p>
            )
          ) : (
            /* ── Video attached ── */
            <div className="mt-2 flex flex-col gap-3">
              {/* 16:9 player */}
              <div className="relative w-full overflow-hidden rounded-sm" style={{ aspectRatio: '16/9' }}>
                {isStorage ? (
                  /* Uploaded file: signed URL → native <video> */
                  signedLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface">
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-faint animate-spin">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="40" strokeDashoffset="14" strokeLinecap="round" />
                      </svg>
                    </div>
                  ) : signedError ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface">
                      <p className="text-[11px] text-live font-tight text-center px-4">{signedError}</p>
                    </div>
                  ) : signedUrl ? (
                    <video
                      src={signedUrl}
                      controls
                      playsInline
                      className="absolute inset-0 w-full h-full object-contain bg-black"
                    />
                  ) : null
                ) : (
                  /* YouTube / Vimeo embed */
                  <iframe
                    src={embedInfo!.embedUrl}
                    title={`Reference video (${embedInfo!.provider})`}
                    loading="lazy"
                    allowFullScreen
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    className="absolute inset-0 w-full h-full border-0"
                  />
                )}
              </div>

              {/* Controls — edit only */}
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReplace}
                    disabled={saving}
                    className={[
                      'inline-flex items-center gap-1.5 px-3 py-2 rounded border border-border min-h-[44px]',
                      'text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                      'hover:text-ink hover:border-ink transition-colors cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      'disabled:opacity-50',
                    ].join(' ')}
                  >
                    {/* Swap icon */}
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 4h8M7 2l2 2-2 2M11 8H3M5 6l-2 2 2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={saving}
                    className={[
                      'inline-flex items-center gap-1.5 px-3 py-2 rounded border border-border min-h-[44px]',
                      'text-[11px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                      'hover:text-live hover:border-live/40 transition-colors cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      'disabled:opacity-50',
                    ].join(' ')}
                  >
                    {/* Trash icon */}
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 3h8M5 3V2h2v1M4 3v6.5a.5.5 0 00.5.5h3a.5.5 0 00.5-.5V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {saving ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
