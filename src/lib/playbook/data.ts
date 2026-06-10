'use client';

// Supabase-backed playbook data layer.
//
// All async — call sites should await + handle the in-flight state. Errors
// throw so the UI can decide how to surface them (toast, banner, retry).
//
// Shape conventions:
//   - DB row shape ↔ editor shape conversion happens inside this module.
//     The editor keeps using the `Play` / `Step` / `Team` types it already
//     does; this layer maps to/from the table rows so the editor code stays
//     out of the SQL weeds.
//   - Plays are scoped by either `owner_id` (personal) or `team_id` (team).
//     `listPlays(teamID?)` returns one or the other — never mixed — so the
//     editor never has to think about which bucket a play came from.

import { createClient } from '@/lib/supabase/client';
import { parseEmbed } from '@/lib/player-content/embed';
import type { Json } from '@/lib/supabase/database.types';
import type {
  DiscPos,
  Drawing,
  FieldType,
  FormationID,
  Play,
  PlayerPos,
  Step,
} from './types';

export type TeamRole = 'owner' | 'coach' | 'member';

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  role: TeamRole;
  memberCount: number;
  /** Seconds since epoch. Editor sorts on this. */
  joinedAt: number;
}

export interface TeamMember {
  userID: string;
  role: TeamRole;
  displayName: string | null;
  email: string;
  joinedAt: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: number;
  createdAt: number;
}

// ─── teams ─────────────────────────────────────────────────────────────────

/**
 * List every team the signed-in user belongs to, with their per-team role.
 * Member counts are computed via a second small query so we can keep the
 * RLS predicates simple — the row counts a member can see are exactly the
 * row counts of teams they belong to.
 */
export async function listMyTeams(): Promise<Team[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows, error } = await supabase
    .from('pb_team_members')
    .select(
      `
      role,
      joined_at,
      team:team_id (
        id,
        name,
        short_name,
        color
      )
    `,
    )
    .eq('user_id', user.id);

  if (error) throw error;

  // Fetch member counts in a single roundtrip per page (low N for a normal
  // user). If teams ever balloon, swap this for an RPC that returns the
  // count grouped by team_id.
  const teamIDs = (rows ?? [])
    .map((r) => (r.team as { id: string } | null)?.id)
    .filter((v): v is string => !!v);

  const counts = new Map<string, number>();
  if (teamIDs.length > 0) {
    const { data: memberRows } = await supabase
      .from('pb_team_members')
      .select('team_id')
      .in('team_id', teamIDs);
    for (const r of memberRows ?? []) {
      counts.set(r.team_id, (counts.get(r.team_id) ?? 0) + 1);
    }
  }

  return (rows ?? [])
    .filter((r) => r.team)
    .map((r) => {
      const t = r.team as { id: string; name: string; short_name: string; color: string };
      return {
        id: t.id,
        name: t.name,
        shortName: t.short_name,
        color: t.color,
        role: r.role as TeamRole,
        memberCount: counts.get(t.id) ?? 1,
        joinedAt: new Date(r.joined_at).getTime(),
      };
    });
}

export async function createTeam(input: {
  name: string;
  shortName: string;
  color: string;
}): Promise<Team> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('pb_teams')
    .insert({
      name: input.name.trim(),
      short_name: input.shortName.trim().toUpperCase(),
      color: input.color,
      owner_id: user.id,
    })
    .select('id, name, short_name, color, created_at')
    .single();
  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    shortName: data.short_name,
    color: data.color,
    role: 'owner',
    memberCount: 1,
    joinedAt: new Date(data.created_at).getTime(),
  };
}

export async function renameTeam(teamID: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('pb_teams')
    .update({ name: name.trim() })
    .eq('id', teamID);
  if (error) throw error;
}

/** Owner-only. RLS denies non-owners. */
export async function deleteTeam(teamID: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('pb_teams').delete().eq('id', teamID);
  if (error) throw error;
}

/** Remove yourself from a team. */
export async function leaveTeam(teamID: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('pb_team_members')
    .delete()
    .eq('team_id', teamID)
    .eq('user_id', user.id);
  if (error) throw error;
}

export async function listTeamMembers(teamID: string): Promise<TeamMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_team_members')
    .select(
      `
      role,
      joined_at,
      user_id,
      profiles:user_id (
        display_name,
        email
      )
    `,
    )
    .eq('team_id', teamID);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = row.profiles as { display_name: string | null; email: string } | null;
    return {
      userID: row.user_id,
      role: row.role as TeamRole,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? '',
      joinedAt: new Date(row.joined_at).getTime(),
    };
  });
}

export async function listPendingInvites(teamID: string): Promise<PendingInvite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pb_team_invites')
    .select('id, email, role, expires_at, created_at, accepted_at')
    .eq('team_id', teamID)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as TeamRole,
    expiresAt: new Date(row.expires_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  }));
}

