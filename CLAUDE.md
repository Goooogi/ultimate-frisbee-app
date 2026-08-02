# The Layout — web app

## Read the vault FIRST, every fresh session

Project notes live in the Obsidian vault, **not** in this repo:

```
/Users/huntermay/Documents/Zeus/Clients/the-layout/
```

Before answering anything about in-flight work, pending changes, or "what were we
doing" — **read the vault**. Start with `The Layout Project Overview.md`, then the
note matching the area you're touching. Do not ask Hunter questions the vault
already answers, and do not conclude "nothing is pending" from `git status` alone:
work is often documented in the vault before it's written, and left uncommitted.

Notes are appended chronologically — **the newest entries are at the BOTTOM of the
file**. Read to the end.

Key notes by area:

| Area | Note |
|---|---|
| Anything | `The Layout Project Overview.md` |
| Player profiles, shared RPC, cross-league merge | `Player Profile RPC Migration.md` |
| USAU ingestion, scrapers, cron | `USAU Scraper Pipeline.md`, `USAU Masters Ingestion Plan.md` |
| Mobile parity | `Mobile Web Alignment.md` |
| UTCG card game | `UTCG Card Game.md` |
| Fantasy | `Fantasy Feature.md` · 12-0 → `12-0 Mini Game.md` |
| Styling | `V2 Redesign — Editorial Calm.md` + `docs/redesign-v2-style-guide.md` |

Write notes back to the vault when something is worth carrying forward
(architecture decisions and why, gotchas that cost real time, infra quirks).
Append to the existing note rather than creating a near-duplicate.

## Shared Supabase project

`efjipdmylkqwmupvoxab` is **shared with the mobile Expo repo**
(`/Users/huntermay/git/altiusapps/mobileapp-thelayout`). Mobile writes migrations
and RPCs against the same DB. That means:

- Changes mobile makes to a shared RPC can require a **web-side port** with no
  git signal in this repo. `Player Profile RPC Migration.md` tracks these under
  its follow-up checklists.
- Some migrations exist **only in the remote DB**, not in either repo, so the
  deployed function body diverges from committed SQL. Never `create or replace`
  a shared function from committed text — patch `prosrc` (see the 20260729 and
  20260801 migrations for the pattern).
- New SQL functions need `notify pgrst, 'reload schema'` or browser `.rpc()`
  calls 404 even though direct SQL works.

## Open web-side ports from mobile (as of 2026-08-01)

- `findUsauPlayerByName()` in `src/lib/usau/data.ts:1007` still uses a raw-column
  `.ilike` — swap to the `find_usau_player_by_name` RPC (accent-insensitive).
- `shouldAttachUfa()` in `src/lib/unified-player-rpc.ts:334` has a Canadian-province
  false positive — filter `ufaStates` to US codes before comparing, or real UFA
  careers get dropped.
- The mapper in `src/lib/unified-player-rpc.ts` ignores the new `usauClusterIds`
  payload key — push each as a `('usau', id)` content ref.
