# Selector Cheat Sheet

The selectors that drive the scraper live in
`supabase/functions/_shared/parse.ts` under `SELECTORS`. This doc is the
human-readable mirror. Update it whenever USAU changes their HTML.

Status legend: ⏳ unverified placeholder · ✅ verified · ⚠️ partially verified

All findings below verified by direct curl + DOM inspection on **2026-05-19**.
Samples saved to `/tmp/usau-samples/` during verification.

---

## Tournament calendar — `/events/tournament/`

Status: ✅

Two ASP.NET GridView tables stacked vertically:

- **Upcoming**: `#CT_HP_Mid_1_gvCurrentUpcomingEvents`
- **Past**: `#CT_HP_Mid_1_gvPastEvents`

Both share `class="global_table left-align alt-style"` (with `alt-style-2`
on past for striping). Column layout is identical across both:

| Index | Content | Notes |
| ----- | ------- | ----- |
| `td:nth-child(1)` | Logo image | Skip |
| `td:nth-child(2)` | Event name + `<a href="/events/{slug}">` | Slug extraction via regex |
| `td:nth-child(3)` | City | Plain text |
| `td:nth-child(4)` | State | 2-letter code |
| `td:nth-child(5)` | Competition groups | `<ul class="bulletless">` with one `<li>` per division. Each `<li>` contains division label + a `<span style="color:red">[N]</span>` team count. Useful for pre-filtering events with Open Club divisions. |
| `td:nth-child(6)` | Dates | Format: `"May 22, 2026 - May 25, 2026"`. Parse both ends. |

Selector for **all rows in both tables** (page 1 only):
```
#CT_HP_Mid_1_gvCurrentUpcomingEvents tr, #CT_HP_Mid_1_gvPastEvents tr
```

Selector for **upcoming rows only** (postback pages 2+):
```
#CT_HP_Mid_1_gvCurrentUpcomingEvents tr
```

Skip the first row of each (header) — they use `<th>` cells, so a check
for `td` count > 0 filters them out automatically.

### Pagination — Upcoming Events (ASP.NET GridView postback)

The Upcoming Events table is paginated (~10 pages, 25 rows each).  The Past
Events table is NOT paginated (page 1 only — historical backfill is handled
separately).

**Mechanism**: ASP.NET `__doPostBack`.  There is no `?page=N` URL.  Each
"Next 25 »" anchor's `href` encodes the postback target and argument:

```html
<a href="javascript:__doPostBack('CT_HP_Mid_1$gvCurrentUpcomingEvents$ctl28$ctl00$ctl09','')">
  Next 25 &raquo;
</a>
```

Key facts:

- The `ctlNN` segments in the postback target **change on every render** —
  do not hardcode them.  Re-extract from each page's HTML.
- The postback target uses **`$` delimiters** (not underscores like the HTML
  id attribute).  `__EVENTTARGET` must use the raw `$`-delimited string from
  the href.
- **`__VIEWSTATE` must be carried forward fresh from each response.**  The
  server issues a new VIEWSTATE on every round-trip; posting a stale one
  causes an `Invalid viewstate` 500.
- Hidden fields to extract and POST back each page:
  - `__VIEWSTATE` (large base64 blob, ~10 KB)
  - `__VIEWSTATEGENERATOR`
  - `__EVENTVALIDATION`
  - Any other `<input type="hidden">` fields present
- Additional POST fields:
  - `__EVENTTARGET`: the postback target from the "Next" link
  - `__EVENTARGUMENT`: the argument (typically empty string `''`)

**Extraction helpers** (in `_shared/aspnet.ts`):
- `parseHiddenFields(html)` — extracts all `<input type="hidden">` values
- `extractNextPostback(html, gridId)` — finds the "Next" anchor inside the
  given grid and returns `{ target, argument }` or `null` on last page

**Stop conditions** (either stops pagination):
1. `extractNextPostback` returns `null` — no "Next" link, last page
2. Postback page returns 0 upcoming rows
3. `MAX_UPCOMING_PAGES = 15` safety cap reached (logs a warning)

---

## Rankings — `/teams/events/team_rankings/?RankSet={X}`

Status: ✅

**The URL pattern in the original docs was wrong.** Correct:

- The **canonical rankings page** is `/teams/events/team_rankings/?RankSet={code}`
- `RankSet` values use **hyphenated** names: `Club-Men`, `Club-Women`,
  `Club-Mixed`, `College-Men`, `College-Women`, etc. (Legacy USAU naming:
  the Open division is `Club-Men`.)
- The page does NOT take a `Season` parameter in the URL — it always shows
  the current published rankset for that group. To get a *specific season*
  you have to scrape the `gvRankSetList` dropdown on
  `/teams/events/rankings/` and follow individual `RankSet=...` links.

**Page content (when rankings are published):**

