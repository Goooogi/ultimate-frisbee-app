#!/usr/bin/env bash
# Scrape USAU rosters for a fixed (slug, team_id) WORKLIST — roster step ONLY.
#
# Why this exists: backfill-club-rosters.sh re-runs resolve-event-team-urls per
# event, and a few specific events (e.g. texas-2-finger-mixed-women-s) tarpit
# that call for many minutes → HTTP 000. When URLs are ALREADY resolved (any
# season we've walked once), we don't need resolve at all — just scrape the
# still-missing teams directly. This walks a precomputed worklist and calls only
# sync-event-rosters, which is fast (~1s/team).
#
# Same safety model as the sibling scripts:
#   - GAP seconds between every scrape (default 10s).
#   - HARD STOP on any HTTP 403 (WAF block).
#   - HARD STOP after MAX_CONSEC_FAIL consecutive non-403 failures.
#   - HTTP 000 (client timeout) → retry once, then counts as a failure.
#   - Idempotent + resumable: skips any team already rostered for SEASON.
#
# Usage:
#   ANON=<key> SEASON=2025 WORKLIST=/tmp/roster-worklist-2025.tsv ./scrape-rosters-from-worklist.sh
#   ANON=<key> SEASON=2025 WORKLIST=... GAP=8 ./scrape-rosters-from-worklist.sh
#
# WORKLIST format: one "slug<TAB>team_id" per line.

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST="https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"
ANON="${ANON:?set ANON to the project anon/publishable key}"
SEASON="${SEASON:?set SEASON, e.g. 2025}"
WORKLIST="${WORKLIST:?set WORKLIST to the tsv path}"
GAP="${GAP:-10}"
MAX_CONSEC_FAIL="${MAX_CONSEC_FAIL:-3}"

[ -f "$WORKLIST" ] || { echo "worklist not found: $WORKLIST"; exit 1; }

LOG="/tmp/roster-worklist-${SEASON}-$(date +%Y%m%d-%H%M%S).log"
consec_fail=0
scraped=0
players=0
skipped=0
failed=0
line_n=0
TOTAL=$(grep -c . "$WORKLIST")

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() {
  say "🛑 STOP: $*"
  say "Progress: scraped=$scraped players=$players skipped=$skipped failed=$failed of $TOTAL"
  say "Log: $LOG"
  exit 1
}
pace() { sleep "$GAP"; }

# Already rostered for this season? (resume safety — one cheap REST check per team)
is_rostered() {
  local tid="$1" n
  n=$(curl -s "$REST/usau_rosters?select=team_id&season=eq.$SEASON&team_id=eq.$tid&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
  [ "$n" -gt 0 ]
}

scrape() {
  local slug="$1" tid="$2" out code
  out=$(curl -s -w $'\n%{http_code}' --max-time 160 -X POST "$BASE/sync-event-rosters" \
    -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
    -d "{\"slug\":\"$slug\",\"teamId\":\"$tid\"}")
  code=$(echo "$out" | tail -1)
  echo "$out" | sed '$d'
  echo "$code" >&2
}

say "=== roster worklist scrape — season $SEASON ==="
say "worklist=$WORKLIST teams=$TOTAL gap=${GAP}s max_consec_fail=$MAX_CONSEC_FAIL log=$LOG"

while IFS=$'\t' read -r slug tid; do
  [ -z "${slug:-}" ] && continue
  [ -z "${tid:-}" ] && continue
  line_n=$((line_n+1))

  if is_rostered "$tid"; then
    skipped=$((skipped+1))
    say "($line_n/$TOTAL) skip (already rostered) $tid"
    continue
  fi

  sout=$(scrape "$slug" "$tid" 2>/tmp/rcode); scode=$(cat /tmp/rcode)
  if [ "$scode" = "000" ]; then
    say "($line_n/$TOTAL) $slug/$tid HTTP 000 (timeout) — retry once"
    pace
    sout=$(scrape "$slug" "$tid" 2>/tmp/rcode); scode=$(cat /tmp/rcode)
  fi
  if [ "$scode" = "403" ]; then die "403 on $slug/$tid (WAF block)"; fi
  if [ "$scode" != "200" ]; then
    consec_fail=$((consec_fail+1)); failed=$((failed+1))
    say "($line_n/$TOTAL) $slug/$tid HTTP $scode (consec_fail=$consec_fail)"
    [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
    pace; continue
  fi
  consec_fail=0
  pl=$(echo "$sout" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("players",0))
except: print(0)' 2>/dev/null || echo 0)
  scraped=$((scraped+1)); players=$((players+pl))
  say "($line_n/$TOTAL) ✓ $slug/$tid → $pl players (running: scraped=$scraped players=$players)"
  pace
done < "$WORKLIST"

say "=== DONE season=$SEASON ==="
say "scraped=$scraped players=$players skipped=$skipped failed=$failed of $TOTAL"
say "Log: $LOG"
