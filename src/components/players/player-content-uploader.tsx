'use client';

// Player-content uploader.
//
// Two modes via tab:
//   1) File upload  — image or video to the player-content storage bucket.
//                    Object path: {user_id}/{player_kind}-{player_ref}/{uuid}.{ext}
//   2) Video link   — paste a YouTube or Vimeo URL; we normalize + validate
//                    before submit.
//
// Either path inserts a player_content row with status='pending'. RLS makes
// sure uploaded_by = auth.uid() and status defaults to pending.
//
// Signed-out users see a "Sign in to upload" pill instead of the form, which
// opens the same AuthModal used by AccountChip.

import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { AuthModal } from '@/components/auth/auth-modal';
import { parseEmbed } from '@/lib/player-content/embed';
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MAX_CAPTION_LENGTH,
  MAX_FILE_BYTES,
  STORAGE_BUCKET,
  type PlayerKind,
} from '@/lib/player-content/types';

interface Props {
  playerKind: PlayerKind;
  playerRef: string;
  playerDisplayName: string;
  /** Called after a successful pending insert so the parent can refresh. */
  onSubmitted?: () => void;
}

type Tab = 'file' | 'link';

// Cap how many files can be submitted in one batch. Client-side guard only —
// the durable enforcement would be a per-user pending-quota DB trigger, which
// is tracked as a follow-up. This stops accidental/abusive 100+ file batches.
const MAX_FILES = 10;

