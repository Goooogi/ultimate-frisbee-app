#!/usr/bin/env bash
# Phase 1: backfill USAU COLLEGE rosters (2021–2025), slow & serial.
#
# Why this exists: every college event has games but ZERO rosters because the
# resolver/roster scrape was never run against them. The deployed dispatcher
# fans out per-team IN PARALLEL — that's the exact burst pattern that got our
# Deno egress IP rate-limited before (see _shared/http.ts comment). So instead
# of the dispatcher, this script drives the work ONE REQUEST AT A TIME from the
# operator's machine, with a global pace gap and a hard stop on any block.
#
# Safety rails:
#   - GAP seconds between every HTTP call (default 6s ≈ 10 req/min, heavy-browsing).
#   - Hard STOP on any HTTP 403 (WAF block — retrying same IP won't help).
#   - Hard STOP after MAX_CONSEC_FAIL consecutive failures (429/5xx/timeout).
#   - Idempotent: skips teams that already have a roster for the season, so a
#     re-run resumes where it left off.
#   - Per-event: resolve URLs first (1 call), then scrape each unresolved team.
#
# Usage:
#   ANON=<anon key> ./backfill-college-rosters.sh                # all 2021–2025 college
#   ANON=<key> SEASONS="2024,2025" ./backfill-college-rosters.sh # only the unfinished seasons
#   ANON=<key> GAP=15 ./backfill-college-rosters.sh              # extra-gentle pace
#   ANON=<key> DRY=1 ./backfill-college-rosters.sh               # print plan, no calls
#
# Reads the work-list live from Postgres so it's always current and RESUMABLE:
# already-rostered teams are skipped, so you can stop/restart freely.
#
# ── STATUS: COMPLETE (verified 2026-08-05) — nothing left to run ─────────────
# Every college season a team can realistically be scraped for is DONE. Coverage
# of teams that have a roster for the season they played:
#
#   2026  D-I 100% (83/83)     D-III 100% (38/38)
#   2025  D-I  99.3% (292/294) D-III 100% (116/116)
#   2024  D-I  99.7% (316/317) D-III 100% (121/121)
#   2023  D-I  16.2% (324/2004) D-III 38.2% (116/304)   <- see below, NOT a gap
#   2022  D-I  95.4% (495/519) D-III 100% (197/197)
#   2021  D-I  95.9% (348/363) D-III  99.2% (127/128)
#
# 2023's low percentage is an ACCOUNTING ARTIFACT, not missing data:
#   - 2023 Nationals is 100% complete (40/40 D-I, 32/32 D-III).
#   - 2023 is the ONLY college season where regular-season tournaments were
#     ingested (174 of them: Midwest Throwdown, Queen City Tune Up, Stanford
#     Open…). 2024/2025/2026 ingested ZERO. So 2023's denominator carries the
#     long tail of small programs no other season counts.
#   - Of its 1,868 teams with no roster: 0 reached Nationals, none have a roster
#     in ANY season, and ~1,129 (60%) are duplicate rows of teams already
#     rostered in 2023 (the usau_team_id-is-NULL split). Only ~176 are genuinely
#     new programs.
#   - Only 5 of the 1,868 have a usau_event_team_url_id, so scraping them means a
#     ~1,900-call RESOLVE pass first — against the WAF that tarpitted our Deno
#     egress IP at ~450 sustained requests. Not worth it for teams with no
#     Nationals appearance.
#
# The old "2024 + 2025 remain" note was stale — both finished (1 and 2 teams
# short respectively, i.e. genuinely unscrapable stragglers).
#
# If you ever DO resume (e.g. a new season), the WAF rules still apply: wait out
# any block from a residential IP, then run with a wide gap —
#   ANON=$(supabase ... anon key) SEASONS="2027" GAP=12 \
#     bash scripts/backfill-college-rosters.sh
# It fast-skips already-rostered teams, so a re-run is always safe.

set -uo pipefail

