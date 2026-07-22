// Mirrors the DB `user_role` enum. Every account defaults to 'user'. 'beta' is
// a gate for beta-test access to in-progress features (e.g. UTCG); 'admin' has
// full admin-portal access. Changing roles is admin-only (set_user_role RPC +
// a DB trigger that blocks self-promotion).
export type UserRole = 'user' | 'beta' | 'admin';

/** Ordered list for pickers/labels. */
export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'beta', label: 'Beta User' },
  { value: 'admin', label: 'Admin' },
];

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
