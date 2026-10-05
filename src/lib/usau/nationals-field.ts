// USAU Club Nationals projected field — each division's 16 bids split across
// the 8 regions, and the teams that took them at their Regional Championship.
//
// Pure: no supabase import — getNationalsField in ./data queries the rows and
// hands them here. Mobile is the origin (modelled on its ./series split); the
// web app mirrors this file verbatim as src/lib/usau/nationals-field.ts, so
// every name stays identical across the two repos and the file stays
// import-free (web keeps its series block in data.ts, not ./series).

/** USA Ultimate's 8 club regions, in display order. Ranking rows outside them
 *  ("International (non series eligible)", null) earn no bids. */
export const USAU_CLUB_REGIONS = [
  'Great Lakes',
  'Mid-Atlantic',
  'North Central',
  'Northeast',
  'Northwest',
  'South Central',
  'Southeast',
  'Southwest',
] as const;

export type UsauClubRegion = (typeof USAU_CLUB_REGIONS)[number];

/** Club divisions, in SERIES_DIVISION_ORDER. */
export const NATIONALS_DIVISIONS = ['Men', 'Women', 'Mixed'] as const;

export type NationalsDivision = (typeof NATIONALS_DIVISIONS)[number];

/** Teams per division at Club Nationals: one automatic bid per region plus
 *  eight strength bids. */
export const NATIONALS_FIELD_SIZE = 16;

/** A usau_rankings row of the snapshot the bids come from. */
export interface NationalsRankingRow {
  rank: number;
  region: string | null;
  team_name: string;
}

/** One division's Final Regular Season Rankings: the usau_rankings week
 *  getNationalsField picked, and every row of it. */
export interface NationalsRankingSnapshot {
  division: NationalsDivision;
  week: number;
  rows: NationalsRankingRow[];
}

/** A season's club-regionals usau_events row — one per region and division. */
export interface NationalsRegionalEventRow {
  id: string;
  series_division: string | null;
  /** "2026 Great Lakes Club Regional Championship" — the region is read from
   *  here; usau_slug spells it inconsistently. */
  series_group_name: string | null;
  series_group_key: string | null;
}

/** A placed usau_event_teams row at a Regional, with its team's name. */
export interface NationalsEntrantRow {
  event_id: string;
  team_id: string;
  final_placement: number | null;
  usau_teams: { name: string } | null;
}

/** championsForEvents' champions (./data), keyed by event id. */
export type NationalsChampions = ReadonlyMap<
  string,
  ReadonlyArray<{ division: string; teamId: string; teamName: string; viaPoolRecord?: boolean }>
>;

export interface NationalsQualifier {
  teamId: string;
  teamName: string;
  /** Finish at the Regional (1 = champion); tied teams share a place. */
  regionalPlace: number;
  /** Final regular-season rank in the snapshot the bids came from; null when
   *  unranked. */
  rank: number | null;
}

export interface NationalsFieldRegion {
  region: UsauClubRegion;
  bids: number;
  /** Teams holding this region's bids, in finish order. Fewer than `bids`
   *  while a qualifying place is unknown (unplayed, not derived, or a tie
   *  across the last bid) — the remainder is pending. */
  qualifiers: NationalsQualifier[];
  /** The merged Regional's series_group_key — the event-screen slug. Add
   *  `?div=${division.toLowerCase()}` to open it on this division (mobile:
   *  UsauSeriesStageList's eventHref). Null when the season has no row for
   *  this Regional. */
  eventSlug: string | null;
}

export interface NationalsFieldDivision {
  division: NationalsDivision;
  /** usau_rankings.week the bids came from — per division, since the rank
   *  sets don't always land on the same week. */
  rankingsWeek: number;
  /** All 8 regions, in USAU_CLUB_REGIONS order. */
  regions: NationalsFieldRegion[];
  qualifiedCount: number;
  /** Sum of the regions' bids (NATIONALS_FIELD_SIZE). */
  fieldSize: number;
}

export interface NationalsField {
  season: number;
  /** In NATIONALS_DIVISIONS order; a division with no rankings snapshot
   *  before Regionals is left out. */
  divisions: NationalsFieldDivision[];
}

/**
 * Bids per region from one division's snapshot, by USA Ultimate's rule: every
 * region gets 1 automatic bid, then "strength bids are awarded to regions with
 * the next highest ranked team, where next describes one more bid than the
 * region has already been awarded". Walking the ranking, each region's top
 * team stands for its automatic bid and each of the next 8 teams earns its
 * region one more.
 */
export function allocateBids(
  rows: ReadonlyArray<Pick<NationalsRankingRow, 'rank' | 'region'>>,
): Record<UsauClubRegion, number> {
  const bids = Object.fromEntries(USAU_CLUB_REGIONS.map((r) => [r, 1])) as Record<UsauClubRegion, number>;
  const seen = new Set<UsauClubRegion>();
  let strength = NATIONALS_FIELD_SIZE - USAU_CLUB_REGIONS.length;
  for (const row of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (strength === 0) break;
    const region = USAU_CLUB_REGIONS.find((r) => r === row.region);
    if (!region) continue;
    if (!seen.has(region)) {
      seen.add(region);
      continue;
    }
    bids[region] += 1;
    strength -= 1;
  }
  return bids;
}