BASE="https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST="https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"
ANON="${ANON:?set ANON to the project anon key}"
# Default 12s pace. We measured the WAF's tolerance the hard way: ~450 requests
# at a 6s gap eventually got our Deno egress IP tarpitted (22-min stalls, then
# connection failures), while the same source stayed instant from a residential
# IP. 12s halves the sustained rate to stay under that threshold. Override with
# GAP=15 for extra headroom, or batch with rests for very large runs.
GAP="${GAP:-12}"
SEASONS="${SEASONS:-2021,2022,2023,2024,2025}"
MAX_CONSEC_FAIL="${MAX_CONSEC_FAIL:-2}"
DRY="${DRY:-0}"

LOG="/tmp/college-roster-backfill-$(date +%Y%m%d-%H%M%S).log"
consec_fail=0
total_teams=0
total_players=0
total_events=0

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

# Hard stop: print summary and exit non-zero.
die() {
  say "🛑 STOP: $*"
  say "Progress: events=$total_events teams_scraped=$total_teams players=$total_players"
  say "Log: $LOG"
  exit 1
}

pace() { sleep "$GAP"; }

# Pull the ordered college work-list (slug,season) from REST. Restrict to
# events that actually HAVE games (usau_games!inner) — empty event shells have
# no rosters to fetch and would just waste resolve calls. We select a single
# game id to keep the embed minimal, then dedup slugs in Python.
fetch_events() {
  local season_filter="in.(${SEASONS})"
  curl -s "$REST/usau_events?select=usau_slug,season,start_date,usau_games!inner(id)&competition_level=in.(COLLEGE_D1,COLLEGE_D3)&season=$season_filter&order=season.asc,start_date.asc&limit=1&usau_games.limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Range: 0-0" >/dev/null 2>&1
  # The real fetch: dedup to one row per event-with-games.
  curl -s "$REST/usau_events?select=usau_slug,season,start_date,usau_games!inner(id)&competition_level=in.(COLLEGE_D1,COLLEGE_D3)&season=$season_filter&order=season.asc,start_date.asc&usau_games.limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json
seen=set(); out=[]
for e in json.load(sys.stdin):
    if not e.get("usau_games"): continue
    if e["usau_slug"] in seen: continue
    seen.add(e["usau_slug"]); out.append({"usau_slug":e["usau_slug"],"season":e["season"]})
print(json.dumps(out))'
}

