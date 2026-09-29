// Loader for public.player_name_aliases — the nickname pairs and full-name
// overrides namesMatch needs. Same table public.names_match reads, so search
// dedup here and profile linking in the RPC (web + mobile) agree.
//
// Plain module, not server-only: usau/data.ts calls namesMatch and is imported
// by client components. The table is public-read and tiny, so each runtime
// memoizes one fetch for TTL_MS.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { buildNameAliases, type NameAliasRow, type NameAliases } from '@/lib/name-match';

const TTL_MS = 10 * 60 * 1000;
// PostgREST caps a response at 1000 rows and truncates silently.
const MAX_ROWS = 1000;

let _client: SupabaseClient | null = null;
let _cache: { at: number; value: Promise<NameAliases> } | null = null;

function supabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

async function fetchNameAliases(): Promise<NameAliases> {
  const { data, error } = await supabase()
    .from('player_name_aliases')
    .select('kind, name_a, name_b')
    .limit(MAX_ROWS);
  if (error) throw error;
  if (data.length >= MAX_ROWS) {
    throw new Error(`player_name_aliases has ${MAX_ROWS}+ rows; page the read in loadNameAliases`);
  }
  return buildNameAliases(data as NameAliasRow[]);
}

export function loadNameAliases(): Promise<NameAliases> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.value;
  const value = fetchNameAliases();
  _cache = { at: Date.now(), value };
  // Don't pin a failed read for the whole TTL; the caller still sees the error.
  value.catch(() => {
    if (_cache?.value === value) _cache = null;
  });
  return value;
}
