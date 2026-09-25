#!/usr/bin/env bash
# Run stage 0 (teams + games) for several college seasons back to back, newest
# first, as ONE stream — then resume a paused roster job.
#
# Why a chain script: background waits inside a Claude session die with the
# session (three restarts in one week, 2026-09), so sequencing must live in one
# detached process. Why RESUME_PID: the login LaunchAgent's roster job
# (backfill-event-rosters.py) must never run beside another stream, so the
# operator suspends it with `kill -STOP <pid>` first and this script sends
# `kill -CONT` when — and only when — every season finished cleanly. After a 403
# or any other stop it is left suspended on purpose: resuming would just walk a
# blocked IP into USAU again.
#
# Usage (via launch-detached.sh, which supplies ANON + caffeinate):
#   ./launch-detached.sh chain-stage0 ./chain-college-stage0.sh \
#     YEARS="2025 2024" WORKLIST_DIR=/tmp/college-worklists RESUME_PID=812
set -uo pipefail

YEARS="${YEARS:?set YEARS, e.g. \"2025 2024\"}"
WORKLIST_DIR="${WORKLIST_DIR:-/tmp/college-worklists}"
RESUME_PID="${RESUME_PID:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

say() { echo "[$(date +%H:%M:%S)] CHAIN $*"; }

rc=0
for year in $YEARS; do
  list="$WORKLIST_DIR/college-$year-details.txt"
  [ -f "$list" ] || { say "missing worklist $list — stopping"; rc=1; break; }
  say "── stage 0, season $year ($(grep -c . "$list") events) ──"
  YEAR="$year" WORKLIST_FILE="$list" "$HERE/backfill-event-details-per-event.sh"
  rc=$?
  [ "$rc" -eq 0 ] || { say "season $year exited rc=$rc — stopping the chain"; break; }
done

if [ -n "$RESUME_PID" ]; then
  if [ "$rc" -eq 0 ] && kill -0 "$RESUME_PID" 2>/dev/null; then
    kill -CONT "$RESUME_PID" && say "resumed roster job pid $RESUME_PID"
  else
    say "NOT resuming pid $RESUME_PID (rc=$rc, alive=$(kill -0 "$RESUME_PID" 2>/dev/null && echo yes || echo no))"
  fi
fi
say "=== CHAIN DONE rc=$rc ==="
exit "$rc"
