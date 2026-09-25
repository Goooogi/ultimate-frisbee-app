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
  KEY=... FORCE_SLUGS=a,b GAP=20 ./backfill-event-rosters.py      # re-scrape these events' teams
  (KEY falls back to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from ../../.env)

FORCE_SLUGS is the post-event goals/assists pass: rosters are scraped up to a
week BEFORE an event and the default walk skips any team already rostered, so
G/A (published after play) never lands. It re-scrapes every team of the named
events regardless of coverage. Suspend the login LaunchAgent run first
(kill -STOP) — never two streams against USAU.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

BASE = "https://efjipdmylkqwmupvoxab.supabase.co/functions/v1"
REST = "https://efjipdmylkqwmupvoxab.supabase.co/rest/v1"

GAP = float(os.environ.get("GAP", "10"))
MAX_CONSEC_FAIL = int(os.environ.get("MAX_CONSEC_FAIL", "3"))
DRY = os.environ.get("DRY", "0") == "1"
YEAR_MIN = int(os.environ.get("YEAR_MIN", "2014"))
YEAR_MAX = int(os.environ.get("YEAR_MAX", "2026"))
FORCE_SLUGS = [s.strip() for s in os.environ.get("FORCE_SLUGS", "").split(",") if s.strip()]

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
            # Retry before giving up: after a laptop sleep the first call
            # always fails on a dead socket, and "treat as empty" silently
            # skipped whole events (they look fully covered) or re-scraped
            # ones already done.
            for backoff in (5, 20, 60):
                time.sleep(backoff)
                payload, code = curl(f"{REST}/{path}{sep}limit=1000&offset={offset}")
                if code == "200" and payload is not None:
                    break
            else:
                say(f"   REST {path} HTTP {code} after retries — treating as empty")
                return rows
        page = json.loads(payload)
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def fn(name: str, body: dict):
    return curl(f"{BASE}/{name}", method="POST", body=json.dumps(body))


# NOTE: roster_checked_at is stamped by sync-event-rosters (service role), not
# here. usau_event_teams is RLS select-only for the publishable key, and a
# blocked PATCH returns 204 with zero rows matched — it looks like success.


consec_fail = 0
totals = {"events": 0, "teams": 0, "players": 0, "skipped_events": 0}


def bail(msg: str) -> None:
    say(f"STOP: {msg}")
    say(f"progress: {totals}")
    say(f"log: {LOG}")
    sys.exit(1)


def bail_on_waf(res: dict, what: str) -> None:
    """sync-event-rosters catches a USAU 403 per team and still answers HTTP
    200 — the block only shows in perTeam[].error — so check_call's 403 stop
    never fires on roster calls."""
    errs = [p.get("error") for p in res.get("perTeam") or [] if p.get("error")]
    if any("403" in e for e in errs):
        bail(f"403 inside {what} (WAF block): {errs[0][:160]}")


def check_call(name: str, body: dict, what: str, verify=None):
    """Call an edge fn with the 403/consec-fail/000-retry policy. Returns
    parsed JSON on success, None on a skippable failure. On any non-200,
    `verify()` (when given) checks the DB before counting it failed — the fn
    often commits after the client times out (vault: HTTP 000 false
    failures); a verified commit counts as success with an empty payload."""
    global consec_fail
    payload, code = fn(name, body)
    if code == "000":
        # Verify BEFORE retrying: a timed-out call usually did commit, and the
        # blind retry re-scrapes USAU for nothing (extra WAF exposure).
        if verify is not None and verify():
            say(f"      {what} HTTP 000 but DB shows the write landed — counting as success")
            consec_fail = 0
            return {}
        say(f"      {what} HTTP 000 (client timeout; fn may have committed) — retry once")
        time.sleep(GAP)
        payload, code = fn(name, body)
    if code == "403":
        bail(f"403 on {what} (WAF block)")
    if code != "200":
        if verify is not None and verify():
            say(f"      {what} HTTP {code} but DB shows the write landed — counting as success")
            consec_fail = 0
            return {}
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


