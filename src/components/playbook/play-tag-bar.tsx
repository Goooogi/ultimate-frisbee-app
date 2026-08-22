'use client';

// Situational tags on a play — the "what do we run here?" index.
//
// Closed vocabulary (PLAY_TAG_GROUPS): free text fragments instantly
// ("endzone" / "end zone" / "EZ") and makes filtering useless. The DB stores
// plain text, so widening the list needs no migration.

import { useState } from 'react';
import { PLAY_TAG_GROUPS, tagLabel } from '@/lib/playbook/types';

/** Tags on the current play, editable inline. */
export function PlayTagBar({
  tags,
  canEdit,
  onChange,
}: {
  tags: string[];
  canEdit: boolean;
  onChange: (next: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (!canEdit && tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-accent/10 text-[11px] font-medium font-tight text-ink"
        >
          {tagLabel(tag)}
          {canEdit && (
            <button
              type="button"
              aria-label={`Remove ${tagLabel(tag)} tag`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className={[
                'inline-flex items-center justify-center w-5 h-5 rounded-full cursor-pointer',
                'text-faint hover:text-live transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              <CloseGlyph />
            </button>
          )}
        </span>
      ))}

      {canEdit && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className={[
              'px-2.5 py-1 rounded-full bg-ink/5 cursor-pointer transition-colors',
              'text-[11px] font-medium font-tight text-muted hover:text-ink hover:bg-ink/10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            {tags.length === 0 ? '+ Add tags' : '+ Tag'}
          </button>

          {picking && (
            <>
              {/* Click-away layer. A plain overlay rather than a document
                  listener — no effect cleanup to get wrong. */}
              <button
                type="button"
                aria-label="Close tag picker"
                onClick={() => setPicking(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <div className="absolute left-0 top-full mt-1 z-30 w-[260px] bg-surface rounded-card shadow-lift p-3 max-h-[60vh] overflow-y-auto">
                {PLAY_TAG_GROUPS.map((group) => (
                  <div key={group.label} className="mb-3 last:mb-0">
                    <h4 className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight mb-1.5">
                      {group.label}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tags.map((tag) => {
                        const on = tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              onChange(on ? tags.filter((t) => t !== tag) : [...tags, tag])
                            }
                            className={[
                              'px-2.5 py-1 rounded-full cursor-pointer transition-colors',
                              'text-[11px] font-medium font-tight',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                              on
                                ? 'bg-ink text-bg'
                                : 'bg-ink/5 text-muted hover:text-ink hover:bg-ink/10',
                            ].join(' ')}
                          >
                            {tagLabel(tag)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Filter chips for the play list. Only offers tags actually in use, so a
 * filter can never return an empty list by construction.
 */
export function PlayTagFilter({
  tagsInUse,
  selected,
  onChange,
  matchCount,
  totalCount,
}: {
  tagsInUse: Set<string>;
  selected: string[];
  onChange: (next: string[]) => void;
  matchCount: number;
  totalCount: number;
}) {
  if (tagsInUse.size === 0) return null;

  // Keep the canonical vocabulary order rather than insertion order, so the
  // bar doesn't reshuffle as plays are tagged.
  const available = PLAY_TAG_GROUPS.flatMap((g) => g.tags).filter((t) => tagsInUse.has(t));

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-3">
      <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
        Filter
      </span>
      {available.map((tag) => {
        const on = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((t) => t !== tag) : [...selected, tag])}
            className={[
              'px-2.5 py-1 rounded-full cursor-pointer transition-colors',
              'text-[11px] font-medium font-tight',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              on ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:text-ink hover:bg-ink/10',
            ].join(' ')}
          >
            {tagLabel(tag)}
          </button>
        );
      })}
      {selected.length > 0 && (
        <>
          <span className="text-[11px] text-faint font-tight tabular">
            {matchCount} of {totalCount}
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            className={[
              'px-2.5 py-1 rounded-full cursor-pointer transition-colors',
              'text-[11px] font-medium font-tight text-faint hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
    </svg>
  );
}