Single table `#CT_Main_0_gvList` with class `global_table`. Columns (10):

| Index | Content |
| ----- | ------- |
| `td:nth-child(1)` | Rank (e.g. "1") |
| `td:nth-child(2)` | Team name with `<a href="/teams/events/Eventteam/?TeamId=...">` |
| `td:nth-child(3)` | Power Rating (e.g. "2217") |
| `td:nth-child(4)` | Competition Level (College/Club) |
| `td:nth-child(5)` | Gender Division (Men/Women/Mixed) |
| `td:nth-child(6)` | Competition Division (Division I/Division III) |
| `td:nth-child(7)` | College Region (Northwest, South Central, ...) — Club shows region too |
| `td:nth-child(8)` | College Conference — Club shows section |
| `td:nth-child(9)` | Wins |
| `td:nth-child(10)` | Losses |

If no rankings are published yet for a season, the table contains a single
"There is no rank data available at this time." row.

---

## Event detail — `/events/{slug}/`

Status: ⚠️

The event page itself is mostly chrome — title + description + sponsor
blocks. **No team list or schedule subpages are linked from this page's
HTML** (the navigation lives in a JS-controlled tab system that doesn't
render anchors). Use this page only for:

- Confirming the event slug is valid (200 vs 404)
- Pulling the title from `<h1>`
- Pulling top-level description metadata if needed later

**To get teams/games for an event, go directly to the schedule sub-page**
(next section). The slug + a known gender division is enough.

---

## Event schedule — `/events/{slug}/schedule/{Gender}/Club-{Gender}/`

Status: ✅

URL format (verified):
- Club Open: `/events/{slug}/schedule/Men/Club-Men/`
- Club Mixed: `/events/{slug}/schedule/Mixed/Club-Mixed/`
- Club Women: `/events/{slug}/schedule/Women/Club-Women/`
- College Men D-I: `/events/{slug}/schedule/Men/College-Men/`
- etc.

Hyphenated `Club-Men` (NOT `ClubMen` — that 404s).

Page structure:

- `<h1>` = division label (e.g. "Club - Men")
- One or more `<h3>Pool A</h3>` headings, each followed by a
  `<table class="global_table">` of pool standings
- One or more `<h3>` bracket section headings (Championship, Third Place,
  Fifth Place Bracket, etc.)
- Within each bracket, `<h4>` round labels (Final, Semifinals,
  Quarterfinals, ...)
- Each game is a `<div class="bracket_game ...">` with semantic
  `data-type` attributes

### Pool standings table

| Column | Content |
| ------ | ------- |
| 1 | `<a href="/events/teams/?EventTeamId=...">{Team Name} ({Seed})</a>` |
| 2 | `class="WinLosePoints"` cell, text like `"3 - 0"` |
| 3 | tie-breaker points |

The team display name has the seed in parens at the end, e.g. `Revolver (1)`.
Parse the trailing `(N)` separately from the display name.

### Pool games table (added 2026-05-25)

A separate set of tables — one per pool — also appears on the schedule
page, distinguished by **`class="global_table scores_table"`** (not just
`global_table`). These contain pool play **games + scores** and sit AFTER
all the standings tables — no `<h3>Pool A Schedule & Scores</h3>` heading
precedes them.

```html
<table class="global_table scores_table">
  <thead>
    <tr><th colspan="8">Pool A Schedule & Scores</th></tr>
  </thead>
  <tbody>
    <tr><th>Date</th><th>Time</th><th>Field</th><th>Team 1</th><th>Team 2</th><th>Score</th><th>Status</th><th>Options</th></tr>
    <tr data-game="404957">
      <td><span class="adjust-data" data-type="game-date">Fri 5/22</span></td>
      <td>8:30 AM</td>
      <td>202</td>
      <td><a href="...EventTeamId=...">Oregon (1)</a></td>
      <td><a href="...EventTeamId=...">Utah (17)</a></td>
      <td>15 - 11</td>
      <td>Final</td>
      <td><a href="...match_report?EventGameId=...">Match Report</a></td>
    </tr>
    ...
  </tbody>
</table>
```

Key parsing notes:
- **Pool name lives in the `<thead> <th colspan="8">`** — not in a preceding `<h3>`. Extract via `thead th[colspan]` then regex `^(Pool\s+\S+)`.
- **EventGameId is on the `<tr data-game="NNN">` attribute** — cheaper to read than parsing the match-report link.
- Discriminate from standings tables by class: `scores_table` present → game table; absent → standings table.
- The Schedule cell uses date format `Fri 5/22` (no year). Combine with the time cell using current year to synthesize an ISO timestamp.

### Bracket games

