'use client';

// EventFavoriteStar — the header-controls star for USAU/WFDF event pages
// (Push Notifications.md plan: a starred tournament gets milestone pushes —
// start, bracket-begins, championship result). Same optimistic
// toggle-with-rollback pattern as FavoritesPicker's team/player rows, just
// inline instead of inside the settings picker, since there's no existing
// standalone star component to extend (favorites today are only edited from
// Settings → the picker's checkbox+search rows).
//
// Signed-out click opens AuthModal, mirroring WantDetail/JerseyDetail's
// handleMessage pattern (check viewer, setAuthOpen(true), no-op otherwise).

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import {
  addFavoriteEvent,
  isEventFavorited,
  removeFavoriteEvent,
  type FavoriteEvent,
} from '@/lib/favorites/data';

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 2.2l2.36 4.78 5.28.77-3.82 3.72.9 5.26L10 14.1l-4.72 2.63.9-5.26-3.82-3.72 5.28-.77z" />
    </svg>
  );
}

export function EventFavoriteStar({ event }: { event: FavoriteEvent }) {
  const { user } = useAuth();
  const [starred, setStarred] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setStarred(false);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    isEventFavorited(event.league, event.eventId)
      .then((v) => {
        if (!cancelled) setStarred(v);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, event.league, event.eventId]);

  async function handleClick() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (busy) return;
    const next = !starred;
    setStarred(next);
    setBusy(true);
    try {
      if (next) {
        await addFavoriteEvent(event);
      } else {
        await removeFavoriteEvent(event.league, event.eventId);
      }
    } catch {
      setStarred(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loaded && busy}
        aria-pressed={starred}
        aria-label={starred ? 'Unstar this tournament' : 'Star this tournament'}
        title={starred ? 'Unstar this tournament' : 'Star this tournament'}
        className={[
          'inline-flex items-center justify-center w-11 h-11 rounded-full flex-shrink-0 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer',
          starred ? 'text-accent' : 'text-faint hover:text-ink',
          busy ? 'opacity-70' : '',
        ].join(' ')}
      >
        <StarGlyph filled={starred} />
      </button>

      <AuthModal
        open={authOpen}
        dismissible
        onDismiss={() => setAuthOpen(false)}
        headline="Star this tournament."
        subhead="Sign in to get notified for tournaments you follow."
      />
    </>
  );
}