if FORCE_SLUGS:
    if GAP < 12:
        bail(f"GAP={GAP}s is under the 12s floor for a forced pass")
    # The teams already have roster rows, so a verify() after an HTTP 000 keys
    # on the fn's own roster_checked_at stamp from THIS run instead.
    since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    say(f"=== forced re-scrape — {', '.join(FORCE_SLUGS)} ===")
    say(f"gap={GAP}s max_consec_fail={MAX_CONSEC_FAIL} dry={DRY} log={LOG}")
    for slug in FORCE_SLUGS:
        ev = rest(f"usau_events?select=id&usau_slug=eq.{slug}")
        if not ev:
            bail(f"event {slug} not found")
        eid = ev[0]["id"]
        teams = rest(f"usau_event_teams?select=team_id,usau_event_team_url_id&event_id=eq.{eid}")
        todo = [t for t in teams if t["usau_event_team_url_id"]]
        totals["events"] += 1
        say(f"  {slug}: {len(todo)}/{len(teams)} teams have a USAU page")
        if DRY:
            continue
        for t in todo:
            tid = t["team_id"]
            res = check_call("sync-event-rosters",
                             {"slug": slug, "teamId": tid},
                             f"roster {slug}/{tid[:8]}",
                             verify=lambda eid=eid, tid=tid: bool(rest(
                                 f"usau_event_teams?select=team_id&event_id=eq.{eid}&team_id=eq.{tid}"
                                 f"&roster_checked_at=gte.{since}")))
            if res is not None:
                bail_on_waf(res, f"roster {slug}/{tid[:8]}")
                players = res.get("players", res.get("rosterSize", 0)) or 0
                totals["teams"] += 1
                totals["players"] += int(players)
                say(f"      ✓ {tid[:8]} → {players} players "
                    f"(teams={totals['teams']} players={totals['players']})")
            time.sleep(GAP)
    say(f"=== DONE === {totals}")
    say(f"log: {LOG}")
    sys.exit(0)

say(f"=== per-event roster backfill — seasons {YEAR_MAX} -> {YEAR_MIN} ===")
say(f"gap={GAP}s max_consec_fail={MAX_CONSEC_FAIL} dry={DRY} log={LOG}")

for season in range(YEAR_MAX, YEAR_MIN - 1, -1):
    events = rest(f"usau_events?select=id,usau_slug,start_date&season=eq.{season}"
                  f"&order=start_date.desc.nullslast")
    say(f"── season {season}: {len(events)} events ──")
    for ev in events:
        eid, slug = ev["id"], ev["usau_slug"]
        teams = rest(f"usau_event_teams?select=team_id,usau_event_team_url_id,roster_checked_at"
                     f"&event_id=eq.{eid}")
        if not teams:
            continue
        # "Covered" = the page was CHECKED, not "it produced rows". Plenty of
        # event-team pages publish no roster at all; keying off usau_rosters
        # made those permanently un-coverable and re-scraped them every run.
        covered = {t["team_id"] for t in teams if t["roster_checked_at"]}
        covered |= {r["team_id"] for r in
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
            urls_before = sum(1 for t in teams if t["usau_event_team_url_id"])
            res = check_call("resolve-event-team-urls", {"slug": slug}, f"resolve {slug}",
                             verify=lambda eid=eid, n=urls_before: len(rest(
                                 f"usau_event_teams?select=team_id&event_id=eq.{eid}"
                                 f"&usau_event_team_url_id=not.is.null")) > n)
            if res is not None:
                # The resolver answers HTTP 200 even when USAU 403'd it — the
                # block only shows in perEvent[].error — so the 403 hard-stop in
                # check_call can't see it. And "HTTP 200" alone said nothing:
                # 81 masters events logged "ok" for months while resolving 0.
                result = res  # flat body: {ok, events, resolvedTotal, perEvent}
                errors = [p.get("error") for p in result.get("perEvent") or [] if p.get("error")]
                if any("403" in e for e in errors):
                    bail(f"403 inside resolve {slug} (WAF block): {errors[0][:160]}")
                say(f"      resolved {result.get('resolvedTotal', '?')} URLs"
                    + (f" — error: {errors[0][:160]}" if errors else ""))
            time.sleep(GAP)
            teams = rest(f"usau_event_teams?select=team_id,usau_event_team_url_id&event_id=eq.{eid}")
            todo = [t for t in teams if t["team_id"] not in covered]

        for t in todo:
            if not t["usau_event_team_url_id"]:
                continue  # unresolvable on USAU's page; skip quietly
            tid = t["team_id"]
            # tid/eid bound at definition: a bare closure is late-binding and
            # every verify() in this loop would re-check the LAST team, so a
            # team that really committed got counted as a failure (3 of those
            # in a row = spurious hard stop).
            res = check_call("sync-event-rosters",
                             {"slug": slug, "teamId": tid},
                             f"roster {slug}/{tid[:8]}",
                             verify=lambda eid=eid, tid=tid: bool(rest(
                                 f"usau_rosters?select=team_id&event_id=eq.{eid}&team_id=eq.{tid}")))
            if res is not None:
                bail_on_waf(res, f"roster {slug}/{tid[:8]}")
                players = res.get("players", res.get("rosterSize", 0)) or 0
                totals["teams"] += 1
                totals["players"] += int(players)
                say(f"      ✓ {t['team_id'][:8]} → {players} players "
                    f"(teams={totals['teams']} players={totals['players']})")
            time.sleep(GAP)

say(f"=== DONE === {totals}")
say(f"log: {LOG}")
