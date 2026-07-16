'use server';

// Server actions for feedback triage. Each runs through the SSR Supabase client
// (admin's session cookie); RLS already restricts feedback UPDATE/DELETE to
// admins, but we short-circuit with an explicit is_admin() check so a non-admin
// gets a clean error rather than a silent 0-row update. Mirrors
// /admin/content/actions.ts.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { FeedbackStatus } from '@/lib/feedback/server';

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

const ALLOWED: FeedbackStatus[] = ['new', 'read', 'resolved'];

export async function setFeedbackStatus(id: string, status: FeedbackStatus) {
  if (!ALLOWED.includes(status)) throw new Error('Invalid status');
  const { supabase, user } = await assertAdmin();
  const { error } = await supabase
    .from('feedback')
    .update({
      status,
      // Stamp the reviewer once it leaves 'new'; clear when reverted to 'new'.
      reviewed_by: status === 'new' ? null : user.id,
      reviewed_at: status === 'new' ? null : new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/feedback');
}

export async function deleteFeedback(id: string) {
  const { supabase } = await assertAdmin();
  const { error } = await supabase.from('feedback').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/feedback');
}
