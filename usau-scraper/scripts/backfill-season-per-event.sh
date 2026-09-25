#!/usr/bin/env bash
# PRIMARY roster backfill: per-EVENT, one season per run.
#
# Hunter's rule (2026-09-14): rosters are scraped PER EVENT. The app should only
# show the events a player actually competed in according to USAU, so a roster
# row must be tied to the event it was scraped from. usau_rosters is keyed
# (team_id, season, event_id, player_id) for exactly this reason.
#
# DO NOT use backfill-club-rosters.sh for this. Its unrostered_teams() skips any
# team that already has a roster for the SEASON (any event), so a team that
# played a summer invitational AND a Sectional never gets its Sectional roster
# written. For 2018 Club that skipped 447 Series-playing teams.
#
# Two stages per season, in this order (the order matters):
#   1. RESOLVE  — resolve-event-team-urls per event that still has participations
#                 with a null usau_event_team_url_id. Without a url_id there is
#                 nothing to fetch, and across every season the overwhelming
#                 majority of missing pairs are in this state (2018: 1052/1107,
#                 2016: 287/287, 2014: 334/335).
#   2. ROSTERS  — sync-event-rosters {slug} per event that has >=1 participation
#                 with a resolved url_id and no roster row for THAT event. That
#                 function walks every such participation and has no team+season
#                 skip, so it fills the per-event gap.
#
# WAF safety (same model as the other backfill scripts — these hit USAU via the
# edge functions, and USAU has tarpitted our Deno egress IP before):
#   - GAP seconds between every call (default 20; vault says never below 12).
#   - HARD STOP on HTTP 403 (WAF block; retrying the same IP will not help).
#   - HARD STOP after MAX_CONSEC_FAIL consecutive non-403 failures.
#   - HTTP 000 is NOT counted as a failure: the edge fn commits after curl gives
#     up (vault: "HTTP 000 false failures" cost a whole run once).
#   - Idempotent: both worklists are read live, so a re-run resumes.
#   - Run ONE season at a time. Two concurrent runs double the request rate.
#
# Worklists are built by SQL, not PostgREST: PostgREST caps a response at 1000
# rows and truncates silently, and a season has >2000 participations.
#
# Usage:
#   PGURL=<postgres url> YEAR=2018 ./backfill-season-per-event.sh
#   PGURL=... YEAR=2018 LEVEL=CLUB GAP=25 ./backfill-season-per-event.sh
#   PGURL=... YEAR=2018 DRY=1 ./backfill-season-per-event.sh
#   PGURL=... YEAR=2018 STAGE=rosters ./backfill-season-per-event.sh   # skip resolve

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
ANON="${ANON:?set ANON to the project publishable key}"
YEAR="${YEAR:?set YEAR to a single season, e.g. 2018}"
# Worklists come from SQL. Either supply them as files (one slug per line) —
# generate them with the queries in the STAGE comments below, via the Supabase
# SQL editor or MCP — or set PGURL and let psql build them here. Files are the
# default path because psql isn't installed on this machine.
#
# DO NOT try to assemble a worklist client-side from two PostgREST pulls and a
# set-difference in the client. Tried 2026-09-14 and it silently produced an
# EMPTY stage-2 worklist while SQL said 79 events: the participations pull and
# the usau_rosters pull each hit the 1000-row cap and page independently, and
# the rosters pull isn't level-scoped, so the exclusion set doesn't line up with
# the pairs set. The whole stage no-opped without erroring. One aggregate query
# answers it exactly; use it.
RESOLVE_WORKLIST="${RESOLVE_WORKLIST:-}"
ROSTER_WORKLIST="${ROSTER_WORKLIST:-}"
PGURL="${PGURL:-}"
LEVEL="${LEVEL:-CLUB}"
GAP="${GAP:-20}"
MAX_CONSEC_FAIL="${MAX_CONSEC_FAIL:-3}"
MAX_CONSEC_000="${MAX_CONSEC_000:-5}"
DRY="${DRY:-0}"
STAGE="${STAGE:-both}"   # both | resolve | rosters

LOG="/tmp/per-event-${LEVEL}-${YEAR}-$(date +%Y%m%d-%H%M%S).log"
consec_fail=0
consec_000=0
resolve_ok=0
roster_ok=0

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() {
  say "🛑 STOP: $*"
  say "Progress: resolve_ok=$resolve_ok roster_ok=$roster_ok"
  say "Log: $LOG"
  exit 1
}
pace() { sleep "$GAP"; }