function regionOf(groupName: string | null): UsauClubRegion | null {
  const n = (groupName ?? '').toLowerCase();
  return USAU_CLUB_REGIONS.find((r) => n.includes(r.toLowerCase())) ?? null;
}

/**
 * One Regional's qualifiers: its entrants placed 1..bids, in finish order.
 * final_placement is derived upstream and can be missing or tied, and nothing
 * is guessed — a missing place leaves its slot empty, and so does a tie across
 * the last bid. Only place 1 has a second source: the bracket champion, used
 * when no entrant holds 1st.
 */
function regionQualifiers(
  entrants: NationalsEntrantRow[],
  bids: number,
  champion: { teamId: string; teamName: string } | null,
  rankOf: (teamName: string) => number | null,
): NationalsQualifier[] {
  const byPlace = new Map<number, Array<{ teamId: string; teamName: string }>>();
  for (const e of entrants) {
    if (e.final_placement == null) continue;
    const list = byPlace.get(e.final_placement) ?? [];
    list.push({ teamId: e.team_id, teamName: e.usau_teams?.name ?? 'Unknown' });
    byPlace.set(e.final_placement, list);
  }
  // A champion already placed elsewhere contradicts the placements; a pending
  // slot beats listing one team twice. Name as well as id: duplicate-team churn.
  const championPlaced =
    champion != null &&
    entrants.some(
      (e) =>
        e.final_placement != null &&
        (e.team_id === champion.teamId ||
          e.usau_teams?.name.toLowerCase() === champion.teamName.toLowerCase()),
    );
  if (champion && !byPlace.has(1) && !championPlaced) {
    byPlace.set(1, [{ teamId: champion.teamId, teamName: champion.teamName }]);
  }

  const out: NationalsQualifier[] = [];
  for (const place of [...byPlace.keys()].sort((a, b) => a - b)) {
    const teams = byPlace.get(place)!;
    // n teams tied at `place` fill places place..place+n-1.
    if (place + teams.length - 1 > bids) break;
    for (const t of teams) {
      out.push({ teamId: t.teamId, teamName: t.teamName, regionalPlace: place, rank: rankOf(t.teamName) });
    }
  }
  return out;
}

/**
 * The field from already-fetched rows: bids from each division's snapshot,
 * each region's Regional found by series_group_name, its qualifiers from
 * final_placement (place 1 falling back to a bracket-decided champion — a pool
 * leader is not a Regional result, so `viaPoolRecord` champions are ignored),
 * and each qualifier's rank from the same snapshot by division + lowercased
 * team name. Not by usau_rankings.team_id: it often points at a different
 * usau_teams row for the same team (see bestOfficialRankByEvent in ./data).
 * Null when no division has a snapshot.
 */
export function buildNationalsField(input: {
  season: number;
  snapshots: NationalsRankingSnapshot[];
  events: NationalsRegionalEventRow[];
  entrants: NationalsEntrantRow[];
  champions: NationalsChampions;
}): NationalsField | null {
  const eventByKey = new Map<string, NationalsRegionalEventRow>();
  for (const e of input.events) {
    const region = regionOf(e.series_group_name);
    if (region && e.series_division) eventByKey.set(`${e.series_division}|${region}`, e);
  }
  const entrantsByEvent = new Map<string, NationalsEntrantRow[]>();
  for (const t of input.entrants) {
    const list = entrantsByEvent.get(t.event_id);
    if (list) list.push(t);
    else entrantsByEvent.set(t.event_id, [t]);
  }

  const divisions: NationalsFieldDivision[] = [];
  for (const division of NATIONALS_DIVISIONS) {
    const snapshot = input.snapshots.find((s) => s.division === division);
    if (!snapshot) continue;
    const bids = allocateBids(snapshot.rows);
    const rankByName = new Map<string, number>();
    for (const r of snapshot.rows) {
      const key = r.team_name.toLowerCase();
      const prev = rankByName.get(key);
      if (prev === undefined || r.rank < prev) rankByName.set(key, r.rank);
    }
    const rankOf = (teamName: string) => rankByName.get(teamName.toLowerCase()) ?? null;

    const regions = USAU_CLUB_REGIONS.map((region): NationalsFieldRegion => {
      const event = eventByKey.get(`${division}|${region}`);
      if (!event) return { region, bids: bids[region], qualifiers: [], eventSlug: null };
      const champion =
        input.champions.get(event.id)?.find((c) => c.division === division && !c.viaPoolRecord) ?? null;
      return {
        region,
        bids: bids[region],
        qualifiers: regionQualifiers(entrantsByEvent.get(event.id) ?? [], bids[region], champion, rankOf),
        eventSlug: event.series_group_key,
      };
    });
    divisions.push({
      division,
      rankingsWeek: snapshot.week,
      regions,
      qualifiedCount: regions.reduce((n, r) => n + r.qualifiers.length, 0),
      fieldSize: regions.reduce((n, r) => n + r.bids, 0),
    });
  }
  return divisions.length > 0 ? { season: input.season, divisions } : null;
}
