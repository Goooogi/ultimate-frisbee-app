// Supabase client (service role — bypasses RLS for writes).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Wrap a job in start/finish logging to the `usau_scrape_runs` table.
export async function withRunLogging<T>(
  jobName: string,
  metadata: Record<string, unknown> | null,
  fn: () => Promise<{ rowsProcessed: number; result: T }>,
): Promise<T> {
  const db = supabase();
  const { data: run, error: insErr } = await db
    .from('usau_scrape_runs')
    .insert({ job_name: jobName, metadata })
    .select('id')
    .single();
  if (insErr) throw insErr;

  try {
    const { rowsProcessed, result } = await fn();
    await db
      .from('usau_scrape_runs')
      .update({
        completed_at: new Date().toISOString(),
        rows_processed: rowsProcessed,
      })
      .eq('id', run.id);
    return result;
  } catch (err) {
    // Render any error shape — Supabase PostgrestError is a plain object,
    // not an Error instance, so we have to dig out .message/.code/.details.
    let message = '';
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === 'object') {
      const obj = err as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof obj.message === 'string') parts.push(obj.message);
      if (typeof obj.code === 'string') parts.push(`(${obj.code})`);
      if (typeof obj.details === 'string') parts.push(`— ${obj.details}`);
      if (typeof obj.hint === 'string') parts.push(`hint: ${obj.hint}`);
      message = parts.length > 0 ? parts.join(' ') : JSON.stringify(err);
    } else {
      message = String(err);
    }
    await db
      .from('usau_scrape_runs')
      .update({
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq('id', run.id);
    throw err;
  }
}