/** Server-side: generates token + inserts invite. Returns the token so the
 *  caller can build a share link. */
export async function createInvite(
  teamID: string,
  email: string,
  role: TeamRole = 'member',
): Promise<{ token: string; expiresAt: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_team_invite', {
    p_team_id: teamID,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  const row = (data as { token: string; expires_at: string }[])[0];
  if (!row) throw new Error('Invite was not created.');
  return { token: row.token, expiresAt: new Date(row.expires_at).getTime() };
}

export async function revokeInvite(inviteID: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('pb_team_invites').delete().eq('id', inviteID);
  if (error) throw error;
}

/** Look up the email + team name an invite token was sent to, so the accept
 *  page can prefill the signup form. Returns null for invalid/expired/used
 *  tokens (the UI just won't prefill). Calls the SECURITY DEFINER RPC
 *  preview_team_invite, which exposes only the email + team name. */
export async function previewInvite(
  token: string,
): Promise<{ email: string; teamName: string } | null> {
  const supabase = createClient();
  // Cast: preview_team_invite is newer than the generated database.types.ts,
  // so the rpc name + return shape aren't in the union yet. Regenerate types
  // to drop this cast.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: { email: string; team_name: string }[] | null; error: unknown }>
  )('preview_team_invite', { p_token: token });
  if (error) return null;
  const row = data?.[0];
  if (!row) return null;
  return { email: row.email, teamName: row.team_name };
}

export async function acceptInvite(token: string): Promise<{
  teamID: string;
  teamName: string;
  role: TeamRole;
}> {
  const supabase = createClient();

  // Right after signup the user object can flip to truthy a beat BEFORE the
  // session JWT is attached to the supabase client's request headers. If the
  // RPC fires in that window it runs as the `anon` role (which lacks EXECUTE on
  // accept_team_invite) → "permission denied for function" → the accept fails
  // and the new member is never added. Wait for a real session first, then
  // retry the RPC a couple of times on transient auth/permission errors.
  await waitForSession(supabase);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc('accept_team_invite', { p_token: token });
    if (!error) {
      const row = (data as { team_id: string; team_name: string; role: TeamRole }[])[0];
      if (!row) throw new Error('Invite could not be accepted.');
      return { teamID: row.team_id, teamName: row.team_name, role: row.role };
    }
    lastError = error;
    // Only retry the transient "not authenticated yet" class of error; real
    // errors (expired / wrong email / already used) should fail fast.
    const msg = (error.message ?? '').toLowerCase();
    const transient =
      msg.includes('permission denied') ||
      msg.includes('not authenticated') ||
      error.code === '42501';
    if (!transient) throw error;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    // Refresh the session before the next try.
    await supabase.auth.getSession();
  }
  throw lastError ?? new Error('Invite could not be accepted.');
}

/** Wait (up to ~2s) for an authenticated session so RPCs run as `authenticated`,
 *  not `anon`. Returns once a session exists or the timeout elapses. */
