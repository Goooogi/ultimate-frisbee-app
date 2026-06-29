#!/usr/bin/env python3
"""Parse WUL CSV exports (Player Data + Team Data, per-game) and upsert into the
wul_* tables. Idempotent. Reads every wul-player-YYYY.csv + wul-team-YYYY.csv
pair in usau-scraper/data/wul/ and writes directly to Postgres via DATABASE_URL
(loaded from usau-scraper/.env or repo .env).

Usage:
  python3 ingest-wul.py            # all years found → upsert to DB
  python3 ingest-wul.py 2026       # one year
  python3 ingest-wul.py --counts   # parse only, report counts, no DB writes
  python3 ingest-wul.py --sql      # print SQL to stdout instead of writing

Game identity is derived (no game-id column in the source):
  id = '{season}/{date}/{AWAY_ABBR}-vs-{HOME_ABBR}'
Each game = the two Team-file rows sharing (date, {teamA,teamB}). Home/away:
WUL data isn't marked, so we treat the alphabetically-first team as 'away'
(stable + deterministic; there's no true home/away in the source).
"""
import csv, sys, glob, os, re
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'wul')

# Full team name → slug (matches wul_teams ids)
NAME_TO_SLUG = {
    'Los Angeles Astra': 'astra',
    'Colorado Alpenglow': 'alpenglow',
    'Bay Area Falcons': 'falcons',
    'Arizona Sidewinders': 'sidewinders',
    'Oregon Soar': 'soar',
    'Oregon Onyx': 'onyx',
    'San Diego Super Bloom': 'superbloom',
    'Seattle Tempest': 'tempest',
    'Utah Wild': 'wild',
}
SLUG_TO_ABBR = {
    'astra':'LA','alpenglow':'COL','falcons':'BAY','sidewinders':'AZ',
    'soar':'OR','onyx':'ORO','superbloom':'SD','tempest':'SEA','wild':'UT',
}

def slug(name):
    s = NAME_TO_SLUG.get(name.strip())
    if not s:
        raise SystemExit(f"UNKNOWN TEAM NAME: {name!r} — add to NAME_TO_SLUG")
    return s

def sql_str(v):
    if v is None: return 'null'
    return "'" + str(v).replace("'", "''") + "'"

def to_int(v):
    try: return int(float(v))
    except: return 0

def to_num(v):
    try:
        f = float(v); return int(f) if f == int(f) else f
    except: return 0

def iso_date(mdy):
    # "3-14-2026" → "2026-03-14"
    m = re.match(r'(\d{1,2})-(\d{1,2})-(\d{4})', mdy.strip())
    if not m: return None
    mm, dd, yyyy = m.groups()
    return f"{yyyy}-{int(mm):02d}-{int(dd):02d}"

def season_year(s):  # "2026 Regular Season" → 2026
    m = re.search(r'(\d{4})', s); return int(m.group(1)) if m else 0

def week_label(s):
    return 'post' if 'post' in s.lower() else 'regular'

def split_player(p):
    # "00 LP Aragon" → ('00', 'LP Aragon'); "Sarah Combs" (no jersey) → ('', name)
    parts = p.strip().split(' ', 1)
    if len(parts) == 2 and re.fullmatch(r'[A-Za-z]?\d{1,2}|\d{1,2}', parts[0]):
        return parts[0], parts[1].strip()
    return '', p.strip()

def game_id(season, date_iso, a_slug, b_slug):
    a_ab, b_ab = SLUG_TO_ABBR[a_slug], SLUG_TO_ABBR[b_slug]
    return f"{season}/{date_iso}/{a_ab}-vs-{b_ab}"

def build_games(team_rows):
    """Return {game_id: {...}} from paired team rows."""
    by_match = defaultdict(list)
    for r in team_rows:
        season = season_year(r['Season'])
        d = iso_date(r['Date'])
        key = (season, d, frozenset([slug(r['Team']), slug(r['Opponent'])]))
        by_match[key].append(r)
    games = {}
    for (season, d, pair), rows in by_match.items():
        if len(rows) != 2:
            print(f"-- WARN unpaired game {season} {d} {[r['Team'] for r in rows]}", file=sys.stderr)
            continue
        slugs = sorted(slug(rows[0]['Team']) for _ in [0])  # placeholder
        a_slug, b_slug = sorted([slug(rows[0]['Team']), slug(rows[1]['Team'])])
        ra = next(r for r in rows if slug(r['Team']) == a_slug)
        rb = next(r for r in rows if slug(r['Team']) == b_slug)
        gid = game_id(season, d, a_slug, b_slug)
        games[gid] = {
            'id': gid, 'season': season, 'week_label': week_label(ra['Season']),
            'game_date': d, 'away_team_id': a_slug, 'home_team_id': b_slug,
            'away_abbrev': SLUG_TO_ABBR[a_slug], 'home_abbrev': SLUG_TO_ABBR[b_slug],
            'away_score': to_int(ra['G']), 'home_score': to_int(rb['G']),
        }
    return games

