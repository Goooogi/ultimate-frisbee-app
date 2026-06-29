# Task Queue

Work through these in order. Don't skip ahead — earlier tasks de-risk later ones.

## Phase 0: Setup (Hunter does this once; Claude Code can help)

- [ ] Install Supabase CLI: `brew install supabase/tap/supabase`
- [ ] Log in: `supabase login`
- [ ] Link to project: `supabase link --project-ref <YOUR_PROJECT_REF>`
- [ ] Set the project_id in `supabase/config.toml`
- [ ] Confirm which Supabase org this lives in (`Altius` or `Hunter`)

## Phase 1: Schema + reachability check (do this first, in one sitting)

- [ ] Push the schema migration: `supabase db push`
- [ ] Verify in Supabase Studio: tables `events`, `teams`, `event_teams`,
      `games`, `players`, `rosters`, `rankings`, `scrape_runs` all exist
- [ ] Deploy the diagnostic function:
      `supabase functions deploy diagnose-reachability`
- [ ] Invoke it and check the response:
      `curl https://<PROJECT_REF>.supabase.co/functions/v1/diagnose-reachability \
        -H "Authorization: Bearer <ANON_KEY>"`
- [ ] **DECISION POINT** based on diagnostic output:
  - Got `200 OK` with USAU HTML → proceed to Phase 2
  - Got `403 Forbidden` → add a proxy layer before Phase 2 (see
    `docs/site-analysis.md` "Operational notes" section)

## Phase 2: Verify selectors against live HTML

For each page type below, open it in Chrome, inspect the DOM, then update
the corresponding entry in `supabase/functions/_shared/parse.ts`.

- [ ] **Tournament calendar** — `/events/tournament/`
  - Confirm row selector, name/link/dates/city/state column indexes
  - Note: the table ID I guessed was `#CT_Main_0_gvList`, an ASP.NET
    GridView pattern — confirm the real ID
- [ ] **Rankings** — `/teams/events/rankings/?RankSet=ClubMixed&Season=2025`
  - Confirm table + row selector + column order (rank, team, rating)
- [ ] **Event detail** — `/events/2025-USAU-Pro-Championships/`
  - Find the team list block; confirm how team links are rendered
  - Note the URL pattern for the schedule sub-pages (vary by division)
- [ ] **Pool play** — drill into a division's schedule page
  - Pool name, team name selectors
  - How standings within a pool are shown
- [ ] **Bracket** — same page, bracket section
  - Matchup container, team-a, team-b, score-a, score-b selectors
- [ ] **Team page** — `/teams/events/Eventteam/?TeamId=<id>`
  - Capture: team name, school/club, gender, level, division, state
- [ ] **Roster** — `/teams/events/Eventteam/roster/?TeamId=<id>`
  - Player name, jersey number selectors

As you verify each, write the findings to `docs/selectors.md`.

## Phase 3: Wire up real parsers + test each function locally

- [ ] Update `_shared/parse.ts` SELECTORS map with verified selectors
- [ ] Local serve: `supabase functions serve sync-events --no-verify-jwt`
- [ ] Hit it: `curl localhost:54321/functions/v1/sync-events`
- [ ] Verify rows appear in `events` table
- [ ] Repeat for `sync-rankings` (after at least 1 event scrape, since
      rankings need team names that come from events)
- [ ] Repeat for `sync-event-details` (test with a single slug:
      `curl -X POST ... -d '{"slug":"2025-USAU-Pro-Championships"}'`)
- [ ] Build out the game parsing in `sync-event-details` — left as a stub
      in the mockup because the bracket HTML varies and needs live inspection

## Phase 4: Deploy

- [ ] Set function secrets:
      `supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`
      (Note: these are auto-injected for functions, but verify)
- [ ] Deploy each function:
      `supabase functions deploy sync-events`
      `supabase functions deploy sync-event-details`
      `supabase functions deploy sync-rankings`
- [ ] Smoke test each in production:
      `curl https://<REF>.supabase.co/functions/v1/sync-events \
        -H "Authorization: Bearer <ANON>"`
- [ ] Check `scrape_runs` table — should see one row per invocation

## Phase 5: Schedule via pg_cron

- [ ] Store secrets in Supabase Vault (see `0002_cron.sql` comments)
- [ ] Run `0002_cron.sql` to create the cron schedules
- [ ] Verify: `select * from cron.job;`
- [ ] Wait 24h, then check `scrape_runs` shows scheduled runs firing
- [ ] Verify: `select * from cron.job_run_details order by start_time desc limit 20;`

## Phase 6: Future / nice-to-haves

- [ ] `sync-team-details` function — enrich teams with school, division,
      state after they're created by `sync-event-details`
- [ ] `sync-rosters` function — once team details are in
- [ ] Backfill script for historical seasons (2020-2024) — manual one-shot
- [ ] Add a `/teams/?ViewAll=true` search-based discovery function for teams
      that haven't appeared in events yet
- [ ] Monitoring: a daily digest function that queries `scrape_runs` and
      posts failures to a Slack webhook or email
- [ ] Add row-level security policies — the apps read with the anon key,
      so views/policies need to allow public read on the scraped tables
