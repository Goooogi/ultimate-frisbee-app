'use server';

// Server action for the admin Roles tab. Runs through the SSR Supabase client
// (admin's session cookie). set_user_role() is itself admin-gated in the DB and
// a trigger blocks any non-admin role change, but we assertAdmin() here too so a
// non-admin gets a clean error rather than a raw RPC rejection. Mirrors
// /admin/feedback/actions.ts.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/auth/types';

const ALLOWED: UserRole[] = ['user', 'beta', 'admin'];

async function assertAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  if (!ALLOWED.includes(role)) throw new Error('Invalid role');
  const { supabase } = await assertAdmin();
  // set_user_role isn't in the generated Database types — cast to an untyped rpc
  // surface (same as the admin_list_users / utcg_* callers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
  const { error } = await rpc.rpc('set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/roles');
  revalidatePath('/admin/content');
}