sql() {
  [ -n "$PGURL" ] || return 1
  psql "$PGURL" -At -v ON_ERROR_STOP=1 -c "$1"
}

# Returns the count of (event,team) pairs still missing an event-scoped roster.
# Only available when PGURL is set; with file worklists the operator reads the
# before/after numbers from SQL directly.
gap_now() {
  sql "select count(*)
       from usau_event_teams et join usau_events e on e.id = et.event_id
       where e.competition_level::text = '$LEVEL' and e.season = $YEAR
         and not exists (select 1 from usau_rosters r
                         where r.event_id = et.event_id and r.team_id = et.team_id);" 2>/dev/null || echo "n/a"
}

# One POST. Echoes the http code on stderr, body on stdout.
call() {
  local fn="$1" body="$2" out code
  out=$(curl -s -w $'\n%{http_code}' --max-time 170 -X POST "$BASE/$fn" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" -d "$body")
  code=$(echo "$out" | tail -1)
  echo "$out" | sed '$d'
  echo "$code" >&2
}

handle_code() {
  # $1 = http code, $2 = label. Returns 0 to count as success, 1 to skip.
  case "$1" in
    200) consec_fail=0; consec_000=0; return 0 ;;
    403) die "403 on $2 (WAF block)" ;;
    # One 000 is a client timeout the fn may have survived; a RUN of them is
    # a dead network or a sleeping Mac (2026-09-17: 15 h of 000s, nothing
    # committed). Stop so the operator rebuilds the worklist and relaunches.
    000) consec_000=$((consec_000+1))
         say "   ~ $2 HTTP 000 (client timeout; fn may have committed) — not counted (consec_000=$consec_000)"
         [ "$consec_000" -ge "$MAX_CONSEC_000" ] && die "$MAX_CONSEC_000 consecutive timeouts — network down or machine asleep"
         return 1 ;;
    *)   consec_fail=$((consec_fail+1))
         say "   ✗ $2 HTTP $1 (consec_fail=$consec_fail)"
         [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
         return 1 ;;
  esac
}

say "=== PER-EVENT backfill — $LEVEL $YEAR ==="
say "stage=$STAGE gap=${GAP}s max_consec_fail=$MAX_CONSEC_FAIL dry=$DRY"
START_GAP=$(gap_now)
say "pairs missing an event-scoped roster at start: $START_GAP"

# ── STAGE 1: RESOLVE ────────────────────────────────────────────────────────
if [ "$STAGE" = "both" ] || [ "$STAGE" = "resolve" ]; then
  # Worklist query (run this to regenerate RESOLVE_WORKLIST):
  #   select e.usau_slug
  #   from usau_events e join usau_event_teams et on et.event_id = e.id
  #   where e.competition_level::text = '<LEVEL>' and e.season = <YEAR>
  #     and et.usau_event_team_url_id is null
  #     and exists (select 1 from usau_games g where g.event_id = e.id)
  #   group by e.usau_slug, e.start_date order by e.start_date asc;
  RWORK=$(mktemp)
  if [ -n "$RESOLVE_WORKLIST" ]; then
    [ -f "$RESOLVE_WORKLIST" ] || die "RESOLVE_WORKLIST '$RESOLVE_WORKLIST' not found"
    grep -v '^[[:space:]]*$' "$RESOLVE_WORKLIST" > "$RWORK"
  else
    sql "select e.usau_slug
         from usau_events e join usau_event_teams et on et.event_id = e.id
         where e.competition_level::text = '$LEVEL' and e.season = $YEAR
           and et.usau_event_team_url_id is null
           and exists (select 1 from usau_games g where g.event_id = e.id)
         group by e.usau_slug, e.start_date
         order by e.start_date asc;" > "$RWORK" \
      || die "no RESOLVE_WORKLIST file and no working PGURL — cannot build stage-1 worklist"
  fi
  RCOUNT=$(grep -c . "$RWORK" || true)
  say "── STAGE 1: resolve — $RCOUNT events with unresolved urls ──"

  i=0
  while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    i=$((i+1))
    if [ "$DRY" = "1" ]; then say "   DRY resolve ($i/$RCOUNT) $slug"; continue; fi
    body=$(call resolve-event-team-urls "{\"slug\":\"$slug\"}" 2>/tmp/.code_$$); code=$(cat /tmp/.code_$$)
    if handle_code "$code" "resolve $slug"; then
      n=$(echo "$body" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("resolvedTotal",0))
