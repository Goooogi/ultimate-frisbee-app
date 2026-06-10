# sql/

Reference copies of database objects (RPC functions, policies) that live in
Supabase but aren't managed by a migrations toolchain in this repo.

**These files are documentation, not a migration source.** Nothing auto-runs
them. The source of truth is the live Supabase project (The Layout —
`efjipdmylkqwmupvoxab`). When you change a function in Supabase, paste the new
`CREATE OR REPLACE` here so the repo has a readable, diffable record.

To pull the live definition of any function:

```sql
select pg_get_functiondef(oid)
from pg_proc
where proname = 'accept_team_invite';
```