export function PlayerContentUploader({
  playerKind,
  playerRef,
  playerDisplayName,
  onSubmitted,
}: Props) {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('file');
  const [authOpen, setAuthOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return <div className="h-[44px] rounded-md border border-hairline bg-surface" aria-hidden />;
  }

  if (!user) {
    return (
      <>
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-hairline bg-surface">
          <p className="text-[12px] text-muted font-tight">
            Sign in to upload photos or video.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="inline-flex items-center rounded-full px-3 py-1.5 bg-ink text-bg text-[10px] font-bold tracking-[0.16em] uppercase font-tight hover:opacity-90 transition-opacity cursor-pointer"
          >
            Sign in
          </button>
        </div>
        <AuthModal
          open={authOpen}
          dismissible
          initialMode="signin"
          onDismiss={() => setAuthOpen(false)}
        />
      </>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-dashed border-border text-muted hover:text-ink hover:border-ink hover:bg-surface transition-colors cursor-pointer font-tight text-[12px] font-semibold"
      >
        <PlusGlyph />
        Add photo or video
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
        <div className="flex items-center gap-1">
          <TabButton active={tab === 'file'} onClick={() => setTab('file')}>
            Upload file
          </TabButton>
          <TabButton active={tab === 'link'} onClick={() => setTab('link')}>
            Upload link
          </TabButton>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-faint hover:text-ink font-tight transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
      <div className="p-4">
        {tab === 'file' ? (
          <FileUploadForm
            playerKind={playerKind}
            playerRef={playerRef}
            playerDisplayName={playerDisplayName}
            uploaderId={user.id}
            onSubmitted={() => {
              setExpanded(false);
              onSubmitted?.();
            }}
          />
        ) : (
          <LinkForm
            playerKind={playerKind}
            playerRef={playerRef}
            playerDisplayName={playerDisplayName}
            uploaderId={user.id}
            onSubmitted={() => {
              setExpanded(false);
              onSubmitted?.();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── File upload ────────────────────────────────────────────────────────

function FileUploadForm({
  playerKind,
  playerRef,
  playerDisplayName,
  uploaderId,
  onSubmitted,
}: {
  playerKind: PlayerKind;
  playerRef: string;
  playerDisplayName: string;
  uploaderId: string;
  onSubmitted: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowedMime = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME] as readonly string[];

  /** Validate a single file; returns an error string or null if it's fine. */
  function validateFile(f: File): string | null {
    if (f.size > MAX_FILE_BYTES) {
      return `${f.name} is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`;
    }
    if (!allowedMime.includes(f.type)) {
      return `${f.name} isn't a supported type. Use JPG / PNG / WEBP / GIF / MP4 / WEBM / MOV.`;
    }
    return null;
  }

  function pickFiles(next: FileList | null) {
    setError(null);
    setProgress(null);
    if (!next || next.length === 0) {
      setFiles([]);
      return;
    }
    const picked = Array.from(next);
    if (picked.length > MAX_FILES) {
      setError(`Select up to ${MAX_FILES} files at a time.`);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    // Reject the whole batch if any file is invalid, so the user knows exactly
    // what's wrong rather than having some silently dropped.
    for (const f of picked) {
      const err = validateFile(f);
      if (err) {
        setError(err);
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }
    setFiles(picked);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setStatus('uploading');
    setError(null);
    setProgress({ done: 0, total: files.length });

    const supabase = createClient();
    const failures: string[] = [];
    let succeeded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = guessExtension(file);
      const objectPath = `${uploaderId}/${playerKind}-${playerRef}/${crypto.randomUUID()}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, file, {
          cacheControl: '3600',
          contentType: file.type,
        });
      if (uploadError) {
        failures.push(`${file.name}: ${uploadError.message || 'upload failed'}`);
        setProgress({ done: i + 1, total: files.length });
        continue;
      }

      const kind = (ALLOWED_VIDEO_MIME as readonly string[]).includes(file.type)
        ? 'video'
        : 'image';

      const { error: insertError } = await supabase.from('player_content').insert({
        player_kind: playerKind,
        player_ref: playerRef,
        player_display_name: playerDisplayName,
        kind,
        storage_path: objectPath,
        mime_type: file.type,
        file_size_bytes: file.size,
        caption: caption.trim() || null,
        uploaded_by: uploaderId,
      });

      if (insertError) {
        // Roll back this file's storage object so we don't leave orphans.
        await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
        failures.push(`${file.name}: ${insertError.message || 'could not save'}`);
        setProgress({ done: i + 1, total: files.length });
        continue;
      }

      succeeded += 1;
      setProgress({ done: i + 1, total: files.length });
    }

    if (failures.length > 0) {
      // Partial or total failure. Already-uploaded files stay as valid pending
      // submissions — we only report what didn't make it.
      setStatus('error');
      setError(
        succeeded > 0
          ? `${succeeded} of ${files.length} submitted. Failed: ${failures.join('; ')}`
          : `Upload failed: ${failures.join('; ')}`,
      );
      if (succeeded > 0) onSubmitted();
      return;
    }

    setStatus('done');
    setFiles([]);
    setCaption('');
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onSubmitted();
  }

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          Files
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={[...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME].join(',')}
          onChange={(e) => pickFiles(e.target.files)}
          className="block w-full text-[12px] text-ink font-tight file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:uppercase file:tracking-[0.16em] file:bg-ink file:text-bg file:cursor-pointer hover:file:opacity-90"
        />
        {files.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {files.map((f, idx) => (
              <li
                key={`${f.name}-${idx}`}
                className="text-[11px] text-faint font-tight truncate"
              >
                {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
              </li>
            ))}
            {files.length > 1 && (
              <li className="text-[11px] text-muted font-tight mt-0.5">
                {files.length} files · {(totalBytes / 1024 / 1024).toFixed(1)} MB total
              </li>
            )}
          </ul>
        )}
      </label>

      <CaptionField value={caption} onChange={setCaption} />
      {files.length > 1 && (
        <p className="text-[10px] text-faint font-tight -mt-1">
          The caption applies to all {files.length} files.
        </p>
      )}

      {error && (
        <p role="alert" className="text-[12px] text-live font-tight">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint font-tight">
          Submissions are reviewed before they appear publicly.
        </p>
        <button
          type="submit"
          disabled={files.length === 0 || status === 'uploading'}
          className="inline-flex items-center rounded-full px-4 py-2 bg-ink text-bg text-[10px] font-bold tracking-[0.16em] uppercase font-tight hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
        >
          {status === 'uploading'
            ? progress
              ? `Uploading ${progress.done}/${progress.total}…`
              : 'Uploading…'
            : files.length > 1
              ? `Submit ${files.length} for review`
              : 'Submit for review'}
        </button>
      </div>
    </form>
  );
}

// ── External content link (any valid http/https URL) ──────────────────

/**
 * Validates that `raw` is a syntactically valid http(s) URL.
 * Returns the URL object on success, null on failure.
 * Rejects javascript:, data:, and any non-http(s) scheme.
 */
function parseValidUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u;
}

function LinkForm({
  playerKind,
  playerRef,
  playerDisplayName,
  uploaderId,
  onSubmitted,
}: {
  playerKind: PlayerKind;
  playerRef: string;
  playerDisplayName: string;
  uploaderId: string;
  onSubmitted: () => void;
}) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = url.trim();
  const validUrl = trimmed ? parseValidUrl(trimmed) : null;
  // Detect YouTube/Vimeo for the embed hint and storage kind.
  const embedInfo = validUrl ? parseEmbed(trimmed) : null;
  const canSubmit = !!validUrl && status !== 'saving';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validUrl) {
      setError('Enter a valid https:// URL.');
      return;
    }
    setStatus('saving');
    setError(null);

    const supabase = createClient();

    // Call insert in each branch separately so TS sees a concrete type per
    // path (Supabase's RejectExcessProperties doesn't accept a discriminated
    // union in a single variable).
    let insertError: { message?: string } | null = null;

    if (embedInfo) {
      // Recognized YouTube/Vimeo embed → store as video_link.
      const { error } = await supabase.from('player_content').insert({
        player_kind: playerKind,
        player_ref: playerRef,
        player_display_name: playerDisplayName,
        kind: 'video_link' as const,
        external_url: embedInfo.watchUrl,
        caption: caption.trim() || null,
        uploaded_by: uploaderId,
      });
      insertError = error;
    } else {
      // Generic valid URL → store as a link card.
      const { error } = await supabase.from('player_content').insert({
        player_kind: playerKind,
        player_ref: playerRef,
        player_display_name: playerDisplayName,
        kind: 'link' as const,
        external_url: trimmed,
        caption: caption.trim() || null,
        uploaded_by: uploaderId,
      });
      insertError = error;
    }

    if (insertError) {
      setStatus('error');
      setError(insertError.message || 'Could not save submission.');
      return;
    }

    setStatus('done');
    setUrl('');
    setCaption('');
    onSubmitted();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
          Content URL
        </span>
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(null); }}
          placeholder="https://… (video, article, highlight, etc.)"
          className="w-full px-3 py-2 rounded-md bg-bg border border-border text-ink font-tight text-[13px] focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {trimmed && !validUrl && (
          <span className="text-[11px] text-live font-tight">
            Enter a valid https:// URL.
          </span>
        )}
        {embedInfo && (
          <span className="text-[11px] text-faint font-tight">
            Detected {embedInfo.provider} video — will embed in the gallery.
          </span>
        )}
        {validUrl && !embedInfo && (
          <span className="text-[11px] text-faint font-tight">
            Link will be saved as a content card.
          </span>
        )}
      </label>

      <CaptionField value={caption} onChange={setCaption} />

      {error && (
        <p role="alert" className="text-[12px] text-live font-tight">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint font-tight">
          Submissions are reviewed before they appear publicly.
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center rounded-full px-4 py-2 bg-ink text-bg text-[10px] font-bold tracking-[0.16em] uppercase font-tight hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer"
        >
          {status === 'saving' ? 'Saving…' : 'Submit for review'}
        </button>
      </div>
    </form>
  );
}

// ── shared bits ────────────────────────────────────────────────────────

function CaptionField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight">
        Caption <span className="text-faint normal-case tracking-normal">(optional)</span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
        rows={2}
        placeholder="Add a short caption…"
        className="w-full px-3 py-2 rounded-md bg-bg border border-border text-ink font-tight text-[13px] focus:outline-none focus:ring-2 focus:ring-accent resize-none"
      />
      <span className="text-[10px] text-faint font-tight self-end">
        {value.length}/{MAX_CAPTION_LENGTH}
      </span>
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-[10px] font-bold tracking-[0.16em] uppercase font-tight transition-colors cursor-pointer',
        active ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

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
    case 'video/mp4':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    default:
      return '';
  }
}
