'use client';

// PhotoUpload — pick photos for a listing.
//
// On CREATE we can't upload yet (the storage path embeds the listing id, which
// doesn't exist), so files are held locally with object-URL previews and the
// form uploads them after the insert. On EDIT the listing exists, so already-
// uploaded photos render alongside and can be deleted immediately.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteListingPhoto } from '@/lib/jerseys/data';
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_MIME,
  type JerseyPhoto,
} from '@/lib/jerseys/types';

export interface PendingPhoto {
  file: File;
  previewUrl: string;
}

export function PhotoUpload({
  pending,
  existing,
  onChange,
  listingId,
}: {
  pending: PendingPhoto[];
  existing: JerseyPhoto[];
  onChange: (p: PendingPhoto[]) => void;
  listingId: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Object URLs leak if we don't revoke them.
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = existing.length + pending.length;

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      const room = MAX_PHOTOS - total;
      if (room <= 0) {
        setError(`Up to ${MAX_PHOTOS} photos.`);
        return;
      }
      const accepted: PendingPhoto[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        if (!ALLOWED_PHOTO_MIME.includes(file.type as (typeof ALLOWED_PHOTO_MIME)[number])) {
          setError('Photos must be JPEG, PNG, or WebP.');
          continue;
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setError(`"${file.name}" is over 5 MB.`);
          continue;
        }
        accepted.push({ file, previewUrl: URL.createObjectURL(file) });
      }
      if (accepted.length > 0) onChange([...pending, ...accepted]);
    },
    [pending, total, onChange],
  );

  const removeExisting = useCallback(
    async (photo: JerseyPhoto) => {
      setRemoving(photo.id);
      const err = await deleteListingPhoto(photo.id, photo.storagePath);
      setRemoving(null);
      if (err) setError(err);
      else router.refresh();
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {existing.map((p) => (
          <Tile
            key={p.id}
            src={p.publicUrl}
            busy={removing === p.id}
            onRemove={() => removeExisting(p)}
          />
        ))}
        {pending.map((p, i) => (
          <Tile
            key={p.previewUrl}
            src={p.previewUrl}
            onRemove={() => {
              URL.revokeObjectURL(p.previewUrl);
              onChange(pending.filter((_, j) => j !== i));
            }}
          />
        ))}

        {total < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-card bg-surface shadow-card grid place-items-center gap-1 text-faint hover:text-ink hover:shadow-lift cursor-pointer motion-safe:transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 5v10M5 10h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] font-tight">Add</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_PHOTO_MIME.join(',')}
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {!listingId && pending.length > 0 && (
        <p className="text-[10.5px] text-faint font-tight">
          Photos upload when you post the listing.
        </p>
      )}
      {error && (
        <p className="text-[11.5px] text-accent font-tight" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Tile({
  src,
  onRemove,
  busy,
}: {
  src: string;
  onRemove: () => void;
  busy?: boolean;
}) {
  return (
    <div className="relative aspect-square rounded-card overflow-hidden bg-ink/5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label="Remove photo"
        className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-full bg-ink/70 text-bg cursor-pointer hover:bg-ink motion-safe:transition-colors disabled:opacity-50"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