except Exception: print(0)' 2>/dev/null)
      resolve_ok=$((resolve_ok+1))
      say "   ✓ ($i/$RCOUNT) $slug → resolved=$n"
    fi
    pace
  done < "$RWORK"
  rm -f "$RWORK"
  say "── STAGE 1 done: $resolve_ok events resolved ──"
fi

# ── STAGE 2: PER-EVENT ROSTERS ──────────────────────────────────────────────
if [ "$STAGE" = "both" ] || [ "$STAGE" = "rosters" ]; then
  # Worklist query (run this to regenerate ROSTER_WORKLIST — re-run it AFTER
  # stage 1, since resolving urls adds events to this list):
  #   select e.usau_slug
  #   from usau_events e join usau_event_teams et on et.event_id = e.id
  #   where e.competition_level::text = '<LEVEL>' and e.season = <YEAR>
  #     and et.usau_event_team_url_id is not null
  #     and not exists (select 1 from usau_rosters r
  #                     where r.event_id = et.event_id and r.team_id = et.team_id)
  #   group by e.usau_slug, e.start_date order by e.start_date asc;
  SWORK=$(mktemp)
  if [ -n "$ROSTER_WORKLIST" ]; then
    [ -f "$ROSTER_WORKLIST" ] || die "ROSTER_WORKLIST '$ROSTER_WORKLIST' not found"
    grep -v '^[[:space:]]*$' "$ROSTER_WORKLIST" > "$SWORK"
  else
    sql "select e.usau_slug
         from usau_events e join usau_event_teams et on et.event_id = e.id
         where e.competition_level::text = '$LEVEL' and e.season = $YEAR
           and et.usau_event_team_url_id is not null
           and not exists (select 1 from usau_rosters r
                           where r.event_id = et.event_id and r.team_id = et.team_id)
         group by e.usau_slug, e.start_date
         order by e.start_date asc;" > "$SWORK" \
      || die "no ROSTER_WORKLIST file and no working PGURL — cannot build stage-2 worklist"
  fi
  SCOUNT=$(grep -c . "$SWORK" || true)
  say "── STAGE 2: per-event rosters — $SCOUNT events with fetchable missing pairs ──"

  i=0
  while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    i=$((i+1))
    if [ "$DRY" = "1" ]; then say "   DRY rosters ($i/$SCOUNT) $slug"; continue; fi
    body=$(call sync-event-rosters "{\"slug\":\"$slug\"}" 2>/tmp/.code_$$); code=$(cat /tmp/.code_$$)
    if handle_code "$code" "rosters $slug"; then
      # sync-event-rosters returns { ok, rowsProcessed, slug, teams, players,
      # resolvedUrlIds, stats, perTeam[] } — the withRunLogging wrapper spreads
      # `result` into the top level. Read result.players (NOT results[].rosterSize:
      # that key doesn't exist and silently logged players=0 on every event while
      # the DB was in fact filling up).
      p=$(echo "$body" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get("players", d.get("result",{}).get("players","?")))
except Exception: print("?")' 2>/dev/null)
      roster_ok=$((roster_ok+1))
      say "   ✓ ($i/$SCOUNT) $slug → players=$p"
    fi
    pace
  done < "$SWORK"
  rm -f "$SWORK"
  say "── STAGE 2 done: $roster_ok events scraped ──"
fi

rm -f /tmp/.code_$$
END_GAP=$(gap_now)
say "=== DONE $LEVEL $YEAR ==="
# gap_now() returns "n/a" when PGURL isn't set (file-worklist mode), so only do
# the arithmetic when both readings are actually numeric.
if [[ "$START_GAP" =~ ^[0-9]+$ ]] && [[ "$END_GAP" =~ ^[0-9]+$ ]]; then
  say "pairs missing: $START_GAP → $END_GAP (closed $((START_GAP - END_GAP)))"
else
  say "pairs missing: $START_GAP → $END_GAP (set PGURL for a closed-count, or check via SQL)"
fi
say "resolve_ok=$resolve_ok roster_ok=$roster_ok"
say "Log: $LOG"
