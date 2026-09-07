#!/usr/bin/env bash
# Waits out the in-flight 2021 backfill, then walks 2019 -> 2014 one season at
# a time. Serial by construction: two concurrent runs would double our request
# rate against USAU's WAF.
#
# Seasons run one-per-invocation so a WAF hard-stop costs one season, not the
# whole queue, and so progress is inspectable between them. 2020 is skipped
# (12 event-teams, all COVID cancellations, none with a roster URL).
#
# Usage: KEY=<publishable key> nohup caffeinate -dimsu ./run-backfill-queue.sh &
set -uo pipefail

cd "$(dirname "$0")/../.."
SCRIPT=usau-scraper/scripts/backfill-event-rosters.py
QLOG=/tmp/backfill-queue-$(date +%Y%m%d-%H%M%S).log

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$QLOG"; }

if [ -z "${KEY:-}" ]; then
  KEY=$(grep '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2-)
fi
export KEY

say "queue start; waiting for any in-flight backfill to finish"
while pgrep -f "backfill-event-rosters.py" > /dev/null; do sleep 60; done
say "clear — starting queue"

for season in 2019 2018 2017 2016 2015 2014; do
  say "=== season $season starting ==="
  YEAR_MAX=$season YEAR_MIN=$season python3 "$SCRIPT"
  rc=$?
  if [ $rc -ne 0 ]; then
    # backfill-event-rosters exits non-zero on a WAF 403 or consecutive
    # failures. Stop the whole queue: the next season would hit the same wall
    # and hammering a blocking WAF makes the block worse.
    say "season $season exited $rc — stopping queue (see its own log)"
    exit $rc
  fi
  say "=== season $season done ==="
done

say "queue complete"
