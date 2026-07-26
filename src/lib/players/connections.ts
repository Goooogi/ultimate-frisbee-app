// Player "Connections" data — the on-profile section + inputs for The Thread.
//
// Reads the precomputed player_edges/player_nodes graph via SECURITY-safe RPCs.
// Identity is name-based (normalized display name), matching the unified profile
// — see the player_edges migration + memory/project_unified_player_profile.
//
// Isomorphic anon reads (the graph tables are world-readable), same pattern as
// usau/data.ts.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { findUsauPlayerByName } from '@/lib/usau/data';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;
let _client: AnyClient | null = null;
function db(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

/** A second-hop connection surfaced for the on-profile Connections section. */
export interface PlayerConnection {
  /** Normalized name (graph key) — used to build the profile link by name. */
  name: string;
  displayName: string;
  leagues: string[];
  /** twelve_oh rating if the player has one (notability), else null. */
  score: number | null;
  /** How many of the anchor's teammates connect to this person. */
  bridgeCount: number;
  /** A shared teammate ("via [X]") — the connective tissue to show the user. */
  viaDisplay: string | null;
  /** Link to this connection's profile, or null if it can't be resolved to one
   *  (rendered as plain text then). */
  href: string | null;
  /** Why this person made the cut (notability gate, 20260723151000):
   *  mid-high pro (twelve_oh >= 78, UFA/PUL/WUL). */
  isPro: boolean;
  /** Attended USAU Club Nationals. */
  isNationals: boolean;
  /** Played for one of the anchor's programs in a different era. */
  isAlumni: boolean;
}

interface RawConn {
  name: string;
  display_name: string;
  leagues: string[] | null;
  score: number | string | null;
  bridge_count: number;
  via_display: string | null;
  is_pro: boolean | null;
  is_nationals: boolean | null;
  is_alumni: boolean | null;
}

/**
 * Up to `limit` second-hop connections the player hasn't directly played with,
 * gated on notability (mid-high pro / Club Nationals / program alumni / >= 2
 * mutual teammates) and ranked most-reasons-first. Empty when the player isn't
 * in the graph (e.g. WFDF-only names, or too few appearances). Never throws — a
 * graph miss just returns []; connections are a bonus, not load-bearing.
 */
export async function getPlayerConnections(
  displayName: string,
  limit = 5,
): Promise<PlayerConnection[]> {
  if (!displayName?.trim()) return [];
  const { data, error } = await db().rpc('get_player_connections', {
    p_name: displayName,
    p_limit: limit,
  });
  if (error) return [];
  const rows = (data ?? []) as RawConn[];

  // Resolve each connection to a profile link by name (USAU id has the widest
  // coverage; the unified profile then merges the other leagues). 3-5 lookups,
  // each a small indexed surname query — cheap. Unresolvable → plain text.
  const hrefs = await Promise.all(
    rows.map((r) => findUsauPlayerByName(r.display_name).catch(() => null)),
  );

  return rows.map((r, i) => ({
    name: r.name,
    displayName: r.display_name,
    leagues: r.leagues ?? [],
    score: r.score == null ? null : Number(r.score),
    bridgeCount: r.bridge_count,
    viaDisplay: r.via_display,
    href: hrefs[i] ? `/players/${hrefs[i]}?from=usau` : null,
    isPro: r.is_pro ?? false,
    isNationals: r.is_nationals ?? false,
    isAlumni: r.is_alumni ?? false,
  }));
}

// ─── The Thread (full graph page) ──────────────────────────────────────────

export type ThreadNodeKind = 'anchor' | 'teammate' | 'elite' | 'connection';

/** Why a connection node survived the notability gate. */
export type ThreadReason = 'pro' | 'nationals' | 'alumni' | 'mutual';

export interface ThreadNode {
  id: string;          // normalized name (graph key)
  label: string;       // display name
  kind: ThreadNodeKind;
  score: number | null;
  leagues: string[];
  /** teammate nodes: bond weight to the anchor. */
  weight?: number;
  /** connection/elite nodes: the teammate id that bridges to them. */
  via?: string;
  /** connection/elite nodes: # distinct shared teammates bridging to them. */
  mutuals?: number;
  /** connection/elite nodes: which notability criteria they hit. */
  reasons?: ThreadReason[];
}

export interface ThreadEdge {
  a: string;
  b: string;
  weight: number;
  /** direct = anchor↔teammate; shared = teammate↔teammate history;
   *  bridge/elite = teammate→a cross-context connection (elite if notable). */
  kind: 'direct' | 'shared' | 'elite' | 'bridge';
  last_season?: number | null;
}

export interface PlayerThread {
  anchor: ThreadNode | null;
  nodes: ThreadNode[];
  edges: ThreadEdge[];
}

/**
 * The full connection web for The Thread page: the anchor, their top teammates
 * (ring 1), edges among those teammates (shared history), and the anchor's
 * cross-context CONNECTIONS (ring 2) — people they've never played with, reached
 * through a teammate on a different team-season, with the bridging teammate.
 * Elite connections (twelve_oh >= 85) come back as kind 'elite'. Empty graph if
 * the player isn't in the graph. Never throws.
 */
export async function getPlayerThread(
  displayName: string,
  teammates = 12,
  connections = 40,
): Promise<PlayerThread> {
  const empty: PlayerThread = { anchor: null, nodes: [], edges: [] };
  if (!displayName?.trim()) return empty;
  const { data, error } = await db().rpc('get_player_thread', {
    p_name: displayName,
    p_teammates: teammates,
    p_conns: connections,
  });
  if (error || !data) return empty;
  const g = data as { anchor: ThreadNode | null; nodes: ThreadNode[]; edges: ThreadEdge[] };
  return {
    anchor: g.anchor ?? null,
    nodes: g.nodes ?? [],
    edges: g.edges ?? [],
  };
}
