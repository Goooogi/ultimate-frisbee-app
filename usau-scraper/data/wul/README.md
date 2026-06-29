# WUL CSV drop folder

Manual exports from the WUL Stats Dashboard
(`https://westernultimateleague.shinyapps.io/stats/`) go here. WUL has no API
(the dashboard is a websocket-rendered R Shiny app), so the CSV download buttons
are the data source. The ingest script reads from this folder.

## What to drop
Export everything the dashboard offers, from BOTH tabs, all seasons (2021–2026):

- **Player Data** — ideally at the **per-game grain** (every player's line in every
  game). This is what powers game pages + box scores. Season totals alone only
  give player profiles, not matchup pages.
- **Team Data** / game results.

## Naming (loose — adapt as needed)
- `wul-player-games-<year>.csv`  (or `wul-player-games-all.csv` if combined)
- `wul-player-season-<year>.csv`
- `wul-games-<year>.csv` / `wul-team-<year>.csv`
- If only one big "full spreadsheet" per tab: `wul-player-full.csv`, `wul-team-full.csv`

Messy-but-complete beats nothing — I'll adapt the parser to whatever grain/columns
come out. Full ingestion plan: see memory `project-wul-ingestion-plan`.
