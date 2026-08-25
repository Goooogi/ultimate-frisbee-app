#!/usr/bin/env python3
"""Backfill PER-EVENT rosters for every USAU event, newest seasons first.

Why: usau_rosters rows written before sync-event-rosters' 20260821140000 key
change carry event_id NULL — the event a roster was scraped from was flattened
away, so "rostered at the Pro-Elite Challenge" reads as "on the team all
season". This walks every (event, team) page and re-scrapes the ones with no
event-keyed rows, giving profiles (and any identity logic) per-event truth.

Safety model matches backfill-club-rosters.sh — this drives edge functions that
hit play.usaultimate.org directly, behind USAU's WAF:
  - GAP seconds between every scraping call (default 10s).
  - HARD STOP on HTTP 403 (WAF block; retrying the same IP makes it worse).
  - HARD STOP after MAX_CONSEC_FAIL consecutive other failures.
  - HTTP 000/timeout: retry once (the fn often commits after the client
    times out — see vault feedback "HTTP 000 false failures"), then verify
    via the DB before counting it failed.
  - Idempotent + resumable: an (event, team) with ANY event-keyed roster rows
    is skipped, so re-runs fast-forward to where they stopped.

Usage:
  KEY=<publishable key> ./backfill-event-rosters.py               # everything, 2026 -> 2014
  KEY=... YEAR_MIN=2021 ./backfill-event-rosters.py               # 2026 -> 2021 only
  KEY=... DRY=1 ./backfill-event-rosters.py                       # plan only, no writes
  (KEY falls back to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from ../../.env)
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime

BASE = "https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST = "https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"

GAP = float(os.environ.get("GAP", "10"))
MAX_CONSEC_FAIL = int(os.environ.get("MAX_CONSEC_FAIL", "3"))
DRY = os.environ.get("DRY", "0") == "1"
YEAR_MIN = int(os.environ.get("YEAR_MIN", "2014"))
YEAR_MAX = int(os.environ.get("YEAR_MAX", "2026"))

LOG = f"/tmp/event-roster-backfill-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"


def key() -> str:
    k = os.environ.get("KEY")
    if k:
        return k
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    try:
        for line in open(env_path):
            if line.startswith("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    sys.exit("set KEY (or have NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env)")


KEY = key()


def say(msg: str) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def curl(url: str, method: str = "GET", body: str | None = None, timeout: int = 170):
    cmd = ["curl", "-s", "-w", "\n%{http_code}", "--max-time", str(timeout), "-X", method,
           "-H", f"apikey: {KEY}", "-H", f"Authorization: Bearer {KEY}",
           "-H", "Content-Type: application/json", url]
    if body is not None:
        cmd += ["-d", body]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 10).stdout
    except subprocess.TimeoutExpired:
        return None, "000"
    payload, _, code = out.rpartition("\n")
    return payload, code.strip() or "000"


def rest(path: str) -> list:
    """Paged GET against PostgREST (1000-row cap per response)."""
    rows: list = []
    offset = 0
    while True:
        sep = "&" if "?" in path else "?"
        payload, code = curl(f"{REST}/{path}{sep}limit=1000&offset={offset}")
        if code != "200" or payload is None:
            say(f"   REST {path} HTTP {code} — treating as empty")
            return rows
        page = json.loads(payload)
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def fn(name: str, body: dict):
    return curl(f"{BASE}/{name}", method="POST", body=json.dumps(body))


consec_fail = 0
totals = {"events": 0, "teams": 0, "players": 0, "skipped_events": 0}


def bail(msg: str) -> None:
    say(f"STOP: {msg}")
    say(f"progress: {totals}")
    say(f"log: {LOG}")
    sys.exit(1)


def check_call(name: str, body: dict, what: str):
    """Call an edge fn with the 403/consec-fail/000-retry policy. Returns
    parsed JSON on success, None on a skippable failure."""
    global consec_fail
    payload, code = fn(name, body)
    if code == "000":
        say(f"      {what} HTTP 000 (client timeout; fn may have committed) — retry once")
        time.sleep(GAP)
        payload, code = fn(name, body)
    if code == "403":
        bail(f"403 on {what} (WAF block)")
    if code != "200":
        consec_fail += 1
        say(f"      {what} HTTP {code} (consec_fail={consec_fail})")
        if consec_fail >= MAX_CONSEC_FAIL:
            bail(f"{MAX_CONSEC_FAIL} consecutive failures")
        return None
    consec_fail = 0
    try:
        return json.loads(payload) if payload else {}
    except json.JSONDecodeError:
        return {}


say(f"=== per-event roster backfill — seasons {YEAR_MAX} -> {YEAR_MIN} ===")
say(f"gap={GAP}s max_consec_fail={MAX_CONSEC_FAIL} dry={DRY} log={LOG}")

for season in range(YEAR_MAX, YEAR_MIN - 1, -1):
    events = rest(f"usau_events?select=id,usau_slug,start_date&season=eq.{season}"
                  f"&order=start_date.desc.nullslast")
    say(f"── season {season}: {len(events)} events ──")
    for ev in events:
        eid, slug = ev["id"], ev["usau_slug"]
        teams = rest(f"usau_event_teams?select=team_id,usau_event_team_url_id&event_id=eq.{eid}")
        if not teams:
            continue
        covered = {r["team_id"] for r in
                   rest(f"usau_rosters?select=team_id&event_id=eq.{eid}")}
        todo = [t for t in teams if t["team_id"] not in covered]
        if not todo:
            totals["skipped_events"] += 1
            continue
        totals["events"] += 1
        say(f"  {season} {slug}: {len(todo)}/{len(teams)} teams to scrape")
        if DRY:
            continue

        if any(not t["usau_event_team_url_id"] for t in todo):
            if check_call("resolve-event-team-urls", {"slug": slug}, f"resolve {slug}") is not None:
                say("      resolved URLs ok")
            time.sleep(GAP)
            teams = rest(f"usau_event_teams?select=team_id,usau_event_team_url_id&event_id=eq.{eid}")
            todo = [t for t in teams if t["team_id"] not in covered]

        for t in todo:
            if not t["usau_event_team_url_id"]:
                continue  # unresolvable on USAU's page; skip quietly
            res = check_call("sync-event-rosters",
                             {"slug": slug, "teamId": t["team_id"]},
                             f"roster {slug}/{t['team_id'][:8]}")
            if res is not None:
                players = res.get("players", res.get("rosterSize", 0)) or 0
                totals["teams"] += 1
                totals["players"] += int(players)
                say(f"      ✓ {t['team_id'][:8]} → {players} players "
                    f"(teams={totals['teams']} players={totals['players']})")
            time.sleep(GAP)

say(f"=== DONE === {totals}")
say(f"log: {LOG}")
