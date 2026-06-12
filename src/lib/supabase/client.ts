'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { supabaseUrl, supabaseAnonKey } from './env';

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
