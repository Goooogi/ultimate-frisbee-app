// send-game-notifications: the push sender the mobile app's notification_prefs
// contract has been waiting on. Runs on pg_cron every 5 minutes; finds games
// that are about to start or recently went final, computes the audience per
// Hunter's targeting rules, and delivers via Expo's push API to push_tokens.
//
// TARGETING (2026-08-26):
//   UFA  game — playoffs (incl. Championship Weekend + All-Star): every user
//               with UFA in user_favorite_leagues. Regular season: only users
//               following the home/away team in user_favorite_teams.
//   USAU game — Nationals (club_nationals / college_d1_championships /
//               college_d3_championships events): every user with USAU in
//               user_favorite_leagues. Any other tournament: only users
//               following team_a/team_b.
//   Always intersected with notification_prefs: push_enabled AND the category
//   toggle (game_start / game_final). A MISSING prefs row means all-defaults
//   (everything on) — that contract lives in the mobile app's
//   src/lib/push/prefs.ts and must stay in sync.
//
// DEDUP: game_notifications (league, game_id, category) is claimed with an
// insert-ignore BEFORE sending, so a game notifies at most once per category,
// ever — a crash after the claim loses that one send rather than duplicating
// it on the next cron tick.
//
// WINDOWS: "starting soon" = start time within [now-10m, now+15m] and still
// pre-game status (Upcoming / scheduled). "final" = status Final/final with a
// start time within [now-3h, now] — bounded below so the first deploy (and
// any sync backfill) can't spam pushes for long-finished games, and ABOVE
// because bad data exists: legacy USAU events carry status=final with
// placeholder dates months in the future. USAU rows whose scheduled_at is
// exactly midnight UTC are date-only placeholders (no real start time) and
// are skipped for both categories.
//
// Auth: verify_jwt off, but the request must carry the service-role key as
// the Bearer token (pg_cron injects it from Vault) — anything else is 401.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;

const START_LEAD_MS = 15 * 60_000; // notify up to 15 min before start
const START_GRACE_MS = 10 * 60_000; // still notify if the cron ran late
const FINAL_WINDOW_MS = 3 * 3600_000;

// UFA playoff cut: weeks are 'week-N'; any non-numeric label (semifinals,
// championship — pre-2024 seasons) is playoffs, and for label-less seasons the
// bracket lives past the regular season's last week. 2026: 14 regular-season
// weeks, playoffs are week-15 (division finals) and week-16 (Championship
// Weekend + All-Star game). Extend this map when a season's structure changes.
const UFA_PLAYOFF_START_WEEK: Record<number, number> = { 2026: 15 };
const UFA_PLAYOFF_START_DEFAULT = 15;

const NATIONALS_TEMPLATES = new Set([
  'club_nationals',
  'college_d1_championships',
  'college_d3_championships',
]);

type Category = 'game_start' | 'game_final';

interface Notice {
  league: 'ufa' | 'usau';
  gameId: string;
  category: Category;
  title: string;
  body: string;
  /** Deep-link payload for the app (route wiring can come later). */
  data: Record<string, string>;
  teamIds: string[];
  leagueWide: boolean;
}

