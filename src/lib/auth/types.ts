export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  /** Picked team-logo/flag icon as a "league:teamId" reference. Takes render
   *  precedence over avatar_url; mutually exclusive with it at the app layer. */
  avatar_icon: string | null;
  phone: string | null;
  role: UserRole;
}

export interface SessionUser {
  id: string;
  email: string;
  /** Display name pulled from profile, falling back to email local-part. */
  name: string;
  /** Two-letter initials derived from display name. */
  initials: string;
  /** Convenience: true when profile.role === 'admin'. */
  isAdmin: boolean;
  profile: Profile | null;
}
