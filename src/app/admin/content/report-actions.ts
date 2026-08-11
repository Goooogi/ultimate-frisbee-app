'use server';

// Admin triage for player_content reports. Mirrors jersey-actions.ts:
// assert admin explicitly, then act, then revalidate. Content deletion
// reuses the existing deleteContent action — reports cascade-delete with
// the content, so we never delete report rows ourselves.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if ((profile as { role?: string } | null)?.role !== 'admin') throw new Error('Not authorized');
  return { supabase, user };
}

export async function setPlayerContentReportStatus(
  id: string,
  status: 'new' | 'resolved',
): Promise<void> {
  const { supabase, user } = await assertAdmin();
  const { error } = await supabase
    .from('player_content_reports')
    .update({
      status,
      reviewed_by: status === 'resolved' ? user.id : null,
      reviewed_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
}