```html
<div id="game382416" class="bracket_game top_game" data-index="1">
  <div class="gameID_area">
    <p><a href="/teams/events/match_report/?EventGameId=...">G1</a></p>
  </div>
  <div class="top_area  winner">  <!-- or 'loser' -->
    <span class="isScore"><span class="score" data-type="game-score-home">15</span></span>
    <span class="isName"><span class="team" data-type="game-team-home">
      <a href="/events/teams/?EventTeamId=...">Revolver (1)</a>
    </span></span>
  </div>
  <div class="btm_area  loser">
    <span class="isScore"><span class="score" data-type="game-score-away">11</span></span>
    <span class="isName"><span class="team" data-type="game-team-away">
      <a href="/events/teams/?EventTeamId=...">Chicago Machine (8)</a>
    </span></span>
  </div>
  <p class='location'>3A</p>
  <span class='game-status'>Final</span>
  <span class='date'>9/1/2025 9:00 AM</span>
</div>
```

Recommended selectors (the `data-type` attributes are semantic and stable):

| Field | Selector |
| ----- | -------- |
| Game ID (USAU) | `div.bracket_game[id]` → strip `game` prefix |
| Match report link | `.gameID_area a[href*="match_report"]` |
| EventGameId | regex on match-report href |
| Home team name | `[data-type="game-team-home"] a` text |
| Home EventTeamId | `[data-type="game-team-home"] a[href]` → regex |
| Home score | `[data-type="game-score-home"]` text |
| Away team name | `[data-type="game-team-away"] a` text |
| Away EventTeamId | `[data-type="game-team-away"] a[href]` → regex |
| Away score | `[data-type="game-score-away"]` text |
| Winner side | parent has class `top_area winner` or `btm_area winner` |
| Location | `.location` text |
| Status | `.game-status` text (e.g. "Final") |
| Date/time | `.date` text |

Round is inferred from the enclosing `<h4>` element. Bracket section
(Championship vs Fifth Place) is the enclosing `<h3>`.

---

## Team page — `/teams/events/Eventteam/?EventTeamId={id}`

Status: ✅

**Important**: this URL is parameterized by **`EventTeamId`** (per-event
participation), not the persistent `TeamId`. The two are different! The
`TeamId` is found on rankings pages and on the event team page itself
(via the team name link).

Page sections:

- `<h2>` — Division ("Club - Men")
- `<h4>` — Team display name ("Revolver")
- `<h3>Player Roster</h3>` → `#CT_Main_0_ucTeamDetails_gvList`
- `<h3>Event Schedule and Scores</h3>` → `#CT_Right_0_gvEventScheduleScores`
- `<h3>` — Event-name link followed by per-event stats blocks
  - `#CT_Right_1_gvListGoals` (goals leaderboard)
  - `#CT_Right_1_gvListAssists` (assists leaderboard)

### Roster columns (`#CT_Main_0_ucTeamDetails_gvList`)

| Index | Content |
| ----- | ------- |
| 1 | Jersey number |
| 2 | Player name |
| 3 | Pronouns (H/S/T/etc) |
| 4 | (unused or position) |
| 5 | Height (e.g. `6'0"`) |
| 6 | Points (lifetime?) |

### Per-event leaderboards (`#CT_Right_1_gvListGoals`, `..._gvListAssists`)

| Index | Content |
| ----- | ------- |
| 1 | Player name (with `title="{Team}"` tooltip) |
| 2 | Stat value (integer or `&nbsp;` if not collected) |

**Note**: These stats are **not always collected**. Pro Championships and
USAU Club Nationals have full scorekeeping; regional/sectional events
typically don't. Treat the values as nullable.

---

## Quirks discovered along the way

- **Event slug** in href varies: sometimes `href='/events/...'` (single
  quotes), sometimes `href="/events/..."`. Match both. cheerio handles
  this automatically via `$().attr('href')`.
- **Team name with seed**: `"Revolver (1)"` — strip the trailing `\s*\(\d+\)\s*$`
  to get the canonical name, save the seed separately.
- **EventTeamId** is URL-encoded base64 with `=` padding. Always
  `decodeURIComponent()` before storing.
- **TeamId** (persistent) only appears on rankings pages and on rare
  Eventteam pages that link to the persistent team profile. The Pro
  Championships team page does NOT expose the persistent TeamId — we
  may need a separate scraper that walks `/teams/?ViewAll=true` to
  resolve EventTeamId → TeamId mappings, if we want cross-event team
  identity at all (for v1 we can treat each `(TeamName, year)` as a
  loose identity instead).
- **Encoded ampersands** in score-table cells use `&#39;` for apostrophe.
  cheerio decodes these for `.text()` calls. No manual decode needed.
- **Datacenter IPs may be blocked** by USAU's WAF (per docs). Local curl
  from a residential IP works (verified 2026-05-19). Edge Function
  reachability still needs to be confirmed by deploying
  `diagnose-reachability`.
