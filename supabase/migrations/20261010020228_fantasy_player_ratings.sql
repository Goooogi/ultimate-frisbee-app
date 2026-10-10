-- Fantasy player ratings: the ranked list for event contests (Hunter, 2026-10-09).
--
-- Hunter's order for a Nationals pool, using only the player's own history at
-- the event's level (Club history for Club Nationals):
--   S   average goals + assists per event, over past events where stats were
--       kept for the player's team (USAU keeps no blocks)
--   A1  Nationals attended
--   A2  TCT events attended (U.S. Open, Pro Championships / Pro Flight Finale)
--   B1  Pro-Elite Challenge  B2  Elite-Select Challenge  B3  Select Flight Invite
--   then everyone else, A–Z.
-- "Autodraft takes the top player on the list": fantasy_draft_best_available
-- reads these rows, after the team's queue (run_clock and auction_advance
-- already try the queue first).
--
-- WHY A CACHE TABLE: building one pool takes a few seconds (~1,250 players,
-- ~16k same-name stints, ~56k roster rows). App Health rule 1 keeps that off
-- every read path and out of the 10 s draft tick. fantasy_refresh_player_ratings()
-- runs hourly at :44 (clear of the */3, */5, :07/:22/:37/:52, :41 and :53 jobs)
-- and rebuilds an event only when its roster changed or its rows are a day old.
-- Rosters sync every 3 h at :10.
--
-- GOTCHAS this encodes:
--   • USAU ids are per season + team (Jimmy Mickle has 15 usau_players rows),
--     so a career is every stint with the same lowercased name, as on the
--     player profile, plus the double-space variants the scraper stores
--     ("Sam  Hill"). Namesakes are split two ways: a Women's player never takes
--     a Men's-team stint (or the reverse; Mixed fits either), and a season with
--     two Series teams (sectionals/regionals/conferences/Nationals — one per
--     person) is two people: only the team continuing the player's chain of
--     team names stays. Stints seen only at TCT or regular-season events stay
--     (players guest at the U.S. Open for other clubs).
--   • usau_events.flight_rank misses the 2014–2022 Nationals ("USA Ultimate
--     National Championships 2019" is rank 9), so Nationals is a name rule.
--     usau_is_nationals_name() mirrors isNationalsChampionshipName() in
--     src/lib/usau/data.ts — KEEP IN SYNC. Flights go by template_key where it
--     is set (2025 "Pro-Elite Plus" is a 3-team side event at flight_rank 1).
--   • Stat lines are often fragments (2022 Pro-Elite: SoCal Condors scored 80
--     goals, its lines total 2). A player's own line always counts; a missing
--     line reads as 0 only when the team's lines hold 80% of the goals it
--     scored (or, without scores, cover half its roster).
--   • Six TCT/flight events have no per-event rosters (2024 U.S. Open, 2018/2019
--     Pro-Elite…): attendance there comes from the season roster of each team
--     in usau_event_teams. Team ids are per season.
--   • fantasy_draft_best_available is shared with the mobile app: patched in
--     place from the live body, guarded on its md5 (1f0d7866… on 2026-10-09).

-- ── Nationals name rule ─────────────────────────────────────────────────────
create or replace function public.usau_is_nationals_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select n !~ '(regional|sectional|conference)'
     and n !~ '(u\.?\s?s\.?\s?open|pro[- ]?championship|pro[- ]?elite|tune ?up|warm ?up|\yinvite\y)'
     and n !~ '(wucc|wmucc|wjuc|worlds?\y)'
     and n !~ '(high school|middle school|\yyouth\y|state championship)'
     and n ~ '(national championship|club nationals|club championship|college championship|masters championship)'
  from (select lower(coalesce(p_name, ''))) as t(n);
$$;

revoke execute on function public.usau_is_nationals_name(text) from public, anon, authenticated;

-- ── The cache ───────────────────────────────────────────────────────────────
create table public.fantasy_player_ratings (
  event_id            uuid         not null,
  player_league       text         not null,
  player_id           text         not null,
  player_name         text         not null,
  team_name           text,
  rank                integer      not null,
  tier                text         not null check (tier in ('S', 'A', 'B', 'C')),
  stat_events         integer      not null,
  avg_goals           numeric(6,2) not null,
  avg_assists         numeric(6,2) not null,
  nationals           integer      not null,
  tct_events          integer      not null,
  pro_elite_events    integer      not null,
  elite_select_events integer      not null,
  select_events       integer      not null,
  computed_at         timestamptz  not null default now(),
  primary key (event_id, player_league, player_id),
  unique (event_id, player_league, rank)
);

comment on table public.fantasy_player_ratings is
  'Ranked draft pool per real event (usau_events.id). Written only by '
  'fantasy_rebuild_player_ratings; read by the draft room, the Players tab and '
  'fantasy_draft_best_available. tier: S = scored at past events, A = Nationals/TCT, '
  'B = flight events only, C = no history at this level.';

alter table public.fantasy_player_ratings enable row level security;

create policy "fantasy_player_ratings public read"
  on public.fantasy_player_ratings
  for select
  to anon, authenticated
  using (true);

-- revoke all, not a list: the default ACL also grants PG17's MAINTAIN.
revoke all on public.fantasy_player_ratings from anon, authenticated;
grant select on public.fantasy_player_ratings to anon, authenticated;

-- ── Builder ─────────────────────────────────────────────────────────────────
create or replace function public.fantasy_rebuild_player_ratings(p_event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.usau_events;
  v_rows  integer;
begin
  select * into v_event from public.usau_events where id = p_event;
  if not found then
    raise exception 'fantasy_rebuild_player_ratings: no usau_events row %', p_event;
  end if;

  -- Overlapping rebuilds of one event queue here instead of colliding on the keys.
  perform pg_advisory_xact_lock(hashtext('fantasy_player_ratings'), hashtext(p_event::text));

  delete from public.fantasy_player_ratings
  where event_id = p_event and player_league = 'usau';

  insert into public.fantasy_player_ratings (
    event_id, player_league, player_id, player_name, team_name, rank, tier,
    stat_events, avg_goals, avg_assists, nationals, tct_events,
    pro_elite_events, elite_select_events, select_events, computed_at
  )
  with pool as (
    -- The draft pool: the event's own roster, one row per player.
    select r.player_id,
           up.display_name,
           (array_agg(r.team_id order by r.team_id))[1] as team_id
    from public.usau_rosters r
    join public.usau_players up on up.id = r.player_id
    where r.event_id = p_event
    group by r.player_id, up.display_name
  ),
  stints as (
    select p.player_id as pool_id, up.id as stint_id
    from pool p
    cross join lateral (
      select lower(btrim(regexp_replace(p.display_name, '\s+', ' ', 'g'))) as clean
    ) n
    join public.usau_players up
      on lower(up.display_name) in (lower(p.display_name), n.clean, regexp_replace(n.clean, ' ', '  '))
  ),
  events as (
    -- This level's events up to this one's start.
    select e.id,
           e.season,
           e.start_date < v_event.start_date and e.id <> p_event as is_history,
           e.series_stage is not null or public.usau_is_nationals_name(e.name) as is_series,
           not exists (select 1 from public.usau_rosters r where r.event_id = e.id) as no_event_rosters,
           case
             when public.usau_is_nationals_name(e.name) then 'nationals'
             when e.template_key in ('us_open', 'pro_championships')
               or (e.template_key is null and e.flight_rank = 0)
               or public.usau_normalize_event_name(e.name) ~ 'pro (flight )?finale' then 'tct'
             when e.template_key in ('pro_elite_east', 'pro_elite_west')
               or (e.template_key is null
                   and public.usau_normalize_event_name(e.name) ~ 'pro elite challenge') then 'pro_elite'
             when e.template_key = 'elite_select'
               or (e.template_key is null and e.flight_rank = 2) then 'elite_select'
             when e.template_key in ('select_flight_east', 'select_flight_west')
               or (e.template_key is null and e.flight_rank = 3) then 'select'
             else 'other'
           end as kind
    from public.usau_events e
    where e.competition_level = v_event.competition_level
      and e.start_date <= v_event.start_date
  ),
  history as (
    select id, kind, no_event_rosters from events where is_history
  ),
  stint_rows as (
    -- Every roster row of those stints on a team at this level that fits the
    -- pool player's division: no Men's stints for a Women's player or the
    -- reverse (Mixed fits either).
    select s.pool_id, s.stint_id, r.event_id, r.team_id, r.season, t.name as team_name
    from stints s
    join pool p on p.player_id = s.pool_id
    left join public.usau_teams pt on pt.id = p.team_id
    join public.usau_rosters r on r.player_id = s.stint_id
    join public.usau_teams t on t.id = r.team_id
    where t.competition_level = v_event.competition_level
      and not (coalesce(pt.gender_division::text, '') = 'Women' and coalesce(t.gender_division::text, '') = 'Men')
      and not (coalesce(pt.gender_division::text, '') = 'Men' and coalesce(t.gender_division::text, '') = 'Women')
  ),
  series_rows as (
    select sr.pool_id, sr.stint_id, sr.season, sr.team_id, sr.team_name
    from stint_rows sr
    join events e on e.id = sr.event_id and e.is_series
  ),
  series_seasons as (
    select pool_id, season, count(distinct team_id) as teams
    from series_rows
    group by pool_id, season
  ),
  chain_names as (
    -- The pool player's own team, and their Series team in every other season
    -- that has just one.
    select p.player_id as pool_id, t.name as team_name
    from pool p
    join public.usau_teams t on t.id = p.team_id
    union
    select sr.pool_id, sr.team_name
    from series_rows sr
    join series_seasons ss on ss.pool_id = sr.pool_id and ss.season = sr.season
    where ss.teams = 1 and sr.season <> v_event.season
  ),
  season_chain as (
    select sr.pool_id, sr.season, count(distinct sr.team_id) as chain_teams
    from series_rows sr
    join series_seasons ss on ss.pool_id = sr.pool_id and ss.season = sr.season and ss.teams > 1
    join chain_names cn on cn.pool_id = sr.pool_id and cn.team_name = sr.team_name
    group by sr.pool_id, sr.season
  ),
  namesakes as (
    -- Two Series teams in one season are two people: keep only the stint whose
    -- team is the single one continuing the chain. The pool player's own
    -- stint always stays.
    select distinct sr.pool_id, sr.stint_id
    from series_rows sr
    join series_seasons ss on ss.pool_id = sr.pool_id and ss.season = sr.season and ss.teams > 1
    left join season_chain sc on sc.pool_id = sr.pool_id and sc.season = sr.season
    where sr.stint_id <> sr.pool_id
      and not (
        coalesce(sc.chain_teams, 0) = 1
        and exists (
          select 1 from chain_names cn where cn.pool_id = sr.pool_id and cn.team_name = sr.team_name
        )
      )
  ),
  career_stints as (
    select distinct sr.pool_id, sr.stint_id
    from stint_rows sr
    where not exists (
      select 1 from namesakes ns where ns.pool_id = sr.pool_id and ns.stint_id = sr.stint_id
    )
  ),
  attended as (
    -- Rostered at the event, or a stat line there…
    select sr.pool_id, sr.event_id, sr.team_id
    from stint_rows sr
    join career_stints cs on cs.pool_id = sr.pool_id and cs.stint_id = sr.stint_id
    where sr.event_id is not null
    union
    select cs.pool_id, st.event_id, st.team_id
    from career_stints cs
    join public.usau_player_event_stats st on st.player_id = cs.stint_id
    union
    -- …or, where the event has no per-event rosters, on the roster (that
    -- season) of a team that played it.
    select sr.pool_id, et.event_id, sr.team_id
    from stint_rows sr
    join career_stints cs on cs.pool_id = sr.pool_id and cs.stint_id = sr.stint_id
    join public.usau_event_teams et on et.team_id = sr.team_id
    join history h on h.id = et.event_id and h.no_event_rosters
  ),
  lines as (
    select st.event_id, st.team_id, count(*) as lines, sum(coalesce(st.goals, 0)) as goals
    from public.usau_player_event_stats st
    join history h on h.id = st.event_id
    group by st.event_id, st.team_id
  ),
  scored_goals as (
    select g.event_id, x.team_id, sum(x.score) as goals
    from (select distinct event_id from lines) le
    join public.usau_games g on g.event_id = le.event_id
    cross join lateral (values (g.team_a_id, g.score_a), (g.team_b_id, g.score_b)) as x(team_id, score)
    where x.team_id is not null and x.score is not null
    group by g.event_id, x.team_id
  ),
  covered as (
    -- Lines complete enough that a rostered player without one scored 0.
    select l.event_id, l.team_id
    from lines l
    left join scored_goals sg on sg.event_id = l.event_id and sg.team_id = l.team_id
    where case
            when coalesce(sg.goals, 0) > 0 then l.goals >= 0.8 * sg.goals
            else l.lines >= 0.5 * (
              select count(*) from public.usau_rosters r
              where r.event_id = l.event_id and r.team_id = l.team_id
            )
          end
  ),
  per_event as (
    select a.pool_id, a.event_id, h.kind,
           bool_or(c.event_id is not null) as team_covered
    from attended a
    join history h on h.id = a.event_id
    left join covered c on c.event_id = a.event_id and c.team_id = a.team_id
    group by a.pool_id, a.event_id, h.kind
  ),
  event_lines as (
    -- One line per player per event; a same-name twin at the same event
    -- keeps the bigger line rather than adding to it.
    select distinct on (cs.pool_id, st.event_id)
           cs.pool_id, st.event_id,
           coalesce(st.goals, 0) as goals,
           coalesce(st.assists, 0) as assists
    from career_stints cs
    join public.usau_player_event_stats st on st.player_id = cs.stint_id
    join history h on h.id = st.event_id
    order by cs.pool_id, st.event_id, coalesce(st.goals, 0) + coalesce(st.assists, 0) desc
  ),
  career as (
    -- An event counts toward the average when the player has a line there or
    -- the team's lines are complete.
    select pe.pool_id,
           count(*) filter (where pe.team_covered or el.pool_id is not null) as stat_events,
           coalesce(sum(el.goals), 0) as goals,
           coalesce(sum(el.assists), 0) as assists,
           count(*) filter (where pe.kind = 'nationals') as nationals,
           count(*) filter (where pe.kind = 'tct') as tct_events,
           count(*) filter (where pe.kind = 'pro_elite') as pro_elite_events,
           count(*) filter (where pe.kind = 'elite_select') as elite_select_events,
           count(*) filter (where pe.kind = 'select') as select_events
    from per_event pe
    left join event_lines el on el.pool_id = pe.pool_id and el.event_id = pe.event_id
    group by pe.pool_id
  ),
  scored as (
    select p.player_id,
           p.display_name,
           t.name as team_name,
           coalesce(c.stat_events, 0) as stat_events,
           coalesce(c.goals, 0) as goals,
           coalesce(c.assists, 0) as assists,
           case when coalesce(c.stat_events, 0) > 0
                then (c.goals + c.assists)::numeric / c.stat_events
                else 0 end as avg_ga,
           coalesce(c.nationals, 0) as nationals,
           coalesce(c.tct_events, 0) as tct_events,
           coalesce(c.pro_elite_events, 0) as pro_elite_events,
           coalesce(c.elite_select_events, 0) as elite_select_events,
           coalesce(c.select_events, 0) as select_events
    from pool p
    left join public.usau_teams t on t.id = p.team_id
    left join career c on c.pool_id = p.player_id
  )
  select p_event,
         'usau',
         s.player_id::text,
         s.display_name,
         s.team_name,
         row_number() over (
           order by s.avg_ga desc, s.nationals desc, s.tct_events desc,
                    s.pro_elite_events desc, s.elite_select_events desc, s.select_events desc,
                    lower(s.display_name), s.player_id
         ),
         case
           when s.avg_ga > 0 then 'S'
           when s.nationals > 0 or s.tct_events > 0 then 'A'
           when s.pro_elite_events + s.elite_select_events + s.select_events > 0 then 'B'
           else 'C'
         end,
         s.stat_events,
         case when s.stat_events > 0 then round(s.goals::numeric / s.stat_events, 2) else 0 end,
         case when s.stat_events > 0 then round(s.assists::numeric / s.stat_events, 2) else 0 end,
         s.nationals,
         s.tct_events,
         s.pro_elite_events,
         s.elite_select_events,
         s.select_events,
         now()
  from scored s;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.fantasy_rebuild_player_ratings(uuid) from public, anon, authenticated;

-- ── Upkeep ──────────────────────────────────────────────────────────────────
-- Events with a USAU event contest that haven't started (ET): rebuild when the
-- roster set changed or the rows are over a day old (history backfills).
create or replace function public.fantasy_refresh_player_ratings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_built integer := 0;
begin
  for v_event in
    select distinct e.id
    from public.fantasy_contests c
    join public.usau_events e on e.id::text = c.settings ->> 'eventId'
    where c.competition in ('usau-club-nationals', 'usau-college-nationals')
      and e.start_date > (now() at time zone 'America/New_York')::date
  loop
    if not exists (
         select 1 from public.fantasy_player_ratings fr
         where fr.event_id = v_event and fr.player_league = 'usau'
           and fr.computed_at > now() - interval '1 day'
       )
       or (select count(*) from public.fantasy_player_ratings fr
           where fr.event_id = v_event and fr.player_league = 'usau')
          <> (select count(distinct r.player_id) from public.usau_rosters r where r.event_id = v_event)
       or exists (
         select 1 from public.usau_rosters r
         where r.event_id = v_event
           and not exists (
             select 1 from public.fantasy_player_ratings fr
             where fr.event_id = v_event and fr.player_league = 'usau'
               and fr.player_id = r.player_id::text
           )
       )
    then
      perform public.fantasy_rebuild_player_ratings(v_event);
      v_built := v_built + 1;
    end if;
  end loop;
  return v_built;
end;
$$;

revoke execute on function public.fantasy_refresh_player_ratings() from public, anon, authenticated;

select cron.schedule(
  'fantasy-player-ratings-hourly',
  '44 * * * *',
  $$select public.fantasy_refresh_player_ratings()$$
);

-- ── Autodraft reads the list ────────────────────────────────────────────────
create or replace function pg_temp.replace_once(p_src text, p_old text, p_new text, p_what text)
returns text
language plpgsql
as $$
begin
  if (length(p_src) - length(replace(p_src, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once — aborting rather than guessing', p_what;
  end if;
  return replace(p_src, p_old, p_new);
end;
$$;

do $mig$
declare
  v text;
begin
  if (select md5(prosrc) from pg_proc
      where oid = 'public.fantasy_draft_best_available(uuid, public.fantasy_contests)'::regprocedure)
     <> '1f0d7866890bd48687d7190852be9abb' then
    raise exception 'fantasy_draft_best_available changed since 2026-10-09 — re-derive this patch from the live body';
  end if;

  v := pg_get_functiondef('public.fantasy_draft_best_available(uuid, public.fantasy_contests)'::regprocedure);
  v := pg_temp.replace_once(v,
'  elsif p_contest.competition in (''usau-club-nationals'',''usau-college-nationals'') then
    select pes.player_id::text as player_id, up.display_name as player_name
    into v_best
    from public.usau_player_event_stats pes
    join public.usau_players up on up.id = pes.player_id
    where pes.event_id = (p_contest.settings ->> ''eventId'')::uuid
      and not exists (
        select 1 from public.fantasy_draft_picks dp
        where dp.draft_id = p_draft and dp.player_league = ''usau'' and dp.player_id = pes.player_id::text
      )
    order by (coalesce(pes.goals,0) + coalesce(pes.assists,0)) desc
    limit 1;

    if v_best.player_id is null then
      select r.player_id::text as player_id, up.display_name as player_name
      into v_best
      from public.usau_rosters r
      join public.usau_players up on up.id = r.player_id
      where r.event_id = (p_contest.settings ->> ''eventId'')::uuid
        and not exists (
          select 1 from public.fantasy_draft_picks dp
          where dp.draft_id = p_draft and dp.player_league = ''usau'' and dp.player_id = r.player_id::text
        )
      order by up.display_name
      limit 1;
    end if;
',
'  elsif p_contest.competition in (''usau-club-nationals'',''usau-college-nationals'') then
    -- The ranked list (fantasy_player_ratings): the best-ranked undrafted
    -- player still on the event roster, under today''s name.
    select fr.player_id,
           (select up.display_name from public.usau_players up where up.id = fr.player_id::uuid) as player_name
    into v_best
    from public.fantasy_player_ratings fr
    where fr.event_id = (p_contest.settings ->> ''eventId'')::uuid
      and fr.player_league = ''usau''
      and exists (
        select 1 from public.usau_rosters r
        where r.event_id = fr.event_id and r.player_id = fr.player_id::uuid
      )
      and not exists (
        select 1 from public.fantasy_draft_picks dp
        where dp.draft_id = p_draft and dp.player_league = ''usau'' and dp.player_id = fr.player_id
      )
    order by fr.rank
    limit 1;

    -- Not rated yet (added to the roster since the last rebuild): event
    -- stats, then the roster A–Z.
    if v_best.player_id is null then
      select pes.player_id::text as player_id, up.display_name as player_name
      into v_best
      from public.usau_player_event_stats pes
      join public.usau_players up on up.id = pes.player_id
      where pes.event_id = (p_contest.settings ->> ''eventId'')::uuid
        and not exists (
          select 1 from public.fantasy_draft_picks dp
          where dp.draft_id = p_draft and dp.player_league = ''usau'' and dp.player_id = pes.player_id::text
        )
      order by (coalesce(pes.goals,0) + coalesce(pes.assists,0)) desc
      limit 1;
    end if;

    if v_best.player_id is null then
      select r.player_id::text as player_id, up.display_name as player_name
      into v_best
      from public.usau_rosters r
      join public.usau_players up on up.id = r.player_id
      where r.event_id = (p_contest.settings ->> ''eventId'')::uuid
        and not exists (
          select 1 from public.fantasy_draft_picks dp
          where dp.draft_id = p_draft and dp.player_league = ''usau'' and dp.player_id = r.player_id::text
        )
      order by up.display_name
      limit 1;
    end if;
',
    'fantasy_draft_best_available usau branch');
  execute v;
end;
$mig$;

-- First build for every upcoming USAU event contest (2026 Club Nationals today).
-- ANALYZE so the autodraft lookup plans on the rank index from the first draft.
select public.fantasy_refresh_player_ratings();
analyze public.fantasy_player_ratings;

notify pgrst, 'reload schema';
