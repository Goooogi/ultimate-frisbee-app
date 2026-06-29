# USAU Scraper — Claude Code Context

This project is a **Supabase-based scraper** that pulls public data from
USA Ultimate's Score Reporter (`play.usaultimate.org`) into Postgres for
consumption by an ultimate frisbee web + mobile app.

You (Claude Code) are working with Hunter to finish building this out.
Read this whole file before doing anything.

## Stack

- **Runtime**: Supabase Edge Functions (Deno), invoked by `pg_cron`
- **DB**: Supabase Postgres
- **Scraping**: `npm:cheerio` (Deno's npm: imports) over HTML
- **No EC2, no Fly.io, no separate server** — everything runs inside Supabase

## Current state — what's done vs. what's TODO

Hunter generated this as a **starter mockup**. The code compiles and the
structure is sound, but most parsers contain **placeholder selectors** that
need verification against live HTML. See `TASKS.md` for the ordered work
queue.

## Critical context you need before touching anything

### 1. USAU blocks server-side requests from cloud IPs

USAU's WAF returns 403 to requests from many datacenter IP ranges.
Supabase Edge Functions run on Deno Deploy infrastructure — they MAY or
MAY NOT be blocked depending on the egress IP.

**Before doing any other work**, deploy and run
`supabase/functions/diagnose-reachability/` to confirm whether functions can
actually reach USAU. If it returns 403, the whole architecture needs a
proxy layer (Cloudflare Worker or a residential proxy like Bright Data ~$15/mo).
Do NOT skip this check.

### 2. Selectors are placeholder

`supabase/functions/_shared/parse.ts` has CSS selectors informed by community
Python scrapers (erin2722/usau-scraper, azjps/usau-py). They have NOT been
verified against current USAU HTML.

Verify selectors by:
1. Opening the relevant page in Chrome
2. Inspecting the actual DOM
3. Updating `SELECTORS` in `parse.ts`
4. Re-running the function locally

Each parser has a `assertNonEmpty()` sanity check — if a parser returns 0
rows, IT DOES NOT WRITE TO THE DB. This protects existing data from being
overwritten by bad scrapes.

### 3. ToS / rate limiting

- Be polite: 2s minimum between requests (enforced in `_shared/http.ts`)
- Don't scrape login-gated pages (Hunter has an account but doing so adds
  ToS risk and isn't needed for public app data)
- Hunter is a USAU member and plans to email them about the project before
  going public — keep that path open by not being abusive

## Architecture (one paragraph)

USAU HTML pages → fetched by Edge Functions on cron → parsed with cheerio
→ upserted into Postgres → Next.js web app and Expo mobile app read from
Postgres via Supabase client. Apps never touch USAU directly.

## File map

```
usau-scraper/
├── CLAUDE.md              ← you are here
├── README.md              human-oriented overview
├── TASKS.md               ordered work queue — START HERE after reading this
├── docs/
│   ├── site-analysis.md   URL patterns, data model, what to scrape
│   ├── selectors.md       per-page selector cheat sheet (fill in as you verify)
│   └── deploy.md          step-by-step deploy + cron setup
├── supabase/
│   ├── config.toml        supabase project config (project_id is a placeholder)
│   ├── migrations/
│   │   ├── 0001_init.sql        schema (tables, types, indexes, triggers)
│   │   └── 0002_cron.sql        pg_cron schedules (run AFTER functions deployed)
│   └── functions/
│       ├── _shared/             http, parse, supabase client helpers
│       ├── diagnose-reachability/   ← RUN THIS FIRST
│       ├── sync-events/         tournament calendar
│       ├── sync-event-details/  per-event teams + games
│       └── sync-rankings/       weekly rankings per division
```

## Conventions

- **Idempotency**: every DB write is an `upsert` with `onConflict`. Re-running
  a job is always safe.
- **Run logging**: every job calls `withRunLogging()` from `_shared/supabase.ts`
  which writes to the `scrape_runs` table for observability.
- **Sanity checks**: every parser calls `assertNonEmpty()` after parsing.
  If selectors drift and rows come back empty, the function throws and
  doesn't write garbage to the DB.
- **Logging**: `console.log` / `console.error` — Supabase captures these in
  function logs visible in the dashboard.

## Don't do these things

- Don't add any `localStorage`, `sessionStorage`, or browser storage APIs (this is server code, but flagging because Hunter's apps use Claude artifacts too)
- Don't add Node-specific code — these are **Deno** functions. Use `Deno.env.get()`, `Deno.serve()`, and `npm:` imports.
- Don't scrape pages that require login
- Don't bypass the 2s rate limit in `_shared/http.ts`
- Don't write to the DB if a parser returned 0 rows where rows were expected — the existing `assertNonEmpty` guards this; don't remove them
- Don't commit secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are env vars in Supabase, never in code

## When you finish a task

- Update `TASKS.md` to check off the completed item
- If you discovered something about the site (a new selector, a quirk, an
  endpoint), write it into `docs/selectors.md` or `docs/site-analysis.md`
- Commit messages should be descriptive: `feat(sync-events): real selectors verified`
  not `update`
