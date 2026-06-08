// Player content — user-uploaded photos, videos, and external video links
// attached to a player profile. See migration player_content_and_admin_role.
//
// player_kind discriminates the FK target since UFA and USAU live in
// different sources:
//   - 'ufa'  → player_ref = UFA slug (string id used in /players/{slug})
//   - 'usau' → player_ref = usau_players.id (uuid)

export type PlayerKind = 'ufa' | 'usau';
export type PlayerContentKind = 'image' | 'video' | 'video_link' | 'link';
export type PlayerContentStatus = 'pending' | 'approved' | 'rejected';

export interface PlayerContentRow {
  id: string;
  player_kind: PlayerKind;
  player_ref: string;
  player_display_name: string;
  kind: PlayerContentKind;
  storage_path: string | null;
  external_url: string | null;
  caption: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  status: PlayerContentStatus;
  uploaded_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape with a derived public URL (set client-side from storage path). */
export interface PlayerContentItem extends PlayerContentRow {
  /** Public URL when storage_path is set; null otherwise. */
  publicUrl: string | null;
  /** Normalized embed URL for video_link rows; null otherwise. */
  embedUrl: string | null;
}

export const STORAGE_BUCKET = 'player-content';

/** Soft caps enforced client-side (storage policy enforces real cap). */
export const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_CAPTION_LENGTH = 280;

export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_VIDEO_MIME = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;
