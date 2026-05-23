'use client';

// Search icon button that opens the global SearchModal.
// Lives in both the desktop topbar and the mobile header.

import { useState } from 'react';
import { SearchModal, SearchGlyph } from '@/components/search-modal';

interface Props {
  /** Pixel size for the circular button — defaults to 32 to match AccountChip. */
  size?: number;
}

export function SearchTrigger({ size = 32 }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Open search"
        onClick={() => setOpen(true)}
        style={{ width: size, height: size }}
        className={[
          'inline-flex items-center justify-center rounded-full',
          'border border-border text-muted bg-surface',
          'hover:text-ink hover:border-ink transition-colors duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        <SearchGlyph size={Math.round(size * 0.42)} />
      </button>
      <SearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