# For an event slug, return team_ids that have a resolved URL but NO roster
# for the season yet. Done in two REST calls + a comm in awk.
unrostered_teams() {
  local slug="$1" season="$2"
  # event id
  local eid
  eid=$(curl -s "$REST/usau_events?select=id&usau_slug=eq.$slug" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')
  [ -z "$eid" ] && return 0
  # teams with resolved url for this event
  local resolved
  resolved=$(curl -s "$REST/usau_event_teams?select=team_id&event_id=eq.$eid&usau_event_team_url_id=not.is.null" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json; [print(r["team_id"]) for r in json.load(sys.stdin)]')
  [ -z "$resolved" ] && return 0
  # teams already rostered this season — SCOPED to just this event's resolved
  # teams (in.() list), not the whole season. Querying the full season hits
  # PostgREST's 1000-row default cap and silently misses already-done teams,
  # causing needless re-scrapes (= extra requests = higher block risk).
  local idlist
  idlist=$(echo "$resolved" | sort -u | paste -sd, -)
  local done
  done=$(curl -s "$REST/usau_rosters?select=team_id&season=eq.$season&team_id=in.($idlist)" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    | python3 -c 'import sys,json; [print(r["team_id"]) for r in json.load(sys.stdin)]' | sort -u)
  # set difference: resolved minus done
  comm -23 <(echo "$resolved" | sort -u) <(echo "$done")
}

# POST a function, echo HTTP code to stderr, body to stdout.
# --max-time 160: the Edge function itself can legitimately run up to ~150s on
# big Nationals team pages (verified: invocations returned HTTP 200 at 92s+).
# A tighter client timeout makes curl give up (HTTP 000) while the function is
# STILL succeeding server-side — a false failure. Match the client timeout to
# the server's walltime so we never bail on a call that's actually working.
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

say "=== College roster backfill ==="
say "seasons=$SEASONS gap=${GAP}s max_consec_fail=$MAX_CONSEC_FAIL dry=$DRY"
say "log=$LOG"

EVENTS_JSON=$(fetch_events)
EVENT_COUNT=$(echo "$EVENTS_JSON" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')
say "Events to process: $EVENT_COUNT"

# Write the slug<TAB>season list to a temp file, then feed the loop via
# redirection (NOT a pipe) so counter increments persist in this shell —
# a piped `while` runs in a subshell and loses all state (Bash 3.2 on macOS).
WORKLIST=$(mktemp)
echo "$EVENTS_JSON" | python3 -c 'import sys,json
for e in json.load(sys.stdin): print(e["usau_slug"]+"\t"+str(e["season"]))' > "$WORKLIST"

while IFS=$'\t' read -r slug season; do
  total_events=$((total_events+1))
  say "── ($total_events/$EVENT_COUNT) $slug [$season] ──"

  if [ "$DRY" = "1" ]; then
    teams=$(unrostered_teams "$slug" "$season" | grep -c . || true)
    say "   DRY: would resolve, then scrape ~unrostered teams (post-resolve count unknown until resolve runs)"
    continue
  fi

  # 1) Resolve URLs for this event (one schedule fetch per gender).
  rbody="{\"slug\":\"$slug\"}"
  rout=$(call resolve-event-team-urls "$rbody" 2>/tmp/code); rcode=$(cat /tmp/code)
  if [ "$rcode" = "403" ]; then die "403 on resolve for $slug (WAF block)"; fi
  if [ "$rcode" != "200" ]; then
    consec_fail=$((consec_fail+1)); say "   resolve HTTP $rcode (consec_fail=$consec_fail)"
    [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
    pace; continue
  fi
  consec_fail=0
  rres=$(echo "$rout" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d.get("resolvedTotal","?"))
except: print("?")')
  say "   resolved URLs: $rres"
  pace

  # 2) Scrape each still-unrostered team, one at a time.
  # Bash 3.2 (macOS default) has no `mapfile`; collect into a newline string
  # and iterate. Newline-only IFS so team UUIDs (no spaces) stay intact.
  teams="$(unrostered_teams "$slug" "$season")"
  team_count=$(printf '%s\n' "$teams" | grep -c . || true)
  say "   teams to scrape: $team_count"
  for tid in $teams; do
    [ -z "$tid" ] && continue
    sbody="{\"slug\":\"$slug\",\"teamId\":\"$tid\"}"
    sout=$(call sync-event-rosters "$sbody" 2>/tmp/code); scode=$(cat /tmp/code)
    # HTTP 000 = curl gave up locally, but the Edge function often STILL
    # completes server-side (verified). So it's a soft case: pace, retry ONCE
    # in place, and only count it as a failure if the retry also returns 000.
    if [ "$scode" = "000" ]; then
      say "      team $tid HTTP 000 (client timeout; fn may have finished) — retrying once"
      pace
      sout=$(call sync-event-rosters "$sbody" 2>/tmp/code); scode=$(cat /tmp/code)
    fi
    if [ "$scode" = "403" ]; then die "403 on roster scrape $slug/$tid (WAF block)"; fi
    if [ "$scode" != "200" ]; then
      consec_fail=$((consec_fail+1)); say "      team $tid HTTP $scode (consec_fail=$consec_fail)"
      [ "$consec_fail" -ge "$MAX_CONSEC_FAIL" ] && die "$MAX_CONSEC_FAIL consecutive failures"
      pace; continue
    fi
    consec_fail=0
    pl=$(echo "$sout" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d.get("players",0))
except: print(0)')
    total_teams=$((total_teams+1)); total_players=$((total_players+pl))
    say "      ✓ team $tid → $pl players  (running: teams=$total_teams players=$total_players)"
    pace
  done
done < "$WORKLIST"

rm -f "$WORKLIST"
say "=== DONE ==="
say "events=$total_events teams_scraped=$total_teams players=$total_players"
say "Log: $LOG"
