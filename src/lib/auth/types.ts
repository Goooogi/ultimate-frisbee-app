export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  /** Display name pulled from profile, falling back to email local-part. */
  name: string;
  /** Two-letter initials derived from display name. */
  initials: string;
  profile: Profile | null;
}