def player_game_id(p):
    season = season_year(p['Season']); d = iso_date(p['Date'])
    a_slug, b_slug = sorted([slug(p['Team']), slug(p['Opponent'])])
    return game_id(season, d, a_slug, b_slug)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    counts_only = '--counts' in sys.argv
    years = args or sorted({
        re.search(r'wul-player-(\d{4})\.csv', os.path.basename(f)).group(1)
        for f in glob.glob(os.path.join(DATA_DIR, 'wul-player-*.csv'))
    })
    if not years:
        raise SystemExit("No wul-player-YYYY.csv files found in data/wul/")

    all_games = {}
    gps_rows = []          # per-game player stats
    season_players = defaultdict(lambda: defaultdict(int))  # (name,team,season) -> {stat: total}
    season_meta = {}       # (name,team,season) -> jersey

    for yr in years:
        pf = os.path.join(DATA_DIR, f'wul-player-{yr}.csv')
        tf = os.path.join(DATA_DIR, f'wul-team-{yr}.csv')
        if not (os.path.exists(pf) and os.path.exists(tf)):
            print(f"-- SKIP {yr}: missing pair", file=sys.stderr); continue
        with open(tf) as f: team_rows = [r for r in csv.DictReader(f) if r.get('Team')]
        with open(pf) as f: player_rows = [r for r in csv.DictReader(f) if r.get('Player')]

        games = build_games(team_rows)
        all_games.update(games)

        for p in player_rows:
            season = season_year(p['Season'])
            jersey, name = split_player(p['Player'])
            tslug = slug(p['Team'])
            gid = player_game_id(p)
            if gid not in games:
                print(f"-- WARN player row no game: {name} {p['Date']}", file=sys.stderr); continue
            pm = to_num(p['+/-'])
            gps_rows.append({
                'game_id': gid, 'team_id': tslug, 'player_name': name, 'jersey_number': jersey,
                'goals': to_int(p['G']), 'assists': to_int(p['A']), 'blocks': to_int(p['B']),
                'turnovers': to_int(p['T']), 'touches': to_int(p['Tch']),
                'o_points': to_int(p['OPP']), 'd_points': to_int(p['DPP']),
                'points_played': to_int(p['PP']), 'plus_minus': pm,
                'callahans': to_int(p['S']), 'hucks_completed': to_int(p['HCom']),
                'throw_yards': to_int(p['ThY']), 'receive_yards': to_int(p['RecY']),
                'total_yards': to_int(p['Y']), 'completions': to_int(p['Com']), 'throws': to_int(p['Th']),
            })
            k = (name, tslug, season)
            season_meta[k] = jersey
            agg = season_players[k]
            agg['games_played'] += 1
            agg['goals'] += to_int(p['G']); agg['assists'] += to_int(p['A'])
            agg['blocks'] += to_int(p['B']); agg['turnovers'] += to_int(p['T'])
            agg['touches'] += to_int(p['Tch']); agg['o_points'] += to_int(p['OPP'])
            agg['d_points'] += to_int(p['DPP']); agg['callahans'] += to_int(p['S'])
            agg['hucks_completed'] += to_int(p['HCom']); agg['yards_total'] += to_int(p['Y'])
            # plus_minus is fractional — accumulate separately
            agg['plus_minus_x2'] += int(round(pm*2))

    if counts_only:
        print(f"games={len(all_games)} gps_rows={len(gps_rows)} season_players={len(season_players)}", file=sys.stderr)
        return

    out = []
    # games
    for g in all_games.values():
        out.append(
            "insert into wul_games (id,season,week_label,game_date,away_team_id,home_team_id,"
            "away_abbrev,home_abbrev,away_score,home_score,status) values ("
            f"{sql_str(g['id'])},{g['season']},{sql_str(g['week_label'])},{sql_str(g['game_date'])},"
            f"{sql_str(g['away_team_id'])},{sql_str(g['home_team_id'])},{sql_str(g['away_abbrev'])},"
            f"{sql_str(g['home_abbrev'])},{g['away_score']},{g['home_score']},'final') "
            "on conflict (id) do update set away_score=excluded.away_score,"
            "home_score=excluded.home_score,week_label=excluded.week_label,updated_at=now();"
        )
    # season players
    for (name, tslug, season), a in season_players.items():
        pm = a['plus_minus_x2'] / 2
        out.append(
            "insert into wul_players (player_name,jersey_number,team_id,season,games_played,goals,"
            "assists,blocks,turnovers,touches,o_points,d_points,plus_minus,callahans,hucks_completed,yards_total) values ("
            f"{sql_str(name)},{sql_str(season_meta[(name,tslug,season)])},{sql_str(tslug)},{season},"
            f"{a['games_played']},{a['goals']},{a['assists']},{a['blocks']},{a['turnovers']},{a['touches']},"
            f"{a['o_points']},{a['d_points']},{pm},{a['callahans']},{a['hucks_completed']},{a['yards_total']}) "
            "on conflict (player_name,team_id,season) do update set games_played=excluded.games_played,"
            "goals=excluded.goals,assists=excluded.assists,blocks=excluded.blocks,turnovers=excluded.turnovers,"
            "touches=excluded.touches,o_points=excluded.o_points,d_points=excluded.d_points,"
            "plus_minus=excluded.plus_minus,callahans=excluded.callahans,hucks_completed=excluded.hucks_completed,"
            "yards_total=excluded.yards_total,jersey_number=excluded.jersey_number,updated_at=now();"
        )
    # per-game player stats
    for r in gps_rows:
        out.append(
            "insert into wul_game_player_stats (game_id,team_id,player_name,jersey_number,goals,assists,"
            "blocks,turnovers,touches,o_points,d_points,points_played,plus_minus,callahans,hucks_completed,"
            "throw_yards,receive_yards,total_yards,completions,throws) values ("
            f"{sql_str(r['game_id'])},{sql_str(r['team_id'])},{sql_str(r['player_name'])},{sql_str(r['jersey_number'])},"
            f"{r['goals']},{r['assists']},{r['blocks']},{r['turnovers']},{r['touches']},{r['o_points']},{r['d_points']},"
            f"{r['points_played']},{r['plus_minus']},{r['callahans']},{r['hucks_completed']},{r['throw_yards']},"
            f"{r['receive_yards']},{r['total_yards']},{r['completions']},{r['throws']}) "
            "on conflict (game_id,team_id,player_name) do update set goals=excluded.goals,assists=excluded.assists,"
            "blocks=excluded.blocks,turnovers=excluded.turnovers,touches=excluded.touches,o_points=excluded.o_points,"
            "d_points=excluded.d_points,points_played=excluded.points_played,plus_minus=excluded.plus_minus,"
            "callahans=excluded.callahans,hucks_completed=excluded.hucks_completed,throw_yards=excluded.throw_yards,"
            "receive_yards=excluded.receive_yards,total_yards=excluded.total_yards,completions=excluded.completions,"
            "throws=excluded.throws,updated_at=now();"
        )

    print(f"-- parsed: {len(all_games)} games, {len(gps_rows)} box rows, "
          f"{len(season_players)} season players → {len(out)} statements", file=sys.stderr)

    if '--sql' in sys.argv:
        print("begin;\n" + "\n".join(out) + "\ncommit;")
        return

    # --sql-files DIR : write batched multi-statement SQL files for MCP apply.
    if '--sql-files' in sys.argv:
        outdir = sys.argv[sys.argv.index('--sql-files') + 1]
        os.makedirs(outdir, exist_ok=True)
        BATCH = 120
        n = 0
        for i in range(0, len(out), BATCH):
            n += 1
            with open(os.path.join(outdir, f'wul-batch-{n:02d}.sql'), 'w') as f:
                f.write("\n".join(out[i:i+BATCH]))
        print(f"-- wrote {n} batch files to {outdir}", file=sys.stderr)
        return

    # Execute directly via psycopg using DATABASE_URL (direct, not pooled).
    dburl = load_database_url()
    import psycopg
    with psycopg.connect(dburl, autocommit=False) as conn:
        with conn.cursor() as cur:
            for stmt in out:
                cur.execute(stmt)
        conn.commit()
    print(f"-- committed {len(out)} statements to DB", file=sys.stderr)

