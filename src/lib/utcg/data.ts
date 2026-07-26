// UTCG data layer — card pool + per-user reads.
//
// UFA-only for the MVP. A "card" is a twelve_oh_players UFA row enriched with:
//   - derived position (handler/cutter/hybrid) from its stats
//   - team display + division from TEAM_META (client-safe static)
// so the build screen and chemistry resolver have everything they need without
// a runtime DB join.
//
// Reads are isomorphic (anon publishable key, world-readable twelve_oh_*),
// same rationale as twelve-oh/data.ts. Per-user wallet/card mutations live in
// ./actions.ts (RPC callers) — those need the caller's auth session.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import { teamMeta } from '@/lib/ufa/teams';
import { derivePosition, type UtcgPosition } from './position';
import { tierForScore, type CardTier } from './packs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;
let _client: AnyClient | null = null;
function supabase(): AnyClient {
  if (_client) return _client;
  _client = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  return _client;
}

// ─── Card shape ──────────────────────────────────────────────────────────────

/** A UTCG card = a UFA player-season, enriched for the game. */
export interface UtcgCard {
  // identity (the twelve_oh_players PK tuple, UFA)
  playerId: string;
  teamSlug: string;
  year: number;
  // display
  name: string;
  teamAbbr: string;
  city: string;
  teamName: string;
  primary: string;
  accent: string;
  logo: string | null;
  headshotUrl: string | null;
  // rating
  playerScore: number;
  tier: CardTier;
  // game attributes
  position: UtcgPosition;
  division: string | null;
  // a few headline stats for the card face
  goals: number;
  assists: number;
  blocks: number;
  plusMinus: number;
}

/** Stable per-card key (matches the ownership PK). */
export function cardKey(c: { playerId: string; teamSlug: string; year: number }): string {
  return `${c.playerId}|${c.teamSlug}|${c.year}`;
}

interface DbCardRow {
  player_id: string;
  name: string;
  team_slug: string;
  team_abbr: string;
  year: number;
  goals: number;
  assists: number;
  blocks: number;
  plus_minus: number;
  yards_thrown: number;
  yards_received: number;
  player_score: number | string;
}

const CARD_SELECT =
  'player_id, name, team_slug, team_abbr, year, goals, assists, blocks, ' +
  'plus_minus, yards_thrown, yards_received, player_score';

function enrichCard(r: DbCardRow, headshotUrl: string | null): UtcgCard {
  const meta = teamMeta(r.team_slug);
  const score = Number(r.player_score);
  return {
    playerId: r.player_id,
    teamSlug: r.team_slug,
    year: r.year,
    name: r.name,
    teamAbbr: r.team_abbr,
    city: meta.city ?? '',
    teamName: meta.name ?? r.team_abbr,
    primary: meta.primary,
    accent: meta.accent,
    logo: meta.logo ?? null,
    headshotUrl,
    playerScore: score,
    tier: tierForScore(score),
    position: derivePosition({
      goals: r.goals,
      assists: r.assists,
      yardsThrown: r.yards_thrown,
      yardsReceived: r.yards_received,
    }),
    division: meta.division ?? null,
    goals: r.goals,
    assists: r.assists,
    blocks: r.blocks,
    plusMinus: Number(r.plus_minus),
  };
}

// ─── Card fetch by identity tuples (for owned-card hydration) ────────────────

/**
 * Fetch full UtcgCards for a set of (playerId, teamSlug, year) tuples.
 * Used to hydrate a user's owned collection into playable cards.
 * Paginates defensively (the 1000-row PostgREST cap) though owned sets are small.
 */
export async function getCardsByKeys(
  keys: { playerId: string; teamSlug: string; year: number }[],
): Promise<Map<string, UtcgCard>> {
  const out = new Map<string, UtcgCard>();
  if (keys.length === 0) return out;

  const db = supabase();
  // Fetch in chunks by player_id (a single .or() over full tuples is unwieldy);
  // over-fetch by player then filter to exact tuples client-side.
  const playerIds = Array.from(new Set(keys.map((k) => k.playerId)));
  const wanted = new Set(keys.map(cardKey));
  const headshots = await getHeadshots(playerIds);

  const CHUNK = 200;
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const slice = playerIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from('twelve_oh_players')
      .select(CARD_SELECT)
      .eq('league', 'ufa')
      .in('player_id', slice);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as DbCardRow[]) {
      const key = cardKey({ playerId: row.player_id, teamSlug: row.team_slug, year: row.year });
      if (wanted.has(key)) out.set(key, enrichCard(row, headshots.get(row.player_id) ?? null));
    }
  }
  return out;
}

// ─── Headshots (UFA only) ────────────────────────────────────────────────────

async function getHeadshots(playerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (playerIds.length === 0) return out;
  const db = supabase();
  const CHUNK = 300;
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const slice = playerIds.slice(i, i + CHUNK);
    const { data, error } = await db
      .from('ufa_players')
      .select('id, headshot_url')
      .in('id', slice);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as { id: string; headshot_url: string | null }[]) {
      if (row.headshot_url) out.set(row.id, row.headshot_url);
    }
  }
  return out;
}
