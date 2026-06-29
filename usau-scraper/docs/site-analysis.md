# USAU Site Analysis

## Site basics

- `usaultimate.org` — marketing/info site (WordPress). Not useful for data.
- `play.usaultimate.org` — Score Reporter, ASP.NET, server-rendered HTML.
  This is the only data source.
- No API exists, official or undocumented. All extraction is HTML scraping.

## Reachability (as of 2026-05-19)

| Source | Result |
| ------ | ------ |
| Local residential IP (curl from a Mac) | ✅ 200, full HTML |
| Supabase Edge Function (Deno Deploy) | ⏳ Not yet tested. Deploy `diagnose-reachability` to confirm. |

If Edge Functions get 403, fall back to a Cloudflare Worker proxy (free
tier, but Cloudflare IPs may also be blocked — test before committing).

## URL patterns (verified 2026-05-19)

| Page | URL pattern | Notes |
| ---- | ----------- | ----- |
| Tournament calendar | `/events/tournament/` | Renders BOTH upcoming + past in two tables |
| Event detail | `/events/{slug}/` | Chrome only; team/schedule data is NOT linked from this page |
| Event schedule (per division) | `/events/{slug}/schedule/{Gender}/Club-{Gender}/` | Hyphenated. `/Men/Club-Men/` for Open. |
| Team page (per-event) | `/teams/events/Eventteam/?EventTeamId={id}` | Has roster + per-event stats |
| Rankings | `/teams/events/team_rankings/?RankSet={code}` | Codes: `Club-Men`, `Club-Women`, `Club-Mixed`, `College-Men`, etc. No season param. |
| Rankings index (with season picker) | `/teams/events/rankings/` | Lists all published ranksets across seasons |
| Match report | `/teams/events/match_report/?EventGameId={id}` | Per-game detail. Not yet inspected. |

### Event slug examples

Format: `{year}-{name-with-hyphens-no-apostrophes}`. The scraper RESOLVES
slugs by parsing the calendar page, never by constructing them — naming
is too inconsistent.

- `2025-USAU-Pro-Championships`
- `2026-D-I-College-Championships`
- `2026-California-High-School-State-Championships`

### RankSet codes (verified)

USAU uses **historical legacy naming**. "Open" = "Men's" division:

| App label | URL code |
| --------- | -------- |
| Club Open / Men | `Club-Men` |
| Club Women | `Club-Women` |
| Club Mixed | `Club-Mixed` |
| College Men D-I | `College-Men` |
| College Women D-I | `College-Women` |
| College Men D-III | (likely `College-MenD3` — needs verification) |
| Masters | various — needs verification |

### Two team IDs

USAU has TWO identifiers for a team:

- **`TeamId`** — persistent across events. Appears on the rankings page
  link, and on persistent team pages reached via team search.
- **`EventTeamId`** — per-event participation. Appears on every
  schedule/bracket page. This is the key for everything event-scoped.

For v1 we treat `EventTeamId` as the always-known ID; `TeamId` is
nullable and backfilled when we can find a link.

## What we can scrape (public, no auth) — verified

- ✅ Tournament list (name, slug, dates, location, divisions, team counts)
- ✅ Per-event team list (via schedule sub-pages)
- ✅ Pool play standings (team, W-L, tiebreaker points)
- ✅ Bracket games (teams, seeds, scores, location, date/time, status)
- ✅ Team roster (jersey #, name, pronouns, height)
- ✅ **Per-event player stats — goals + assists leaderboards (when collected)**
- ✅ Weekly rankings (rank, rating, W-L, region, conf/section)

## What we can't / won't scrape

| Data | Why |
| ---- | --- |
| Per-game player stats | USAU only publishes per-event totals, not per-game |
| Individual player bios | Login-gated; ToS risk |
| Player contact info | Login-gated; privacy / ToS |
| Internal team admin | Login-gated; not useful for public app |

## Data model — additions decided 2026-05-19

The v0 schema (`0001_init.sql`) was a reasonable mockup. After live HTML
inspection, the following deltas are needed:

1. **`teams.usau_team_id`** → make NULLABLE. We often only have an
   `EventTeamId` at scrape time.
2. **`teams.usau_event_team_ids text[]`** → array of every per-event
   participation ID we've seen for this team. Lets us match
   `EventTeamId` → team during ingest.
3. **`event_teams.usau_event_team_id text NOT NULL`** → the per-event key.
4. **`games.usau_game_id text`** → the `game{id}` from `<div id="...">`,
   stable across re-scrapes.
5. **`games.usau_event_game_id text`** → URL-encoded EventGameId from
   the match-report link.
6. **`games.seed_a int / seed_b int`** → captured from `Revolver (1)`-style
   suffix on team names.
7. **`games.location text`** → field designation like `"3A"`.
8. New table **`player_event_stats`**:
   `(player_id, event_id, team_id, goals nullable, assists nullable, scraped_at)`
   PK on `(player_id, event_id)`.

Each delta is implemented in `0003_real_world_deltas.sql`.

## Cron schedule rationale

| Job | Schedule | Why |
| --- | -------- | --- |
| `sync-events` | Daily 06:00 UTC | New tournaments added regularly |
| `sync-event-details` | Daily 06:15 UTC + every 15min during active events | Live game scores |
| `sync-rankings` | Tuesday 12:00 UTC | USAU publishes rankings Tuesdays in season |

## Operational notes

### Rate limiting (enforced in `_shared/http.ts`)

- 2s minimum gap between requests
- Heavy backfills should run overnight
- Exponential backoff on 429/5xx (3 attempts, then skip + log)

### Selector drift mitigation

- Every parser calls `assertNonEmpty()` after parsing
- If row count is suspicious, throw — don't overwrite existing data
- `scrape_runs` table logs every invocation with error details
- The bracket parsers prefer `data-type` attributes (e.g.
  `[data-type="game-team-home"]`) — these are semantic and more stable
  than class names, which USAU has changed in the past.

### ToS

- USAU terms don't explicitly forbid scraping public pages
- Public, non-commercial use of scraped data has legal precedent (hiQ v.
  LinkedIn)
- Risks grow if you republish in a way that competes with usaultimate.org,
  scrape authenticated content, or generate high request volume
- Hunter is a USAU member — plan: email them about the project before
  going public
- Identify the scraper in headers — don't pretend it's a browser

## Reference: Python wrappers

- `erin2722/usau-scraper`: URL patterns for team search, rankings,
  pool play, brackets, rosters
- `azjps/usau-py`: nationals-focused parsers, useful for player stat
  extraction patterns

Both are dated; selectors have drifted. Use as reference, not source of truth.

## Future work (post-v1)

- `sync-team-details` — enrich teams with school/club/state once
  EventTeamId is resolved to persistent TeamId
- `sync-rosters` — once team details are in
- Backfill script for historical seasons (2020-2024) — manual one-shot
- `/teams/?ViewAll=true` search-based discovery for teams that haven't
  appeared in events yet
- Monitoring digest function: query `scrape_runs` daily, post failures
  to Slack
- Read RLS policies on scraped tables for the app's anon key
