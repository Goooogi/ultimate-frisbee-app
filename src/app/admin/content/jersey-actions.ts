'use server';

// Admin triage for jersey reports. Mirrors the existing admin actions in this
// directory: assert admin explicitly (RLS is the safety net, not the only
// check), then act, then revalidate.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  return { supabase: supabase as any, user };
}

const ALLOWED = ['new', 'reviewed', 'actioned', 'dismissed'] as const;

export async function setJerseyReportStatus(
  id: string,
  status: (typeof ALLOWED)[number],
): Promise<void> {
  if (!ALLOWED.includes(status)) throw new Error('Bad status');
  const { supabase, user } = await assertAdmin();
  const { error } = await supabase
    .from('jersey_reports')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
}

/** Take a reported listing down. Withdrawn (not deleted) so the evidence trail
 *  survives if the same person is reported again. */
export async function withdrawReportedListing(listingId: string): Promise<void> {
  const { supabase } = await assertAdmin();
  const { error } = await supabase
    .from('jersey_listings')
    .update({ status: 'withdrawn' })
    .eq('id', listingId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
}

export async function withdrawReportedWant(wantId: string): Promise<void> {
  const { supabase } = await assertAdmin();
  const { error } = await supabase
    .from('jersey_wants')
    .update({ status: 'withdrawn' })
    .eq('id', wantId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/content');
}

export async function deleteReportedListing(listingId: string): Promise<void> {
  const { supabase } = await assertAdmin();
  const { data: photos } = await supabase
    .from('jersey_photos')
    .select('storage_path')
    .eq('listing_id', listingId);
  const paths = ((photos ?? []) as any[]).map((p) => String(p.storage_path));

  const { error } = await supabase.from('jersey_listings').delete().eq('id', listingId);
  if (error) throw new Error(error.message);

  if (paths.length > 0) {
    await supabase.storage.from('jersey-photos').remove(paths);
  }
  revalidatePath('/admin/content');
}