PROJECT_REF = 'efjipdmylkqwmupvoxab'
POOLER_HOST = 'aws-1-us-east-1.pooler.supabase.com'  # this project's region (.temp/pooler-url)

def _read_env(*keys):
    """Find the first of `keys` in env or the repo/scraper .env files."""
    for k in keys:
        if os.environ.get(k):
            return os.environ[k]
    candidates = [
        os.path.join(os.path.dirname(__file__), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
    ]
    for path in candidates:
        if not os.path.exists(path): continue
        for line in open(path):
            line = line.strip()
            for k in keys:
                if line.startswith(k + '='):
                    return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

def load_database_url():
    """Build the session-pooler URL from SUPABASE_DB_PASSWORD. We deliberately do
    NOT use any POOLED_DATABASE_URL from .env — the one present points at the
    wrong pooler region (aws-0); this project's is aws-1 (see .temp/pooler-url).
    The direct db.<ref>.supabase.co host is unresolvable from here, so the
    session pooler (port 5432, user postgres.<ref>) is the path that works."""
    import urllib.parse
    pw = _read_env('SUPABASE_DB_PASSWORD')
    if not pw:
        raise SystemExit("No SUPABASE_DB_PASSWORD in env/.env")
    pw_enc = urllib.parse.quote(pw, safe='')
    return f"postgresql://postgres.{PROJECT_REF}:{pw_enc}@{POOLER_HOST}:5432/postgres"

if __name__ == '__main__':
    main()