function ufaIsPlayoff(week: string | null, year: number): boolean {
  if (!week) return false;
  const m = /^week-(\d+)$/.exec(week);
  if (!m) return true; // labeled rounds (semifinals, championship, …)
  return Number(m[1]) >= (UFA_PLAYOFF_START_WEEK[year] ?? UFA_PLAYOFF_START_DEFAULT);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Candidate collection ────────────────────────────────────────────────────

async function ufaCandidates(sb: SupabaseClient, now: number): Promise<Notice[]> {
  const startLo = new Date(now - START_GRACE_MS).toISOString();
  const startHi = new Date(now + START_LEAD_MS).toISOString();
  const finalLo = new Date(now - FINAL_WINDOW_MS).toISOString();

  const [starts, finals] = await Promise.all([
    sb
      .from('ufa_games')
      .select('id, year, week, home_team_id, away_team_id, start_timestamp')
      .eq('status', 'Upcoming')
      .gte('start_timestamp', startLo)
      .lte('start_timestamp', startHi),
    sb
      .from('ufa_games')
      .select('id, year, week, home_team_id, away_team_id, home_score, away_score, start_timestamp')
      .eq('status', 'Final')
      .gte('start_timestamp', finalLo)
      .lte('start_timestamp', new Date(now).toISOString()),
  ]);
  if (starts.error) throw starts.error;
  if (finals.error) throw finals.error;

  const teamIds = new Set<string>();
  for (const g of [...(starts.data ?? []), ...(finals.data ?? [])]) {
    if (g.home_team_id) teamIds.add(g.home_team_id);
    if (g.away_team_id) teamIds.add(g.away_team_id);
  }
  const names = new Map<string, string>();
  if (teamIds.size > 0) {
    const { data, error } = await sb
      .from('ufa_teams')
      .select('id, name, full_name')
      .in('id', [...teamIds]);
    if (error) throw error;
    for (const t of data ?? []) names.set(t.id, t.full_name ?? t.name ?? t.id);
  }
  const nameOf = (id: string | null) => (id ? names.get(id) ?? id : 'TBD');

  const notices: Notice[] = [];
  for (const g of starts.data ?? []) {
    const playoff = ufaIsPlayoff(g.week, g.year);
    notices.push({
      league: 'ufa',
      gameId: g.id,
      category: 'game_start',
      title: `${nameOf(g.away_team_id)} at ${nameOf(g.home_team_id)}`,
      body: playoff ? 'UFA Playoffs — starting soon' : 'UFA — starting soon',
      data: { league: 'ufa', gameId: g.id, category: 'game_start' },
      teamIds: [g.home_team_id, g.away_team_id].filter(Boolean) as string[],
      leagueWide: playoff,
    });
  }
  for (const g of finals.data ?? []) {
    const playoff = ufaIsPlayoff(g.week, g.year);
    notices.push({
      league: 'ufa',
      gameId: g.id,
      category: 'game_final',
      title: `${nameOf(g.away_team_id)} at ${nameOf(g.home_team_id)}`,
      body: `Final: ${nameOf(g.away_team_id)} ${g.away_score ?? '–'}, ${nameOf(g.home_team_id)} ${g.home_score ?? '–'}`,
      data: { league: 'ufa', gameId: g.id, category: 'game_final' },
      teamIds: [g.home_team_id, g.away_team_id].filter(Boolean) as string[],
      leagueWide: playoff,
    });
  }
  return notices;
}

async function usauCandidates(sb: SupabaseClient, now: number): Promise<Notice[]> {
  const startLo = new Date(now - START_GRACE_MS).toISOString();
  const startHi = new Date(now + START_LEAD_MS).toISOString();
  const finalLo = new Date(now - FINAL_WINDOW_MS).toISOString();

  const [starts, finals] = await Promise.all([
    sb
      .from('usau_games')
      .select('id, event_id, team_a_id, team_b_id, scheduled_at')
      .eq('status', 'scheduled')
      .gte('scheduled_at', startLo)
      .lte('scheduled_at', startHi),
    sb
      .from('usau_games')
      .select('id, event_id, team_a_id, team_b_id, score_a, score_b, scheduled_at')
      .eq('status', 'final')
      .gte('scheduled_at', finalLo)
      .lte('scheduled_at', new Date(now).toISOString()),
  ]);
  if (starts.error) throw starts.error;
  if (finals.error) throw finals.error;

  // Midnight-UTC scheduled_at = date-only placeholder (legacy scrapes store no
  // real start time) — never notify off those.
  const hasRealTime = (iso: string | null): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
  };
  const startRows = (starts.data ?? []).filter((g) => hasRealTime(g.scheduled_at));
  const finalRows = (finals.data ?? []).filter((g) => hasRealTime(g.scheduled_at));

  const all = [...startRows, ...finalRows];
  if (all.length === 0) return [];

  const eventIds = [...new Set(all.map((g) => g.event_id).filter(Boolean))];
  const teamIds = [
    ...new Set(all.flatMap((g) => [g.team_a_id, g.team_b_id]).filter(Boolean)),
  ] as string[];

  const events = await sb.from('usau_events').select('id, name, template_key').in('id', eventIds);
  if (events.error) throw events.error;
  const teams = teamIds.length > 0
    ? await sb.from('usau_teams').select('id, name').in('id', teamIds)
    : { data: [], error: null };
  if (teams.error) throw teams.error;

  const eventById = new Map<string, { id: string; name: string; template_key: string | null }>(
    (events.data ?? []).map((e) => [String(e.id), e]),
  );
  const teamName = new Map<string, string>((teams.data ?? []).map((t) => [String(t.id), t.name]));
  const nameOf = (id: string | null) => (id ? teamName.get(String(id)) ?? 'TBD' : 'TBD');

  const notices: Notice[] = [];
  for (const g of startRows) {
    const ev = eventById.get(String(g.event_id));
    const nationals = NATIONALS_TEMPLATES.has(ev?.template_key ?? '');
    notices.push({
      league: 'usau',
      gameId: String(g.id),
      category: 'game_start',
      title: `${nameOf(g.team_a_id)} vs ${nameOf(g.team_b_id)}`,
      body: `${ev?.name ?? 'USAU'} — starting soon`,
      data: { league: 'usau', gameId: String(g.id), eventId: String(g.event_id), category: 'game_start' },
      teamIds: [g.team_a_id, g.team_b_id].filter(Boolean) as string[],
      leagueWide: nationals,
    });
  }
  for (const g of finalRows) {
    // Never announce a "final" without a score — placeholder rows sync in
    // scoreless sometimes and would push a blank result.
    if (g.score_a == null || g.score_b == null) continue;
    const ev = eventById.get(String(g.event_id));
    const nationals = NATIONALS_TEMPLATES.has(ev?.template_key ?? '');
    notices.push({
      league: 'usau',
      gameId: String(g.id),
      category: 'game_final',
      title: `${nameOf(g.team_a_id)} vs ${nameOf(g.team_b_id)}`,
      body: `Final: ${nameOf(g.team_a_id)} ${g.score_a}, ${nameOf(g.team_b_id)} ${g.score_b}`,
      data: { league: 'usau', gameId: String(g.id), eventId: String(g.event_id), category: 'game_final' },
      teamIds: [g.team_a_id, g.team_b_id].filter(Boolean) as string[],
      leagueWide: nationals,
    });
  }
  return notices;
}

