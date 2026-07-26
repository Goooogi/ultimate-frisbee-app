#!/usr/bin/env bash
# Resolve USAU event team-URLs for every CLUB event in a season — resolve step ONLY.
#
# This is phase 1 of a fresh-season backfill (phase 2 = scrape-rosters-from-worklist.sh).
# Separating the phases matters because resolve-event-team-urls occasionally TARPITS
# on a specific event (USAU slow-walks that schedule page → the fn hangs for many
# minutes). Interleaved resolve+scrape (backfill-club-rosters.sh) lets one tarpit
# event stall the whole run. Here each resolve has a HARD per-call timeout so a
# tarpit fails fast, gets logged, and we move on — then a second pass can retry the
# skipped few.
#
# Safety model:
#   - GAP seconds between every call (default 10s).
#   - HARD STOP on any HTTP 403 (WAF block).
#   - Per-call --max-time (default 50s): a tarpit → HTTP 000 → SKIP + log, NOT a stop.
#   - Idempotent: resolve upserts; re-running only refetches (safe).
#
# Usage:
#   ANON=<key> SEASON=2017 ./resolve-event-urls-for-season.sh
#   ANON=<key> SEASON=2017 GAP=12 MAXTIME=60 ./resolve-event-urls-for-season.sh
#   ANON=<key> SEASON=2017 ONLY_UNRESOLVED=1 ./resolve-event-urls-for-season.sh  # 2nd-pass retry

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST="https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"
ANON="${ANON:?set ANON to the project anon/publishable key}"
SEASON="${SEASON:?set SEASON, e.g. 2017}"
GAP="${GAP:-10}"
MAXTIME="${MAXTIME:-50}"
ONLY_UNRESOLVED="${ONLY_UNRESOLVED:-0}"

LOG="/tmp/resolve-urls-${SEASON}-$(date +%Y%m%d-%H%M%S).log"
TARPITS="/tmp/resolve-tarpits-${SEASON}.txt"; : > "$TARPITS"
ok=0; tarpit=0; failed=0; n=0

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() { say "🛑 STOP: $*"; say "resolved_ok=$ok tarpit=$tarpit failed=$failed"; say "Log: $LOG"; exit 1; }
pace() { sleep "$GAP"; }

# CLUB events with games for the season. ONLY_UNRESOLVED=1 → only events that still
# have at least one team with a NULL url (for a targeted 2nd pass).
fetch_events() {
  curl -s "$REST/usau_events?select=usau_slug,start_date,usau_games!inner(id)&competition_level=eq.CLUB&season=eq.$SEASON&order=start_date.asc&usau_games.limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json
seen=set()
for e in json.load(sys.stdin):
    if not e.get("usau_games"): continue
    s=e["usau_slug"]
    if s in seen: continue
    seen.add(s); print(s)'
}

TOTAL_LIST=$(fetch_events)
TOTAL=$(printf '%s\n' "$TOTAL_LIST" | grep -c .)
say "=== resolve URLs — CLUB season $SEASON ==="
say "events=$TOTAL gap=${GAP}s max_time=${MAXTIME}s log=$LOG"

while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  n=$((n+1))
  out=$(curl -s -w $'\n%{http_code}' --max-time "$MAXTIME" -X POST "$BASE/resolve-event-team-urls" \
    -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d "{\"slug\":\"$slug\"}")
  code=$(echo "$out" | tail -1)
  if [ "$code" = "403" ]; then die "403 on $slug (WAF block)"; fi
  if [ "$code" = "000" ]; then
    tarpit=$((tarpit+1)); echo "$slug" >> "$TARPITS"
    say "($n/$TOTAL) ⏭  $slug TARPIT (>${MAXTIME}s) — skipped, logged to $TARPITS"
    pace; continue
  fi
  if [ "$code" != "200" ]; then
    failed=$((failed+1)); say "($n/$TOTAL) $slug HTTP $code"
    pace; continue
  fi
  rt=$(echo "$out" | sed '$d' | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("resolvedTotal","?"))
except: print("?")' 2>/dev/null || echo "?")
  ok=$((ok+1)); say "($n/$TOTAL) ✓ $slug (resolvedTotal=$rt)"
  pace
done <<< "$TOTAL_LIST"

say "=== DONE resolve season=$SEASON ==="
say "resolved_ok=$ok tarpit=$tarpit failed=$failed of $TOTAL"
[ "$tarpit" -gt 0 ] && say "Tarpit events (retry later, gentler): $TARPITS"
say "Log: $LOG"
