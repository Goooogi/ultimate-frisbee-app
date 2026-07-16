# Supabase migrations — The Layout

These `.sql` files are the version-controlled source of truth for the
database schema, RLS policies, functions, and cron jobs. They were
reconstructed from the remote project's applied migration history
(`supabase_migrations.schema_migrations` on `efjipdmylkqwmupvoxab`) on
2026-07-15, when the project previously had no local migrations folder.

## Hard rule: never commit a secret literal

Migration files are plaintext and version-controlled. A service-role key,
JWT, or API key must **never** appear as a literal in a migration.

- Seed Vault secrets **out-of-band** (dashboard / `supabase secrets` / an
  uncommitted one-off `psql` session), then reference them in SQL via
  `(select decrypted_secret from vault.decrypted_secrets where name = '...')`.
- `20260522190036_schedule_sync_live_events.sql` originally inlined the live
  service-role key. It has been redacted to `<SERVICE_ROLE_KEY_REDACTED>` and
  the real key was rotated. On a fresh/reset DB, create the Vault secret
  manually before running that migration.

## Working with these

- Add new changes as new timestamped migration files (don't edit applied ones).
- `supabase db diff` / `supabase migration new` to author; `supabase db push`
  to apply to the linked remote.