// ─── Audience resolution ─────────────────────────────────────────────────────

interface Prefs {
  push_enabled: boolean;
  game_start: boolean;
  game_final: boolean;
}
const DEFAULT_PREFS: Prefs = { push_enabled: true, game_start: true, game_final: true };

async function resolveAudiences(
  sb: SupabaseClient,
  notices: Notice[],
): Promise<Map<Notice, string[]>> {
  // One fetch per league for team follows + league follows, shared across
  // every claimed notice.
  const leagues = [...new Set(notices.map((n) => n.league))];
  const teamFollowers = new Map<string, Map<string, string[]>>(); // league → team_id → user_ids
  const leagueFollowers = new Map<string, string[]>();

  for (const league of leagues) {
    const teamIds = [...new Set(notices.filter((n) => n.league === league).flatMap((n) => n.teamIds))];
    if (teamIds.length > 0) {
      const { data, error } = await sb
        .from('user_favorite_teams')
        .select('user_id, team_id')
        .eq('league', league)
        .in('team_id', teamIds);
      if (error) throw error;
      const byTeam = new Map<string, string[]>();
      for (const r of data ?? []) {
        const list = byTeam.get(String(r.team_id)) ?? [];
        list.push(r.user_id);
        byTeam.set(String(r.team_id), list);
      }
      teamFollowers.set(league, byTeam);
    }
    if (notices.some((n) => n.league === league && n.leagueWide)) {
      const { data, error } = await sb
        .from('user_favorite_leagues')
        .select('user_id')
        .eq('league', league);
      if (error) throw error;
      leagueFollowers.set(league, (data ?? []).map((r) => r.user_id));
    }
  }

  // Candidate users across all notices → prefs in one fetch (no row = defaults).
  const allUsers = new Set<string>();
  const userSets = new Map<Notice, Set<string>>();
  for (const n of notices) {
    const users = new Set<string>();
    const byTeam = teamFollowers.get(n.league);
    for (const t of n.teamIds) for (const u of byTeam?.get(String(t)) ?? []) users.add(u);
    if (n.leagueWide) for (const u of leagueFollowers.get(n.league) ?? []) users.add(u);
    userSets.set(n, users);
    for (const u of users) allUsers.add(u);
  }
  if (allUsers.size === 0) return new Map(notices.map((n) => [n, []]));

  const { data: prefRows, error: prefErr } = await sb
    .from('notification_prefs')
    .select('user_id, push_enabled, game_start, game_final')
    .in('user_id', [...allUsers]);
  if (prefErr) throw prefErr;
  const prefs = new Map<string, Prefs>((prefRows ?? []).map((r) => [r.user_id, r]));

  const audiences = new Map<Notice, string[]>();
  for (const n of notices) {
    audiences.set(
      n,
      [...(userSets.get(n) ?? [])].filter((u) => {
        const p = prefs.get(u) ?? DEFAULT_PREFS;
        return p.push_enabled && p[n.category];
      }),
    );
  }
  return audiences;
}

