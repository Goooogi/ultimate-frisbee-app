/**
 * Repair + fill USAU per-event final placements → guarded SQL migration FILES
 * ─────────────────────────────────────────────────────────────────────────────
 * derivePlacements() (src/lib/usau/derive-placement.ts, Feature Backlog #18)
 * ran ONCE, as the 2026-07-20 backfill, with three bugs fixed 2026-09-23:
 * misread bracket names ("13th Place Seeding 2" → 2nd), a final loser keeping
 * 2nd after losing the game-to-go, and semi losers tied although they met
 * again. Nothing called it since, so later events have no placement at all.
 *
 * This regenerates every settled event with the fixed algorithm through
 * planEventPlacements() — the safety layer the edge functions share — in
 * repair mode: fill NULLs, correct stored places the brackets now place
 * differently, and clear (NULL) stored places that are proven wrong or that
 * the fixed algorithm can't place (a known-wrong value is worse than none).
 * An event with a bracket game still scheduled/in progress isn't re-derived;
 * only its stored duplicates (two 1sts / two 2nds / 3+ on a place) are cleared.
 *
 * READS ONLY with the publishable key (usau_* tables are RLS public-read) and
 * WRITES FILES: UPDATE chunks of at most ~90 KB, each one DO block that only
 * touches rows still holding the value it was generated from, and aborts
 * unless exactly its expected row count matches.
 *
 * USAGE (from repo root):
 *   npx tsx scripts/derive-usau-placements.ts --out=supabase/migrations/20260923000100_usau_placements
 *     → <out>_part01.sql, then the version +100 per part (…000200_usau_placements_part02.sql)
 *     [--since=YYYY-MM-DD]   only events ending on/after this date
 *     [--report=<file>.json] per-event detail dump
 * ENV: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname, basename, join } from 'path';

function loadDotEnv(file: string): void {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadDotEnv('.env.local');
loadDotEnv('.env');

import { createClient } from '@supabase/supabase-js';
import {
  planEventPlacements,
  storedConflicts,
  gameDivision,
  isBracketGame,
  type DerivePlacementGame,
  type PlacementChangeReason,
  type PlacementTeam,
} from '../src/lib/usau/derive-placement';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!SUPA_URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}
const db = createClient(SUPA_URL, KEY, { auth: { persistSession: false } });

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = arg('out');
const SINCE = arg('since');
const REPORT = arg('report');
const outMatch = OUT ? /^(\d{14})_(.+)$/.exec(basename(OUT)) : null;
if (!OUT || !outMatch) {
  console.error('Missing --out=<dir>/<14-digit version>_<name> (e.g. supabase/migrations/20260923000100_usau_placements)');
  process.exit(1);
}
if (SINCE && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error('--since must be YYYY-MM-DD');
  process.exit(1);
}

const PAGE = 1000;
const EVENT_BATCH = 40;
const GAP_MS = 150;
const CHUNK_BYTES = 90 * 1024;
const TODAY = new Date().toISOString().slice(0, 10); // UTC, same as the DB's current_date

const BRACKET_SQL = `g.bracket_name !~* '^\\s*([^·]*·\\s*)?pool'`; // = isBracketGame()
const CANDIDATE_SQL = `select e.id,
       not exists (select 1 from usau_games g
                   where g.event_id = e.id and g.status in ('scheduled', 'in_progress')
                     and ${BRACKET_SQL}) as settled
from usau_events e
where e.end_date < current_date${SINCE ? `\n  and e.end_date >= date '${SINCE}'` : ''}
  and exists (select 1 from usau_event_teams et where et.event_id = e.id)
  and exists (select 1 from usau_games g
              where g.event_id = e.id and g.status = 'final' and ${BRACKET_SQL})`;

const BACKUP_SQL = [
  `create table public.usau_event_teams_placement_backup_20260923 as`,
  `  select event_id, team_id, final_placement from public.usau_event_teams;`,
  `alter table public.usau_event_teams_placement_backup_20260923 enable row level security;`,
  `revoke all on public.usau_event_teams_placement_backup_20260923 from anon, authenticated;`,
];
const RESTORE_SQL = [
  `update public.usau_event_teams et set final_placement = b.final_placement`,
  `  from public.usau_event_teams_placement_backup_20260923 b`,
  ` where et.event_id = b.event_id and et.team_id = b.team_id`,
  `   and et.final_placement is distinct from b.final_placement;`,
];

interface EventRow {
  id: string;
  usau_slug: string;
  name: string;
  season: number | null;
  competition_level: string | null;
  end_date: string;
}
interface EventTeamRow {
  event_id: string;
  team_id: string;
  final_placement: number | null;
}
interface OpenGameRow {
  event_id: string;
  bracket_name: string | null;
}
interface GameRow {
  id: string;
  event_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  round: string;
  bracket_name: string | null;
  scheduled_at: string | null;
  team_a: PlacementTeam | null;
  team_b: PlacementTeam | null;
}

interface Change {
  teamId: string;
  from: number | null;
  to: number | null;
  reason: PlacementChangeReason;
}
interface EventPlan {
  event: EventRow;
  settled: boolean;
  changes: Change[];
  untrusted: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ranged = {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

// .range() pages over a deterministic order until an EMPTY page (not a short
// one), so a server max-rows below PAGE can't silently truncate a read.
async function fetchAll<T>(label: string, query: () => Ranged): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw new Error(`${label} @${from}: ${error.message}`);
    const rows = (data ?? []) as T[];
    await sleep(GAP_MS);
    if (rows.length === 0) return out;
    out.push(...rows);
    from += rows.length;
  }
}

const toInput = (g: GameRow): DerivePlacementGame => ({
  teamAId: g.team_a_id,
  teamBId: g.team_b_id,
  scoreA: g.score_a,
  scoreB: g.score_b,
  round: g.round,
  bracketName: g.bracket_name,
  division: gameDivision(g.team_a, g.team_b),
  scheduledAt: g.scheduled_at,
});

const comment = (s: string) => s.replace(/[\r\n$]+/g, ' ');
const sqlInt = (n: number | null) => (n == null ? 'null' : String(n));
const count = (plans: EventPlan[], pred: (c: Change) => boolean) =>
  plans.reduce((n, p) => n + p.changes.filter(pred).length, 0);
const summary = (plans: EventPlan[]) => {
  const r = (reason: PlacementChangeReason) => count(plans, (c) => c.reason === reason);
  return (
    `fill ${r('fill')} · correct ${r('correct')} · clear ${count(plans, (c) => c.to == null)} ` +
    `(conflict ${r('clear-conflict')}, contradicted ${r('clear-contradicted')}, unsupported ${r('clear-unsupported')})`
  );
};

function renderEvent(p: EventPlan, first: { value: boolean }): string[] {
  const e = p.event;
  const lines = [
    `      -- ${comment(`${e.competition_level ?? '?'} · ${e.season ?? '?'} · ${e.name} (${e.usau_slug}) · ended ${e.end_date}${p.settled ? '' : ' · unfinished bracket: duplicates cleared only'}`)}`,
  ];
  const rows = [...p.changes].sort((a, b) => (a.to ?? 999) - (b.to ?? 999) || a.teamId.localeCompare(b.teamId));
  for (const c of rows) {
    const tuple = first.value
      ? `('${p.event.id}'::uuid, '${c.teamId}'::uuid, ${sqlInt(c.from)}::int, ${sqlInt(c.to)}::int)`
      : `('${p.event.id}', '${c.teamId}', ${sqlInt(c.from)}, ${sqlInt(c.to)})`;
    first.value = false;
    lines.push(`      ${tuple},${c.reason === 'fill' ? '' : ` -- ${c.reason}`}`);
  }
  return lines;
}

function renderChunk(part: number, parts: number, plans: EventPlan[], all: EventPlan[]): string {
  const expected = count(plans, () => true);
  const tag = String(part).padStart(2, '0');
  const body: string[] = [];
  const first = { value: true };
  for (const p of plans) body.push(...renderEvent(p, first));
  // The last VALUES row carries no comma (a trailing reason comment may follow it).
  const last = body.length - 1;
  body[last] = body[last].replace(/,( -- [a-z-]+)?$/, '$1');

  const header = [
    `-- USAU per-event final placements — repair + fill, part ${tag} of ${String(parts).padStart(2, '0')}.`,
    `--`,
    `-- The 2026-07-20 one-shot derivePlacements() backfill (Feature Backlog #18)`,
    `-- stored misread brackets, game-to-go losers kept 2nd, and ties that a later`,
    `-- game had settled; nothing derived placements after it. Regenerated with the`,
    `-- fixed algorithm by scripts/derive-usau-placements.ts on ${new Date().toISOString()} —`,
    `-- do not hand-edit, re-run it.`,
    `--`,
    `-- This part: ${plans.length} events · ${summary(plans)}.`,
    `-- EXPECTED ROWS: ${expected}. A row only updates while final_placement still holds`,
    `-- the value it was generated from ("old" below); the DO block raises, rolling`,
    `-- this part back, unless exactly ${expected} rows match. Regenerate instead of forcing it.`,
    `-- All ${parts} parts: ${all.length} events · ${summary(all)}.`,
  ];
  if (part === 1) {
    header.push(
      `--`,
      `-- Back up first (once, before part 01):`,
      ...BACKUP_SQL.map((l) => `--   ${l}`),
      `-- Restore from it:`,
      ...RESTORE_SQL.map((l) => `--   ${l}`),
      `--`,
      `-- Events (evaluated through PostgREST, end_date vs ${TODAY} UTC); settled ones are`,
      `-- re-derived, unsettled ones only lose stored duplicates:`,
      ...CANDIDATE_SQL.split('\n').map((l) => `--   ${l}`),
    );
  }

  return [
    ...header,
    ``,
    `DO $migration$`,
    `DECLARE`,
    `  v_expected constant int := ${expected};`,
    `  v_updated int;`,
    `BEGIN`,
    `  update public.usau_event_teams et`,
    `     set final_placement = v.new_place`,
    `    from (values`,
    ...body,
    `    ) as v(event_id, team_id, old_place, new_place)`,
    `   where et.event_id = v.event_id`,
    `     and et.team_id = v.team_id`,
    `     and et.final_placement is not distinct from v.old_place;`,
    `  GET DIAGNOSTICS v_updated = ROW_COUNT;`,
    `  IF v_updated <> v_expected THEN`,
    `    RAISE EXCEPTION 'usau placements part ${tag}: expected % rows, matched %; data drifted since generation, re-run scripts/derive-usau-placements.ts', v_expected, v_updated;`,
    `  END IF;`,
    `  RAISE NOTICE 'usau placements part ${tag}: updated % rows', v_updated;`,
    `END`,
    `$migration$;`,
    ``,
  ].join('\n');
}

/** Greedy: whole events per chunk, each chunk's SQL at most CHUNK_BYTES. */
function chunk(plans: EventPlan[]): EventPlan[][] {
  const chunks: EventPlan[][] = [];
  let cur: EventPlan[] = [];
  const fits = (ps: EventPlan[]) => Buffer.byteLength(renderChunk(1, 99, ps, plans)) <= CHUNK_BYTES;
  for (const p of plans) {
    if (cur.length > 0 && !fits([...cur, p])) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

async function main() {
  console.log(`Events ended before ${TODAY}${SINCE ? `, on/after ${SINCE}` : ''}`);

  const events = await fetchAll<EventRow>('usau_events', () => {
    let q = db.from('usau_events').select('id, usau_slug, name, season, competition_level, end_date').lt('end_date', TODAY);
    if (SINCE) q = q.gte('end_date', SINCE);
    return q.order('id');
  });

  const openGames = await fetchAll<OpenGameRow>('open games', () =>
    db.from('usau_games').select('event_id, bracket_name').in('status', ['scheduled', 'in_progress']).order('id'),
  );
  const unsettled = new Set(openGames.filter((g) => isBracketGame(g.bracket_name)).map((g) => g.event_id));

  const etRows = await fetchAll<EventTeamRow>('usau_event_teams', () =>
    db.from('usau_event_teams').select('event_id, team_id, final_placement').order('event_id').order('team_id'),
  );
  const storedByEvent = new Map<string, Map<string, number | null>>();
  for (const r of etRows) {
    const m = storedByEvent.get(r.event_id) ?? new Map<string, number | null>();
    m.set(r.team_id, r.final_placement);
    storedByEvent.set(r.event_id, m);
  }

  const withTeams = events.filter((e) => storedByEvent.has(e.id));
  const gamesByEvent = new Map<string, GameRow[]>();
  const ids = withTeams.map((e) => e.id).sort();
  for (let i = 0; i < ids.length; i += EVENT_BATCH) {
    const batch = ids.slice(i, i + EVENT_BATCH);
    const rows = await fetchAll<GameRow>('usau_games', () =>
      db
        .from('usau_games')
        .select(
          'id, event_id, team_a_id, team_b_id, score_a, score_b, round, bracket_name, scheduled_at, ' +
            'team_a:usau_teams!team_a_id(gender_division, competition_level), ' +
            'team_b:usau_teams!team_b_id(gender_division, competition_level)',
        )
        .in('event_id', batch)
        .eq('status', 'final')
        .order('event_id')
        .order('id'),
    );
    for (const g of rows) gamesByEvent.set(g.event_id, [...(gamesByEvent.get(g.event_id) ?? []), g]);
    process.stdout.write(`\r  final games: ${Math.min(i + EVENT_BATCH, ids.length)}/${ids.length} events`);
  }
  process.stdout.write('\n');

  const candidates = withTeams.filter((e) => (gamesByEvent.get(e.id) ?? []).some((g) => isBracketGame(g.bracket_name)));
  const plans: EventPlan[] = [];
  for (const e of candidates) {
    const input = gamesByEvent.get(e.id)!.map(toInput);
    const stored = storedByEvent.get(e.id)!;
    if (unsettled.has(e.id)) {
      const changes = storedConflicts(input, stored).map((teamId): Change => ({
        teamId,
        from: stored.get(teamId) ?? null,
        to: null,
        reason: 'clear-conflict',
      }));
      plans.push({ event: e, settled: false, changes, untrusted: [] });
    } else {
      const plan = planEventPlacements(input, stored, { clearUnsupported: true });
      const changes = [...plan.changes].map(([teamId, c]): Change => ({ teamId, ...c }));
      plans.push({ event: e, settled: true, changes, untrusted: plan.untrustedDivisions });
    }
  }

  const touched = plans
    .filter((p) => p.changes.length > 0)
    .sort(
      (a, b) =>
        (a.event.competition_level ?? '').localeCompare(b.event.competition_level ?? '') ||
        a.event.end_date.localeCompare(b.event.end_date) ||
        a.event.usau_slug.localeCompare(b.event.usau_slug),
    );
  const settledCount = candidates.filter((e) => !unsettled.has(e.id)).length;
  console.log(
    `  ${candidates.length} events with finished bracket games · ${settledCount} settled (re-derived) · ` +
      `${candidates.length - settledCount} with an unfinished bracket game (duplicates cleared only)`,
  );
  console.log(`  ${touched.length} events change · ${summary(touched)}`);
  const levels = [...new Set(touched.map((p) => p.event.competition_level ?? '?'))].sort();
  for (const lv of levels) {
    const ps = touched.filter((p) => (p.event.competition_level ?? '?') === lv);
    console.log(`    ${lv.padEnd(20)} ${String(ps.length).padStart(4)} events · ${summary(ps)}`);
  }
  const untrusted = plans.filter((p) => p.untrusted.length > 0);
  if (untrusted.length > 0) {
    console.log(`  derived places broke a division (left as stored, duplicates cleared): ${untrusted.map((p) => p.event.name).join('; ')}`);
  }

  if (touched.length === 0) {
    console.log('\nNothing to write.');
  } else {
    const chunks = chunk(touched);
    const [, version, name] = outMatch!;
    console.log(`\nWrote ${chunks.length} parts:`);
    chunks.forEach((c, i) => {
      const v = (BigInt(version) + BigInt(i * 100)).toString();
      const file = join(dirname(OUT!), `${v}_${name}_part${String(i + 1).padStart(2, '0')}.sql`);
      const sql = renderChunk(i + 1, chunks.length, c, touched);
      writeFileSync(resolve(process.cwd(), file), sql);
      console.log(`  ${file} · ${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB · ${c.length} events · ${summary(c)}`);
    });
    console.log(`\nBack up first:\n${BACKUP_SQL.join('\n')}`);
  }

  if (REPORT) {
    writeFileSync(
      resolve(process.cwd(), REPORT),
      JSON.stringify(
        touched.map((p) => ({
          id: p.event.id,
          slug: p.event.usau_slug,
          name: p.event.name,
          level: p.event.competition_level,
          season: p.event.season,
          endDate: p.event.end_date,
          settled: p.settled,
          untrusted: p.untrusted,
          changes: p.changes,
        })),
        null,
        1,
      ),
    );
    console.log(`Report: ${REPORT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
