// Admin roles data layer — the user directory for the admin Roles tab.
//
// Reads through the admin_list_users() SECURITY DEFINER RPC, which is guarded
// (raises 'not authorized' for non-admins) and is the only place email from
// auth.users is exposed — admins only, never broadly. The /admin route is also
// gated server-side, so this is defense in depth.

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/types';

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  role: UserRole;
  createdAt: string;
}

interface RawRow {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  role: string;
  created_at: string;
}

// The generated Database types don't include the admin_* RPCs (same as the
// utcg_* / twelve_oh_* helpers elsewhere). Cast to a minimal untyped rpc surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedRpc = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };

/** All users with their roles (newest first). Admin-only via the RPC guard. */
export async function getAllUsers(): Promise<AdminUserRow[]> {
  const supabase = createClient() as unknown as UntypedRpc;
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawRow[]).map((r) => ({
    id: r.id,
    email: r.email ?? '(no email)',
    displayName: r.display_name,
    username: r.username,
    role: (r.role as UserRole) ?? 'user',
    createdAt: r.created_at,
  }));
}
