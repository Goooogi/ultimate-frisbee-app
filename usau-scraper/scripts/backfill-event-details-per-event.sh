#!/usr/bin/env bash
# Stage 0 of the College series backfill: teams + games per event.
#
# College Conferences / Regionals rows exist in usau_events (calendar
# discovery) but were never detail-scraped: as of 2026-09-17 every 2024-2026
# Conferences event had zero teams and zero games, so the per-event roster
# stages (backfill-season-per-event.sh) have nothing to walk. This drives
# sync-event-details {slug} over a slug list; it fetches the schedule page
# (college pages use the compact "CollegeMen" path — the function tries the
# whole family) and upserts usau_event_teams + usau_games. Run it BEFORE
# resolve-event-team-urls / sync-event-rosters for the same events.
#
# Same WAF safety model as the other backfill scripts:
#   - GAP seconds between every call (default 20; vault says never below 12).
#   - HARD STOP on HTTP 403 (WAF block; retrying the same IP will not help).
#   - HARD STOP after MAX_CONSEC_FAIL consecutive non-403 failures.
#   - HTTP 000 / 504 / 546 are NOT counted as failures: the edge fn commits
#     after the client gives up (vault: "HTTP 000 false failures").
#   - Idempotent: sync-event-details upserts, so a re-run is safe. Rebuild the
#     worklist from SQL (events with zero teams) to resume.
#
# The worklist is a file of slugs, one per line, built with SQL (PostgREST caps
# a response at 1000 rows and truncates silently):
#   select e.usau_slug from usau_events e
#   where e.competition_level::text in ('COLLEGE_D1','COLLEGE_D3')
#     and e.series_stage in ('college-conferences','college-regionals')
#     and e.season = <YEAR>
#     and not exists (select 1 from usau_event_teams t where t.event_id = e.id)
#   order by e.start_date, e.usau_slug;
#
# Usage:
#   ANON=<publishable key> YEAR=2026 WORKLIST_FILE=/tmp/college-2026-details.txt \
#     ./backfill-event-details-per-event.sh
#   ... DRY=1 to plan only.

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
ANON="${ANON:?set ANON to the project publishable key}"
YEAR="${YEAR:?set YEAR to a single season, e.g. 2026}"
WORKLIST_FILE="${WORKLIST_FILE:?set WORKLIST_FILE to a file of event slugs}"
GAP="${GAP:-20}"
MAX_CONSEC_FAIL="${MAX_CONSEC_FAIL:-3}"
MAX_CONSEC_000="${MAX_CONSEC_000:-5}"
DRY="${DRY:-0}"

LOG="/tmp/per-event-details-COLLEGE-${YEAR}-$(date +%Y%m%d-%H%M%S).log"
consec_fail=0
consec_000=0
total=0
ok=0

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() {
  say "🛑 STOP: $*"
  say "Progress: events=$total ok=$ok"
  say "Log: $LOG"
  exit 1
}
pace() { sleep "$GAP"; }

[ -f "$WORKLIST_FILE" ] || die "WORKLIST_FILE '$WORKLIST_FILE' not found"
WORKLIST=$(mktemp)
grep -v '^[[:space:]]*$' "$WORKLIST_FILE" > "$WORKLIST"
COUNT=$(grep -c . "$WORKLIST" || true)

# Slug case varies (college "Big-Sky-D-I-Mens-…", club "2025-capital-mens-…"),
# so the division case below must match either.
shopt -s nocasematch

say "=== PER-EVENT details backfill — COLLEGE $YEAR ==="
say "events=$COUNT gap=${GAP}s max_consec_fail=$MAX_CONSEC_FAIL dry=$DRY"
say "log=$LOG"

while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  total=$((total+1))
  if [ "$DRY" = "1" ]; then say "   DRY ($total/$COUNT) $slug"; continue; fi

  # Series events are ONE division each, and the slug names it. Without the
  # filter the fn probes all three genders, and every absent one costs two URL
  # variants × 4 attempts (fetchHtml retries a 404 three times with backoff) at
  # a 5 s throttle — ~120 s of 404s per event (measured 2026-09-17: 86-117 s
  # per event; ~10 s with the filter). Slugs naming no gender get all three.
  case "$slug" in
    *-Mens-*|*-Men-*)      divs='["Men"]' ;;
    *-Womens-*|*-Women-*)  divs='["Women"]' ;;
    *-Mixed-*)             divs='["Mixed"]' ;;
    *)                     divs='["Men","Women","Mixed"]' ;;
  esac
  out=$(curl -s -w $'\n%{http_code}' --max-time 170 -X POST "$BASE/sync-event-details" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d "{\"slug\":\"$slug\",\"divisions\":$divs}")
  code=$(echo "$out" | tail -1)
  body=$(echo "$out" | sed '$d')

  case "$code" in
    403) die "403 on $slug (WAF block)" ;;
    200)
      consec_fail=0; consec_000=0; ok=$((ok+1))
      summary=$(echo "$body" | python3 -c '
import sys, json
try:
    # { ok, slug, eventID, perDivision: { Men: {teams, games, skipped}, ... } }
    d = json.load(sys.stdin)
    pd = d.get("perDivision") or d.get("result", {}).get("perDivision", {})
    played = {k: v for k, v in pd.items() if not v.get("skipped")}
    teams = sum(v.get("teams", 0) for v in played.values())
    games = sum(v.get("games", 0) for v in played.values())
    print("teams=%d games=%d divisions=%s" % (teams, games, ",".join(played) or "none"))
except Exception:
    print("?")
' 2>/dev/null)
      say "   ✓ ($total/$COUNT) $slug → $summary" ;;
    000|504|546)
      # Not a failure on its own (the fn often commits after the client gives
      # up) — but a RUN of them means the network is gone or the Mac is asleep:
      # 2026-09-17 the laptop lid closed and the run spent 15 h returning 000
      # on every wake-up, committing nothing. Stop so the operator relaunches.
      consec_000=$((consec_000+1))
      say "   ~ ($total/$COUNT) $slug HTTP $code (timeout; fn may have committed) — not counted (consec_000=$consec_000)"
      [ "$consec_000" -ge "$MAX_CONSEC_000" ] && die "$MAX_CONSEC_000 consecutive timeouts — network down or machine asleep; rebuild the worklist and relaunch" ;;
    *)
      consec_fail=$((consec_fail+1))
      say "   ✗ ($total/$COUNT) $slug HTTP $code (consec_fail=$consec_fail): $(echo "$body" | head -c 200)"
      [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures" ;;
  esac
  pace
done < "$WORKLIST"

rm -f "$WORKLIST"
say "=== DONE COLLEGE $YEAR details ==="
say "events=$total ok=$ok"
say "Log: $LOG"