async function waitForSession(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ─── plays ─────────────────────────────────────────────────────────────────

/**
 * List plays in one scope. Pass `{ scope: 'personal' }` for the user's own
 * plays, or `{ scope: 'team', teamID }` for a team's plays. Includes every
 * step inline (we always need them for the editor — separate fetches would
 * cause a flash of "empty" steps when the user opens a play).
 */
export async function listPlays(
  scope: { scope: 'personal' } | { scope: 'team'; teamID: string },
): Promise<Play[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('pb_plays')
    .select(
      `
      id, name, formation, field_type, video_url, owner_id, team_id, created_at, updated_at,
      pb_play_steps (
        id, position, duration_ms, note, payload
      )
    `,
    )
    .order('updated_at', { ascending: false });

  if (scope.scope === 'personal') {
    query = query.eq('owner_id', user.id).is('team_id', null);
  } else {
    query = query.eq('team_id', scope.teamID);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(playRowToPlay);
}

export async function createPlay(input: {
  name: string;
  formation: FormationID;
  fieldType: FieldType;
  firstStep: Omit<Step, 'id'>;
  scope: { scope: 'personal' } | { scope: 'team'; teamID: string };
}): Promise<Play> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Both insert shapes share these fields. The discriminated XOR (owner_id
  // null XOR team_id null) is enforced by the CHECK constraint in SQL.
  const insertRow: {
    name: string;
    formation: string;
    field_type: string;
    owner_id: string | null;
    team_id: string | null;
    created_by: string;
  } =
    input.scope.scope === 'personal'
      ? {
          name: input.name.trim() || 'Untitled play',
          formation: input.formation,
          field_type: input.fieldType,
          owner_id: user.id,
          team_id: null,
          created_by: user.id,
        }
      : {
          name: input.name.trim() || 'Untitled play',
          formation: input.formation,
          field_type: input.fieldType,
          owner_id: null,
          team_id: input.scope.teamID,
          created_by: user.id,
        };

  const { data: play, error } = await supabase
    .from('pb_plays')
    .insert(insertRow)
    .select('id, name, formation, field_type, video_url, owner_id, team_id, created_at, updated_at')
    .single();
  if (error) throw error;

  // Insert the seed step at position 0.
  const { data: step, error: stepErr } = await supabase
    .from('pb_play_steps')
    .insert({
      play_id: play.id,
      position: 0,
      duration_ms: input.firstStep.durationMs ?? 0,
      note: input.firstStep.note ?? null,
      payload: stepToPayload(input.firstStep) as unknown as Json,
    })
    .select('id, position, duration_ms, note, payload')
    .single();
  if (stepErr) throw stepErr;

  return playRowToPlay({ ...play, pb_play_steps: [step] });
}

export async function renamePlay(playID: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('pb_plays')
    .update({ name: name.trim() || 'Untitled play' })
    .eq('id', playID);
  if (error) throw error;
}

export async function deletePlay(playID: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('pb_plays').delete().eq('id', playID);
  if (error) throw error;
}

/**
 * Copy a play into another scope (personal ↔ team, or team → team). Creates a
 * brand-new play row in the target scope and duplicates every step. The
 * original is left untouched.
 *
 * Permissions are enforced entirely by RLS:
 *   - reading the source requires view rights (own it, or member of its team)
 *   - inserting into the target requires insert rights (it's your personal
 *     playbook, OR you're an owner/coach of the target team)
 * A caller without target-insert rights gets a row-level-security error.
 *
 * Returns the newly-created play (with its duplicated steps).
 */
export async function copyPlay(
  playID: string,
  target: { scope: 'personal' } | { scope: 'team'; teamID: string },
): Promise<Play> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // 1. Load the source play + its steps (RLS gates this to plays we can view).
  const { data: src, error: srcErr } = await supabase
    .from('pb_plays')
    .select(
      `
      name, formation, field_type, video_url,
      pb_play_steps ( position, duration_ms, note, payload )
    `,
    )
    .eq('id', playID)
    .single();
  if (srcErr) throw srcErr;
  if (!src) throw new Error('Play not found.');

  // 2. Insert the new play in the target scope. Mirrors createPlay's XOR shape;
  //    created_by must be the caller for the insert policy to pass. Insert is
  //    called in each branch separately so TS sees a concrete row type per path
  //    (Supabase's RejectExcessProperties rejects a discriminated union in one
  //    variable — same reason createPlay/LinkForm split their inserts).
  const sharedCols = {
    name: src.name,
    formation: src.formation,
    field_type: src.field_type,
    video_url: src.video_url ?? null,
    created_by: user.id,
  };
  const returnCols =
    'id, name, formation, field_type, video_url, owner_id, team_id, created_at, updated_at';

  const { data: play, error: playErr } =
    target.scope === 'personal'
      ? await supabase
          .from('pb_plays')
          .insert({ ...sharedCols, owner_id: user.id, team_id: null })
          .select(returnCols)
          .single()
      : await supabase
          .from('pb_plays')
          .insert({ ...sharedCols, owner_id: null, team_id: target.teamID })
          .select(returnCols)
          .single();
  if (playErr) throw playErr;

  // 3. Duplicate the steps into the new play, preserving order.
  const srcSteps = (src.pb_play_steps ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  if (srcSteps.length === 0) {
    return playRowToPlay({ ...play, pb_play_steps: [] });
  }

  const stepRows = srcSteps.map((s, i) => ({
    play_id: play.id,
    position: i,
    duration_ms: s.duration_ms,
    note: s.note,
    payload: s.payload as Json,
  }));

  const { data: steps, error: stepsErr } = await supabase
    .from('pb_play_steps')
    .insert(stepRows)
    .select('id, position, duration_ms, note, payload');
  if (stepsErr) {
    // Roll back the new play so we don't leave a stepless orphan.
    await supabase.from('pb_plays').delete().eq('id', play.id);
    throw stepsErr;
  }

  return playRowToPlay({ ...play, pb_play_steps: steps });
}

// ─── steps ─────────────────────────────────────────────────────────────────

/**
 * Upsert the entire step list for a play. We delete the existing rows and
 * insert the new set in a single transaction-ish pair of calls (Postgres
 * cascade on play_id makes this cheap). Last-write-wins by design — until
 * we add multi-editor sync, the user holding the editor open last is the
 * one whose changes survive.
 */
export async function replaceSteps(playID: string, steps: Step[]): Promise<Step[]> {
  const supabase = createClient();

  // Wipe + reinsert. Could be a single `upsert` but rebalancing positions
  // on inserts/deletes is fiddly and the editor never has more than a few
  // dozen steps, so a clean replace is fine.
  const { error: delErr } = await supabase.from('pb_play_steps').delete().eq('play_id', playID);
  if (delErr) throw delErr;

  if (steps.length === 0) return [];

  const rows = steps.map((s, i) => ({
    play_id: playID,
    position: i,
    duration_ms: s.durationMs ?? 700,
    note: s.note ?? null,
    payload: stepToPayload(s) as unknown as Json,
  }));

  const { data, error } = await supabase
    .from('pb_play_steps')
    .insert(rows)
    .select('id, position, duration_ms, note, payload');
  if (error) throw error;

  return (data ?? [])
    .sort((a, b) => a.position - b.position)
    .map(stepRowToStep);
}

// Bump the play's updated_at without touching anything else (used after a
// successful step replace so the play list re-sorts correctly).
export async function touchPlay(playID: string): Promise<void> {
  const supabase = createClient();
  await supabase.from('pb_plays').update({ updated_at: new Date().toISOString() }).eq('id', playID);
}

// ─── conversions ───────────────────────────────────────────────────────────

interface StepPayload {
  players: PlayerPos[];
  defenders?: PlayerPos[];
  disc: DiscPos;
  drawings?: Drawing[];
}

function stepToPayload(step: Omit<Step, 'id'> | Step): StepPayload {
  return {
    players: step.players,
    defenders: step.defenders,
    disc: step.disc,
    drawings: step.drawings,
  };
}

function stepRowToStep(row: {
  id: string;
  position: number;
  duration_ms: number;
  note: string | null;
  payload: unknown;
}): Step {
  const p = (row.payload ?? {}) as Partial<StepPayload>;
  return {
    id: row.id,
    players: p.players ?? [],
    defenders: p.defenders,
    disc: p.disc ?? { ownerID: 0, x: 0.5, y: 0.5 },
    drawings: p.drawings,
    note: row.note ?? undefined,
    durationMs: row.duration_ms,
  };
}

interface PlayRow {
  id: string;
  name: string;
  formation: string;
  field_type: string;
  video_url?: string | null;
  owner_id: string | null;
  team_id: string | null;
  created_at: string;
  updated_at: string;
  pb_play_steps:
    | {
        id: string;
        position: number;
        duration_ms: number;
        note: string | null;
        payload: unknown;
      }[]
    | null;
}

function playRowToPlay(row: PlayRow): Play {
  const steps = (row.pb_play_steps ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(stepRowToStep);

  return {
    id: row.id,
    name: row.name,
    formation: row.formation as FormationID,
    fieldType: row.field_type as FieldType,
    videoUrl: row.video_url ?? null,
    steps,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * Attach or clear a reference video on a play.
 *
 * Accepted values for `raw`:
 *   - A YouTube/Vimeo watch URL → validated via parseEmbed; stored as the
 *     canonical watch URL so it round-trips cleanly.
 *   - A storage path prefixed with "storage:" (e.g. "storage:uid/play-ts.mp4")
 *     → stored as-is; these come from our own upload flow and are trusted.
 *   - null / empty / whitespace → clears the video_url column.
 *
 * Throws if the value is non-empty, does NOT start with "storage:", and
 * parseEmbed returns null (junk URL).
 * RLS enforces write permission server-side (owner or team editor).
 */
export const STORAGE_VIDEO_PREFIX = 'storage:';

export async function setPlayVideo(playID: string, raw: string | null): Promise<void> {
  // Treat blank strings as a clear request.
  const trimmed = raw?.trim() ?? '';
  let stored: string | null = null;

  const supabase = createClient();

  if (trimmed !== '') {
    if (trimmed.startsWith(STORAGE_VIDEO_PREFIX)) {
      // Storage path from our own upload flow. Do NOT trust it blindly: the
      // playbook-videos bucket allows any authenticated user to read any object,
      // so without this check a user could attach SOMEONE ELSE's uploaded file
      // to their own play by passing a foreign storage path. Enforce that the
      // path's owner-folder ({uid}/…) matches the caller — they can only attach
      // files they uploaded themselves.
      const objectPath = trimmed.slice(STORAGE_VIDEO_PREFIX.length);
      const ownerFolder = objectPath.split('/')[0];
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      if (ownerFolder !== user.id) {
        throw new Error('Invalid video reference.');
      }
      stored = trimmed;
    } else {
      const info = parseEmbed(trimmed);
      if (!info) {
        throw new Error('Paste a YouTube or Vimeo link');
      }
      // Store the canonical watch URL (not the embed URL) so it round-trips
      // cleanly and can be re-parsed by parseEmbed on read.
      stored = info.watchUrl;
    }
  }

  const { error } = await supabase
    .from('pb_plays')
    .update({ video_url: stored })
    .eq('id', playID);
  if (error) throw error;
}
