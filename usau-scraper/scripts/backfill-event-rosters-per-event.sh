#!/usr/bin/env bash
# Per-EVENT roster backfill. Fills usau_rosters rows that are missing for a
# specific (event, team) pair.
#
# Why this exists alongside backfill-club-rosters.sh:
#   That script's unrostered_teams() skips any team that already has a roster
#   for the SEASON (any event). But usau_rosters is keyed
#   (team_id, season, event_id, player_id) — "USAU rosters are PER EVENT"
#   (sync-event-rosters/index.ts). So a team that played a summer invitational
#   AND a Sectional gets skipped, and its Sectional roster row is never written.
#   For 2018 Club that's 447 Series-playing teams skipped, ~1,107 missing pairs.
#
#   sync-event-rosters {slug} iterates EVERY participation at that event with a
#   resolved url_id and writes event-scoped rows. It has no team+season skip.
#   So driving it per event fills the real gap.
#
# Same WAF safety model as the other backfill scripts (they all hit USAU
# directly via the edge functions):
#   - GAP seconds between every call (default 20; vault says never below 12).
#   - HARD STOP on HTTP 403 (WAF block; retrying the same IP won't help).
#   - HARD STOP after MAX_CONSEC_FAIL consecutive non-403 failures.
#   - Idempotent: the worklist is read live from Postgres and only lists events
#     that still have missing pairs, so a re-run resumes.
#   - HTTP 000 (client timeout) is NOT counted as failure until the DB is
#     re-checked — edge functions commit after curl gives up.
#
# Usage:
#   ANON=<publishable key> YEAR=2018 ./backfill-event-rosters-per-event.sh
#   ANON=<key> YEAR=2018 GAP=25 ./backfill-event-rosters-per-event.sh
#   ANON=<key> YEAR=2018 DRY=1 ./backfill-event-rosters-per-event.sh

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST="https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"
ANON="${ANON:?set ANON to the project publishable key}"
YEAR="${YEAR:?set YEAR to a single season, e.g. 2018}"
GAP="${GAP:-20}"
MAX_CONSEC_FAIL="${MAX_CONSEC_FAIL:-3}"
DRY="${DRY:-0}"
LEVEL="${LEVEL:-CLUB}"

LOG="/tmp/per-event-rosters-${LEVEL}-${YEAR}-$(date +%Y%m%d-%H%M%S).log"
consec_fail=0
total_events=0
total_ok=0

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() {
  say "🛑 STOP: $*"
  say "Progress: events=$total_events ok=$total_ok"
  say "Log: $LOG"
  exit 1
}
pace() { sleep "$GAP"; }

say "=== PER-EVENT roster backfill — $LEVEL $YEAR ==="
say "gap=${GAP}s max_consec_fail=$MAX_CONSEC_FAIL dry=$DRY"
say "log=$LOG"

# Worklist: event slugs that still have >=1 participation which BOTH has a
# resolved url_id AND has no roster row for that exact event. Two filters that
# both matter:
#   - no url_id  -> nothing to fetch; resolve-event-team-urls must run first
#                   (as of 2018, 1,052 of 1,107 missing pairs are in this state)
#   - already rostered for THAT event -> nothing to do; calling anyway would
#                   re-walk a fully-rostered event and burn WAF budget
#
# Built by SQL, not PostgREST. PostgREST caps a response at 1000 rows and
# truncates silently (vault: "PostgREST 1000-row cap"); a season has >2000
# participations and ~72k roster rows, so assembling this client-side means
# paging two large tables and diffing them — slow, and wrong the moment a page
# is missed. One aggregate query answers it exactly.
#
# WORKLIST_FILE lets a caller supply the slug list directly (one slug per line),
# e.g. generated from the same SQL via the Supabase MCP/SQL editor.
WORKLIST=$(mktemp)
if [ -n "${WORKLIST_FILE:-}" ]; then
  [ -f "$WORKLIST_FILE" ] || die "WORKLIST_FILE '$WORKLIST_FILE' not found"
  grep -v '^[[:space:]]*$' "$WORKLIST_FILE" > "$WORKLIST"
  say "worklist supplied: $WORKLIST_FILE"
else
  [ -n "${PGURL:-}" ] || die "set WORKLIST_FILE=<file of slugs>, or PGURL=<postgres connection string> so the worklist can be built by SQL"
  psql "$PGURL" -At -v ON_ERROR_STOP=1 -c "
    select e.usau_slug
    from usau_events e
    join usau_event_teams et on et.event_id = e.id
    where e.competition_level::text = '$LEVEL'
      and e.season = $YEAR
      and et.usau_event_team_url_id is not null
      and not exists (
        select 1 from usau_rosters r
        where r.event_id = et.event_id and r.team_id = et.team_id
      )
    group by e.usau_slug, e.start_date
    order by e.start_date asc;
  " > "$WORKLIST" || die "worklist query failed"
fi

EVENT_COUNT=$(grep -c . "$WORKLIST" || true)
say "events with resolved urls in $YEAR: $EVENT_COUNT"

while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  total_events=$((total_events+1))
  say "── ($total_events/$EVENT_COUNT) $slug ──"

  if [ "$DRY" = "1" ]; then
    say "   DRY: would call sync-event-rosters {slug}"
    continue
  fi

  out=$(curl -s -w $'\n%{http_code}' --max-time 170 -X POST "$BASE/sync-event-rosters" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"slug\":\"$slug\"}")
  code=$(echo "$out" | tail -1)
  body=$(echo "$out" | sed '$d')

  if [ "$code" = "403" ]; then die "403 on $slug (WAF block)"; fi

  if [ "$code" = "200" ]; then
    consec_fail=0
    total_ok=$((total_ok+1))
    players=$(echo "$body" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    rs = d.get("results") or []
    print(sum((r or {}).get("rosterSize", 0) for r in rs))
except Exception:
    print("?")
' 2>/dev/null)
    say "   ✓ $slug → players=$players"
  elif [ "$code" = "000" ]; then
    # Client timed out; the edge fn may have committed anyway. Not a failure
    # until proven otherwise (vault: HTTP 000 false failures cost a whole run).
    say "   ~ $slug HTTP 000 (client timeout; fn may have finished) — not counted"
  else
    consec_fail=$((consec_fail+1))
    say "   ✗ $slug HTTP $code (consec_fail=$consec_fail)"
    [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
  fi
  pace
done < "$WORKLIST"

rm -f "$WORKLIST"
say "=== DONE $LEVEL $YEAR ==="
say "events=$total_events ok=$total_ok"
say "Log: $LOG"
