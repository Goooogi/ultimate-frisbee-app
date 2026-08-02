// Jersey marketplace — shared types + constants. Isomorphic (no server-only,
// no 'use client'), imported by both the browser mutations and the RSC reads.
//
// SCOPE REMINDER: we connect people, we do NOT process transactions. `priceCents`
// is an indicative asking price the seller types in — there is no payment, no
// escrow, no custody of funds anywhere in this feature.

export const STORAGE_BUCKET = 'jersey-photos';

/** Per-listing photo cap. Enough to show front/back/tag/detail. */
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Longest edge we resize to before upload. Keeps the bucket small and avoids
 *  Supabase image transforms entirely (metered — see the quota memory). */
export const PHOTO_MAX_EDGE = 1600;

export const MAX_ACTIVE_LISTINGS = 20;
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_MESSAGE = 4000;

export type JerseyKind = 'trade' | 'sell' | 'both';
export const JERSEY_KINDS: { value: JerseyKind; label: string }[] = [
  { value: 'trade', label: 'Trade' },
  { value: 'sell', label: 'Sell' },
  { value: 'both', label: 'Trade or sell' },
];

export type JerseyStatus = 'active' | 'completed' | 'withdrawn';

export type JerseyCondition = 'new' | 'excellent' | 'good' | 'worn';
export const JERSEY_CONDITIONS: { value: JerseyCondition; label: string }[] = [
  { value: 'new', label: 'New / unworn' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'worn', label: 'Well loved' },
];

/** Free text, but these cover most cases and keep the board filterable. */
export const JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Other'] as const;

/** Leagues we hold DATA for. Only ever set alongside a team_id picked from our
 *  own records — it drives logo/link resolution. A jersey from any other league
 *  carries a free-text `leagueName` instead and leaves this null. */
export type KnownLeague = 'ufa' | 'usau' | 'pul' | 'wul' | 'wfdf';

/**
 * What a listing/want is ABOUT. Every field optional and independent: people
 * search at wildly different specificity ("any Bravo jersey" / "2019 Machine" /
 * "anything Clapham, size L"). `league` + `teamId` are the optional structured
 * half — set only when picked from our data.
 */
export interface JerseyTarget {
  league: KnownLeague | null;
  teamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  /** Free-text league/competition — "UK Ultimate", "Windmill", "Denmark Nationals". */
  leagueName: string | null;
  playerName: string | null;
  year: number | null;
}

export interface JerseyLocation {
  city: string | null;
  state: string | null;
  country: string | null;
}

/** An event the poster will be at. Either a real USAU event (usauEventId set,
 *  so it links) or anything they typed. */
export interface JerseyEventTag {
  id: string;
  usauEventId: string | null;
  usauEventSlug: string | null;
  name: string;
  startsOn: string | null;
}

export interface JerseyPhoto {
  id: string;
  storagePath: string;
  publicUrl: string;
  sortOrder: number;
}

/** Public-safe poster identity. NEVER carries email or phone. */
export interface JerseyPoster {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  avatarIcon: string | null;
}

export interface JerseyListing extends JerseyTarget, JerseyLocation {
  id: string;
  ownerId: string;
  owner: JerseyPoster | null;
  kind: JerseyKind;
  title: string;
  description: string | null;
  size: string | null;
  condition: JerseyCondition | null;
  /** Indicative only — we process nothing. */
  priceCents: number | null;
  status: JerseyStatus;
  photos: JerseyPhoto[];
  events: JerseyEventTag[];
  createdAt: string;
  updatedAt: string;
}

export interface JerseyWant extends JerseyTarget, JerseyLocation {
  id: string;
  userId: string;
  user: JerseyPoster | null;
  size: string | null;
  note: string | null;
  status: JerseyStatus;
  events: JerseyEventTag[];
  createdAt: string;
  updatedAt: string;
}

// ── Messaging ───────────────────────────────────────────────────────────────

export interface JerseyMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** True when the signed-in user sent it — set by the mapper, not the DB. */
  mine: boolean;
}

export interface JerseyThread {
  id: string;
  listingId: string | null;
  wantId: string | null;
  /** The other participant, from the current user's point of view. */
  otherParty: JerseyPoster | null;
  /** True when the current user posted the listing/want this thread is about. */
  iAmOwner: boolean;
  subject: string;
  lastMessageAt: string | null;
  /** Messages that arrived after our last read timestamp. */
  unread: boolean;
  createdAt: string;
}

// ── Reports ─────────────────────────────────────────────────────────────────

export const REPORT_REASONS = [
  'Scam or fraud',
  'Counterfeit item',
  'Harassment',
  'Inappropriate content',
  'Spam',
  'Other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportStatus = 'new' | 'reviewed' | 'actioned' | 'dismissed';

// ── Display helpers ─────────────────────────────────────────────────────────

/** "Denver, CO" · "Copenhagen, Denmark" · "Denver, CO, USA". Skips blanks. */
export function jerseyLocationLine(loc: JerseyLocation): string | null {
  const parts = [loc.city, loc.state, loc.country].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * One line naming what the jersey IS, from whichever target fields are set:
 * "Johnny Bravo · Ben Jagt · 2025". Returns null when nothing is specified.
 */
export function jerseyTargetLine(t: JerseyTarget): string | null {
  const parts = [t.teamName, t.playerName, t.year ? String(t.year) : null].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Indicative price for display. Never implies we handle the money. */
export function formatPrice(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
