'use server';

// Server actions for content moderation. Each runs through the SSR Supabase
// client which carries the admin's session cookie; RLS guarantees only
// admins can perform updates / deletes on player_content. We still
// short-circuit early with an explicit is_admin() check so non-admins get a
// clean error rather than a silent 0-row update.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { STORAGE_BUCKET } from '@/lib/player-content/types';

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

export async function approveContent(id: string) {
  const { supabase, user } = await assertAdmin();
  const { error } = await supabase
    .from('player_content')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
}

export async function rejectContent(id: string, reason: string) {
  const { supabase, user } = await assertAdmin();
  const { error } = await supabase
    .from('player_content')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason.trim().slice(0, 1000) || null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
}

export async function deleteContent(id: string) {
  const { supabase } = await assertAdmin();
  // Fetch storage_path so we can delete the underlying object too.
  const { data: row, error: readError } = await supabase
    .from('player_content')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  let storageWarning: string | null = null;
  if (row?.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([row.storage_path]);
    if (storageError) {
      // Storage delete failure shouldn't block the row delete — the row is the
      // source of truth for what's visible, so we still remove it. But the
      // failure must NOT be silent: log it AND surface it to the admin so a
      // real orphan (permanent public CDN object) gets noticed, not buried.
      console.error('[admin/content] storage delete failed', storageError);
      storageWarning = `Row deleted, but the stored file (${row.storage_path}) could not be removed and is now orphaned: ${storageError.message}`;
    }
  }

  const { error } = await supabase.from('player_content').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
  return storageWarning ? { storageWarning } : { storageWarning: null };
}
