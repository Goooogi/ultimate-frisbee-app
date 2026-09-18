#!/usr/bin/env bash
# Detached launcher for the backfill scripts (macOS has no setsid; a plain `&`
# inside a Claude Bash call splits the shell variables and dies with the wrapper).
#
#   launch-detached.sh <label> <script> [ENV=VAL ...]
#
# Reads the publishable key from the repo .env, runs <script> under nohup with
# the given env, and writes $OUT_DIR/<label>.out (log) + <label>.pid.
# Sequence runs by PID — `while kill -0 $(cat <label>.pid); do sleep 20; done` —
# NEVER `pgrep -f <script>` (matches the Claude wrapper shells; cost 11 idle hours).
#
#   ./launch-detached.sh stage0-2025 ./backfill-event-details-per-event.sh \
#     YEAR=2025 WORKLIST_FILE=/tmp/college-worklists/college-2025-details.txt
set -u
LABEL="$1"; SCRIPT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2
OUT_DIR="${OUT_DIR:-/tmp/backfill-runs}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT_DIR"
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' "$REPO/.env" | cut -d= -f2- | tr -d '"')
[ -n "$ANON" ] || { echo "no NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in $REPO/.env"; exit 1; }
cd "$REPO"
env ANON="$ANON" "$@" nohup "$SCRIPT" > "$OUT_DIR/$LABEL.out" 2>&1 &
echo $! > "$OUT_DIR/$LABEL.pid"
echo "launched $LABEL pid=$(cat "$OUT_DIR/$LABEL.pid") log=$OUT_DIR/$LABEL.out"
