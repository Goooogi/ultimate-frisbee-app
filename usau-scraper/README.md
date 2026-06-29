# USAU Scraper

Scrapes USA Ultimate's Score Reporter (`play.usaultimate.org`) into Supabase
Postgres so your ultimate frisbee app can render rankings, schedules,
tournament results, and rosters without hitting USAU directly on every
request.

## What this gives you

- A Postgres schema for events, teams, games, rosters, rankings
- Three Supabase Edge Functions to scrape on a schedule
- A `pg_cron` config to run them automatically
- A diagnostic function to verify USAU is even reachable from Supabase

## Drop-in setup

This folder is meant to live alongside your apps in a monorepo, OR as
a standalone repo:

```
ultimate-monorepo/
├── apps/
│   ├── web/        # Next.js
│   └── mobile/     # Expo
└── usau-scraper/   # this folder
```

OR

```
hunter/
├── ultimate-app/
└── usau-scraper/
```

## Quick start

Read `CLAUDE.md` and `TASKS.md`. Work through Phase 0 → Phase 5 in
`TASKS.md`. Don't skip Phase 1's reachability check — it determines
whether the architecture even works without a proxy layer.

## What's pre-built vs. what needs work

| Done                          | TODO (you / Claude Code)                |
| ----------------------------- | --------------------------------------- |
| Postgres schema               | Verify selectors against live HTML      |
| pg_cron schedule scaffold     | Pool play + bracket game parsers        |
| Three function skeletons      | Team-detail + roster scrapers           |
| Shared HTTP/parse/db helpers  | Reachability decision (proxy or not?)   |
| Run logging via `scrape_runs` | Apps' read-side RLS policies            |

## Why Supabase Edge Functions (not EC2/Fly.io)?

- Free tier: 500k function invocations/month, more than enough
- Same platform as your DB — one auth, one dashboard
- `pg_cron` schedules invocations from Postgres itself
- Deno + npm: imports = same TS world as your apps

See `docs/site-analysis.md` for the full breakdown and tradeoffs.
