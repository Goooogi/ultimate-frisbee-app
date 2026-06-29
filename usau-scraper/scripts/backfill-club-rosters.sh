#!/usr/bin/env bash
# Backfill USAU CLUB rosters for ONE season, slow & serial, operator-safe.
#
# Adapted from backfill-college-rosters.sh. Same safety model — this hits USA
# Ultimate DIRECTLY (resolve-event-team-urls + sync-event-rosters both scrape
# play.usaultimate.org), so it is subject to the WAF that has tarpitted our
# Deno egress IP before. Therefore:
#   - GAP seconds between EVERY http call (default 10s).
#   - HARD STOP on any HTTP 403 (WAF block — same IP won't recover by retrying).
#   - HARD STOP after MAX_CONSEC_FAIL consecutive non-403 failures.
#   - Idempotent: skips teams already rostered for the season, so re-runs resume.
#
# Unlike the college script, CLUB events from the ultirzr ingest have NO resolved
# team URLs yet (usau_event_team_url_id is null for all). So per event we:
#   1. resolve-event-team-urls (1 USAU fetch per gender schedule page)
#   2. sync-event-rosters per still-unrostered team (1 USAU fetch each)
#
# Usage:
#   ANON=<key> YEAR=2019 ./backfill-club-rosters.sh
#   ANON=<key> YEAR=2019 GAP=15 ./backfill-club-rosters.sh   # gentler
#   ANON=<key> YEAR=2019 DRY=1 ./backfill-club-rosters.sh    # plan only

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST="https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"
ANON="${ANON:?set ANON to the project anon key}"
YEAR="${YEAR:?set YEAR to a single season, e.g. 2019}"
GAP="${GAP:-10}"
MAX_CONSEC_FAIL="${MAX_CONSEC_FAIL:-2}"
DRY="${DRY:-0}"

LOG="/tmp/club-roster-backfill-${YEAR}-$(date +%Y%m%d-%H%M%S).log"
consec_fail=0
total_teams=0
total_players=0
total_events=0

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() {
  say "🛑 STOP: $*"
  say "Progress (year=$YEAR): events=$total_events teams_scraped=$total_teams players=$total_players"
  say "Log: $LOG"
  exit 1
}
pace() { sleep "$GAP"; }

# CLUB events for the season that actually HAVE games (skip empty shells).
fetch_events() {
  curl -s "$REST/usau_events?select=usau_slug,start_date,usau_games!inner(id)&competition_level=eq.CLUB&season=eq.$YEAR&order=start_date.asc&usau_games.limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json
seen=set(); out=[]
for e in json.load(sys.stdin):
    if not e.get("usau_games"): continue
    s=e["usau_slug"]
    if s in seen: continue
    seen.add(s); out.append(s)
print(json.dumps(out))'
}

# team_ids for an event that have a resolved URL but NO roster for the season.
unrostered_teams() {
  local slug="$1"
  local eid
  eid=$(curl -s "$REST/usau_events?select=id&usau_slug=eq.$slug" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
  [ -z "$eid" ] && return 0
  local resolved
  resolved=$(curl -s "$REST/usau_event_teams?select=team_id&event_id=eq.$eid&usau_event_team_url_id=not.is.null" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json; [print(r["team_id"]) for r in json.load(sys.stdin)]')
  [ -z "$resolved" ] && return 0
  local idlist done
  idlist=$(echo "$resolved" | sort -u | paste -sd, -)
  done=$(curl -s "$REST/usau_rosters?select=team_id&season=eq.$YEAR&team_id=in.($idlist)" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json; [print(r["team_id"]) for r in json.load(sys.stdin)]' | sort -u)
  comm -23 <(echo "$resolved" | sort -u) <(echo "$done")
}

call() {
  local fn="$1" body="$2"
  local out code
  out=$(curl -s -w $'\n%{http_code}' --max-time 160 -X POST "$BASE/$fn" \
    -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
    -d "$body")
  code=$(echo "$out" | tail -1)
  echo "$out" | sed '$d'
  echo "$code" >&2
}

say "=== CLUB roster backfill — season $YEAR ==="
say "gap=${GAP}s max_consec_fail=$MAX_CONSEC_FAIL dry=$DRY log=$LOG"

EVENTS_JSON=$(fetch_events)
EVENT_COUNT=$(echo "$EVENTS_JSON" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')
say "Club events with games in $YEAR: $EVENT_COUNT"

WORKLIST=$(mktemp)
echo "$EVENTS_JSON" | python3 -c 'import sys,json
for s in json.load(sys.stdin): print(s)' > "$WORKLIST"

while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  total_events=$((total_events+1))
  say "── ($total_events/$EVENT_COUNT) $slug ──"

  if [ "$DRY" = "1" ]; then
    say "   DRY: would resolve URLs, then scrape unrostered teams"
    continue
  fi

  # 1) resolve team URLs for this event
  rout=$(call resolve-event-team-urls "{\"slug\":\"$slug\"}" 2>/tmp/code); rcode=$(cat /tmp/code)
  if [ "$rcode" = "403" ]; then die "403 on resolve for $slug (WAF block)"; fi
  if [ "$rcode" != "200" ]; then
    consec_fail=$((consec_fail+1)); say "   resolve HTTP $rcode (consec_fail=$consec_fail)"
    [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
    pace; continue
  fi
  consec_fail=0
  say "   resolved URLs ok"
  pace

  # 2) scrape each still-unrostered team
  teams="$(unrostered_teams "$slug")"
  team_count=$(printf '%s\n' "$teams" | grep -c . || true)
  say "   teams to scrape: $team_count"
  for tid in $teams; do
    [ -z "$tid" ] && continue
    sout=$(call sync-event-rosters "{\"slug\":\"$slug\",\"teamId\":\"$tid\"}" 2>/tmp/code); scode=$(cat /tmp/code)
    if [ "$scode" = "000" ]; then
      say "      team $tid HTTP 000 (client timeout; fn may have finished) — retry once"
      pace
      sout=$(call sync-event-rosters "{\"slug\":\"$slug\",\"teamId\":\"$tid\"}" 2>/tmp/code); scode=$(cat /tmp/code)
    fi
    if [ "$scode" = "403" ]; then die "403 on roster scrape $slug/$tid (WAF block)"; fi
    if [ "$scode" != "200" ]; then
      consec_fail=$((consec_fail+1)); say "      team $tid HTTP $scode (consec_fail=$consec_fail)"
      [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
      pace; continue
    fi
    consec_fail=0
    pl=$(echo "$sout" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("players",0))
except: print(0)')
    total_teams=$((total_teams+1)); total_players=$((total_players+pl))
    say "      ✓ team $tid → $pl players (running: teams=$total_teams players=$total_players)"
    pace
  done
done < "$WORKLIST"

rm -f "$WORKLIST"
say "=== DONE year=$YEAR ==="
say "events=$total_events teams_scraped=$total_teams players=$total_players"
say "Log: $LOG"