// ─── Expo delivery ───────────────────────────────────────────────────────────

async function sendExpoPushes(
  sb: SupabaseClient,
  messages: Array<{ to: string; title: string; body: string; data: Record<string, string> }>,
): Promise<number> {
  let delivered = 0;
  for (const batch of chunk(messages, EXPO_BATCH)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
    });
    if (!res.ok) {
      console.error('[send-game-notifications] expo push HTTP', res.status, await res.text());
      continue;
    }
    const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      if (t.status === 'ok') {
        delivered += 1;
      } else if (t.details?.error === 'DeviceNotRegistered') {
        // Token is dead (app uninstalled / permissions revoked) — drop it so
        // we stop paying for it every send.
        await sb.from('push_tokens').delete().eq('token', batch[i].to);
      } else {
        console.warn('[send-game-notifications] ticket error', batch[i].to.slice(0, 24), t.details?.error);
      }
    }
  }
  return delivered;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

// Constant-time-equivalent auth check: compare SHA-256 digests of the header
// and the expected value, so the string compare can't leak key bytes through
// timing. Fails closed when the service key env var is missing.
async function authorized(req: Request, serviceKey: string): Promise<boolean> {
  if (!serviceKey) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(req.headers.get('Authorization') ?? '')),
    crypto.subtle.digest('SHA-256', enc.encode(`Bearer ${serviceKey}`)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!(await authorized(req, serviceKey))) {
    return new Response('unauthorized', { status: 401 });
  }
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const now = Date.now();

  const candidates = [
    ...(await ufaCandidates(sb, now)),
    ...(await usauCandidates(sb, now)),
  ];
  if (candidates.length === 0) {
    return Response.json({ ok: true, candidates: 0, sent: 0 });
  }

  let claimed = candidates;
  if (!dryRun) {
    // Claim before sending: only rows that actually inserted are ours to send.
    const { data: claimedRows, error } = await sb
      .from('game_notifications')
      .upsert(
        candidates.map((n) => ({ league: n.league, game_id: n.gameId, category: n.category })),
        { onConflict: 'league,game_id,category', ignoreDuplicates: true },
      )
      .select('league, game_id, category');
    if (error) throw error;
    const won = new Set((claimedRows ?? []).map((r) => `${r.league}|${r.game_id}|${r.category}`));
    claimed = candidates.filter((n) => won.has(`${n.league}|${n.gameId}|${n.category}`));
  }
  if (claimed.length === 0) {
    return Response.json({ ok: true, candidates: candidates.length, claimed: 0, sent: 0 });
  }

  const audiences = await resolveAudiences(sb, claimed);

  const userIds = [...new Set([...audiences.values()].flat())];
  const tokensByUser = new Map<string, string[]>();
  if (userIds.length > 0) {
    const { data, error } = await sb
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds);
    if (error) throw error;
    for (const r of data ?? []) {
      const list = tokensByUser.get(r.user_id) ?? [];
      list.push(r.token);
      tokensByUser.set(r.user_id, list);
    }
  }

  let sent = 0;
  const summary: Array<Record<string, unknown>> = [];
  for (const n of claimed) {
    const users = audiences.get(n) ?? [];
    const tokens = users.flatMap((u) => tokensByUser.get(u) ?? []);
    summary.push({ league: n.league, gameId: n.gameId, category: n.category, users: users.length, tokens: tokens.length, leagueWide: n.leagueWide });
    if (dryRun || tokens.length === 0) continue;
    const delivered = await sendExpoPushes(
      sb,
      tokens.map((to) => ({ to, title: n.title, body: n.body, data: n.data })),
    );
    sent += delivered;
    await sb
      .from('game_notifications')
      .update({ recipients: delivered })
      .eq('league', n.league)
      .eq('game_id', n.gameId)
      .eq('category', n.category);
  }

  return Response.json({ ok: true, dryRun, candidates: candidates.length, claimed: claimed.length, sent, summary });
});
