# Deploy

## Prereqs

```bash
brew install supabase/tap/supabase
supabase login
```

## One-time project setup

```bash
cd usau-scraper
supabase link --project-ref <YOUR_PROJECT_REF>
```

Then edit `supabase/config.toml` and set `project_id` to your project ref.

## Push the schema

```bash
supabase db push
```

Verify in Studio: `events`, `teams`, `event_teams`, `games`, `players`,
`rosters`, `rankings`, `scrape_runs` should all exist.

## Deploy a function

```bash
supabase functions deploy diagnose-reachability
supabase functions deploy sync-events
supabase functions deploy sync-event-details
supabase functions deploy sync-rankings
```

Functions auto-get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
the project — no manual env setup needed.

## Invoke a function manually

```bash
ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY)
REF=$(supabase status -o json | jq -r .API_URL | sed 's|https://||; s|.supabase.co||')

# Diagnostic
curl https://$REF.supabase.co/functions/v1/diagnose-reachability \
  -H "Authorization: Bearer $ANON_KEY"

# sync-events
curl https://$REF.supabase.co/functions/v1/sync-events \
  -H "Authorization: Bearer $ANON_KEY"

# sync-event-details for a single event
curl -X POST https://$REF.supabase.co/functions/v1/sync-event-details \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"2025-USAU-Pro-Championships"}'

# sync-rankings
curl https://$REF.supabase.co/functions/v1/sync-rankings \
  -H "Authorization: Bearer $ANON_KEY"
```

## Local dev

```bash
# Start a local Supabase
supabase start

# Serve a function locally without JWT verification
supabase functions serve sync-events --no-verify-jwt --env-file .env.local

# Hit it
curl http://localhost:54321/functions/v1/sync-events
```

Create `.env.local` for local dev:
```
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
```

## Schedule with pg_cron

Once functions are deployed and tested, run the cron migration:

```bash
# Edit supabase/migrations/0002_cron.sql first — replace placeholders
# OR set up Vault secrets first (recommended):
```

In Supabase SQL editor:
```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
```

Then:
```bash
supabase db push  # picks up 0002_cron.sql
```

Verify the cron jobs registered:
```sql
select * from cron.job;
```

After a day, verify they ran:
```sql
select * from cron.job_run_details order by start_time desc limit 20;
select * from scrape_runs order by started_at desc limit 20;
```

## View logs

```bash
supabase functions logs sync-events
```

Or in the Supabase dashboard → Edge Functions → pick a function → Logs tab.
