-- UTCG Phase 2 — Weekly Brawl + Featured Boss (proposal: weekly value,
-- untradeable rewards, first-win-only payouts à la Tavern Brawl).
--   * Brawl: one rule twist per ISO week (rotating, no cron). Build a legal
--     squad and reach the rule's target strength. First clear of the week pays
--     a Bronze reward pack. Unlimited plays; plays pay no coins.
--   * Boss: this week's AI squad is a real UFA team-season's best 7
--     (deterministic by week). Beat its strength — deterministically, no dice —
--     for a Silver reward pack, first win of the week only.
--   Both feed utcg_on_game_finished (objectives / XP / streak) and the market
--   unlock counters. Rules + targets mirrored in src/lib/utcg/brawl.ts.
-- The 12-game wins curve moves out of utcg_record_match into
-- utcg_wins_for_strength (same numbers) so there's one SQL copy.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

create or replace function public.utcg_wins_for_strength(p_strength numeric)
returns int
language sql
immutable
set search_path to 'public'
as $function$
  select greatest(0, least(12, round(
    case
      when p_strength <= 40 then 0
      when p_strength <= 81.6 then 0 + (p_strength-40)/(81.6-40)*(2-0)
      when p_strength <= 85.6 then 2 + (p_strength-81.6)/(85.6-81.6)*(5-2)
      when p_strength <= 87.7 then 5 + (p_strength-85.6)/(87.7-85.6)*(6-5)
      when p_strength <= 89.66 then 6 + (p_strength-87.7)/(89.66-87.7)*(7-6)
      when p_strength <= 91.14 then 7 + (p_strength-89.66)/(91.14-89.66)*(8-7)
      when p_strength <= 92.16 then 8 + (p_strength-91.14)/(92.16-91.14)*(9-8)
      when p_strength <= 93.16 then 9 + (p_strength-92.16)/(93.16-92.16)*(10-9)
      when p_strength <= 93.77 then 10 + (p_strength-93.16)/(93.77-93.16)*(11-10)
      when p_strength <= 94.46 then 11 + (p_strength-93.77)/(94.46-93.77)*(12-11)
      else 12 end
  )))::int;
$function$;

do $wins$
declare
  v_oid oid := to_regprocedure('public.utcg_record_match(text,jsonb)');
  v_def text; s int; e int;
  c_start constant text := E'  wins := round(\n';
  c_end constant text := E'  wins := greatest(0, least(12, wins));\n';
  c_new constant text := E'  wins := public.utcg_wins_for_strength(strength);\n';
begin
  v_def := pg_get_functiondef(v_oid);
  if position(c_new in v_def) > 0 then raise notice 'record_match already uses utcg_wins_for_strength'; return; end if;
  if (length(v_def) - length(replace(v_def, c_start, ''))) / length(c_start) <> 1
     or (length(v_def) - length(replace(v_def, c_end, ''))) / length(c_end) <> 1 then
    raise exception 'record_match wins anchors not unique';
  end if;
  s := position(c_start in v_def);
  e := position(c_end in v_def) + length(c_end);
  if e <= s then raise exception 'record_match wins anchors out of order'; end if;
  execute overlay(v_def placing c_new from s for e - s);
end
$wins$;

-- Same ownership rules as utcg_record_match: exactly 7 owned, no duplicates.
create or replace function public.utcg_assert_squad(p_uid uuid, p_cards jsonb)
returns void
language plpgsql
stable
set search_path to 'public'
as $function$
declare i int; elem jsonb;
begin
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) <> 7 then
    raise exception 'squad must have exactly 7 cards';
  end if;
  for i in 0..6 loop
    elem := p_cards -> i;
    if not exists (
      select 1 from public.utcg_owned_cards oc
      where oc.user_id = p_uid and oc.league = 'ufa'
        and oc.player_id = (elem->>'player_id') and oc.team_slug = (elem->>'team_slug')
        and oc.year = (elem->>'year')::int and oc.copies >= 1
    ) then
      raise exception 'card not owned or invalid: %', elem;
    end if;
    if exists (
      select 1 from generate_series(0, i - 1) j
      where (p_cards->j->>'player_id') = (elem->>'player_id')
        and (p_cards->j->>'team_slug') = (elem->>'team_slug')
        and (p_cards->j->>'year') = (elem->>'year')
    ) then
      raise exception 'duplicate card in squad';
    end if;
  end loop;
end $function$;

create or replace function public.utcg_week_index()
returns int language sql stable set search_path to 'public' as $function$
  select (current_date - date '2026-01-05') / 7;
$function$;

-- rule key, label, description, target strength — mirrored in brawl.ts.
create or replace function public.utcg_brawl_rule(p_week int)
returns table(rule_key text, label text, description text, target numeric)
language sql immutable set search_path to 'public' as $function$
  select r.k, r.l, r.d, r.t from (values
    (0, 'max_85',       'Underdogs',       'Every card 85 OVR or lower',          82.0),
    (1, 'one_team',     'One Club',        'All 7 cards from the same franchise',  84.0),
    (2, 'throwback',    'Throwback',       'Every card from 2019 or earlier',      86.0),
    (3, 'seven_teams',  'All-Stars',       '7 different franchises',               88.0),
    (4, 'one_division', 'Division Rivals', 'All 7 cards from one division',        86.0),
    (5, 'new_school',   'New School',      'Every card from 2023 or later',        86.0)
  ) as r(i, k, l, d, t)
  where r.i = p_week % 6;
$function$;

create or replace function public.utcg_brawl_check(p_rule text, p_cards jsonb)
returns void
language plpgsql
stable
set search_path to 'public'
as $function$
declare ok boolean;
begin
  with c as (
    select cp.score, cp.team_slug, cp.year, cp.division
    from jsonb_array_elements(p_cards) e
    join public.utcg_card_pool cp
      on cp.player_id = e->>'player_id' and cp.team_slug = e->>'team_slug'
     and cp.year = (e->>'year')::int
  )
  select case p_rule
    when 'max_85'       then count(*) = 7 and max(score) <= 85
    when 'one_team'     then count(*) = 7 and count(distinct team_slug) = 1
    when 'throwback'    then count(*) = 7 and max(year) <= 2019
    when 'seven_teams'  then count(*) = 7 and count(distinct team_slug) = 7
    when 'one_division' then count(*) = 7 and count(division) = 7 and count(distinct division) = 1
    when 'new_school'   then count(*) = 7 and min(year) >= 2023
    else false end
  into ok from c;
  if not ok then raise exception 'squad breaks this week''s Brawl rule'; end if;
end $function$;

-- This week's boss: a real team-season's best handlers + cutters in vert.
create or replace function public.utcg_boss_squad(p_week int)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  n int; pick record; cards jsonb := '[]'::jsonb; c record; used text[] := array[]::text[];
  ev jsonb;
begin
  select count(*) into n from (
    select 1 from public.utcg_card_pool group by team_slug, year having count(*) >= 10) t;
  if n = 0 then return null; end if;

  select t.team_slug, t.year, t.team_abbr into pick from (
    select team_slug, year, max(team_abbr) team_abbr from public.utcg_card_pool
    group by team_slug, year having count(*) >= 10
    order by year, team_slug) t
  offset (p_week * 53) % n limit 1;

  for c in
    select player_id, name, score, position from public.utcg_card_pool
    where team_slug = pick.team_slug and year = pick.year and position in ('handler', 'hybrid')
    order by score desc limit 2
  loop
    cards := cards || jsonb_build_object('player_id', c.player_id, 'team_slug', pick.team_slug,
      'year', pick.year, 'name', c.name, 'score', c.score, 'position', c.position);
    used := used || c.player_id;
  end loop;
  for c in
    select player_id, name, score, position from public.utcg_card_pool
    where team_slug = pick.team_slug and year = pick.year
      and position in ('cutter', 'hybrid') and not (player_id = any(used))
    order by score desc limit 7 - jsonb_array_length(cards)
  loop
    cards := cards || jsonb_build_object('player_id', c.player_id, 'team_slug', pick.team_slug,
      'year', pick.year, 'name', c.name, 'score', c.score, 'position', c.position);
  end loop;
  if jsonb_array_length(cards) <> 7 then return null; end if;

  ev := public.utcg_eval_lineup('vert', cards);
  return jsonb_build_object('team_slug', pick.team_slug, 'team_abbr', pick.team_abbr,
    'year', pick.year, 'formation', 'vert', 'cards', cards,
    'strength', round((ev->>'strength')::numeric, 2), 'chem', (ev->>'chem')::int);
end $function$;

create table if not exists public.utcg_weekly_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_key text not null,
  mode text not null check (mode in ('brawl', 'boss')),
  plays int not null default 0,
  best_strength numeric,
  won_at timestamptz,
  primary key (user_id, week_key, mode)
);
alter table public.utcg_weekly_results enable row level security;
drop policy if exists utcg_weekly_results_select_own on public.utcg_weekly_results;
create policy utcg_weekly_results_select_own on public.utcg_weekly_results
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_weekly_results from anon, authenticated;

-- Shared tail for Brawl/Boss plays: weekly record, first-win pack, counters, seam.
create or replace function public.utcg_finish_weekly_play(
  p_uid uuid, p_mode text, p_strength numeric, p_won boolean, p_pack text)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare wk text := public.utcg_period_key('weekly'); r public.utcg_weekly_results; pack_id uuid;
begin
  insert into public.utcg_weekly_results (user_id, week_key, mode) values (p_uid, wk, p_mode)
    on conflict (user_id, week_key, mode) do nothing;
  select * into r from public.utcg_weekly_results
    where user_id = p_uid and week_key = wk and mode = p_mode for update;
  if p_won and r.won_at is null then
    pack_id := public.utcg_grant_reward_pack(p_uid, p_pack, p_mode || ':' || wk);
  end if;
  update public.utcg_weekly_results
    set plays = r.plays + 1,
        best_strength = greatest(coalesce(r.best_strength, 0), p_strength),
        won_at = coalesce(r.won_at, case when p_won then now() end)
    where user_id = p_uid and week_key = wk and mode = p_mode;

  update public.utcg_wallets
    set finished_games = finished_games + 1,
        play_day_count = play_day_count
          + case when last_play_day is distinct from current_date then 1 else 0 end,
        last_play_day = current_date
    where user_id = p_uid;
  perform public.utcg_on_game_finished(p_uid, p_mode, case when p_won then 1 else 0 end);
  return pack_id;
end $function$;

create or replace function public.utcg_brawl_play(p_formation text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); rule record; ev jsonb; strength numeric; won boolean; pack_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.utcg_assert_squad(uid, p_cards);
  select * into rule from public.utcg_brawl_rule(public.utcg_week_index());
  perform public.utcg_brawl_check(rule.rule_key, p_cards);
  ev := public.utcg_eval_lineup(p_formation, p_cards);
  strength := (ev->>'strength')::numeric;
  won := strength >= rule.target;

  perform public.utcg_ensure_wallet();
  pack_id := public.utcg_finish_weekly_play(uid, 'brawl', strength, won, 'bronze');
  return jsonb_build_object('won', won, 'strength', round(strength, 2), 'chem', (ev->>'chem')::int,
    'target', rule.target, 'rule', rule.rule_key, 'reward_pack_id', pack_id);
end $function$;

create or replace function public.utcg_boss_play(p_formation text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); boss jsonb; ev jsonb; strength numeric; won boolean; pack_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.utcg_assert_squad(uid, p_cards);
  boss := public.utcg_boss_squad(public.utcg_week_index());
  if boss is null then raise exception 'no boss this week'; end if;
  ev := public.utcg_eval_lineup(p_formation, p_cards);
  strength := (ev->>'strength')::numeric;
  won := strength > (boss->>'strength')::numeric;

  perform public.utcg_ensure_wallet();
  pack_id := public.utcg_finish_weekly_play(uid, 'boss', strength, won, 'silver');
  return jsonb_build_object('won', won, 'strength', round(strength, 2), 'chem', (ev->>'chem')::int,
    'boss_strength', boss->'strength', 'reward_pack_id', pack_id);
end $function$;

revoke execute on function public.utcg_wins_for_strength(numeric) from public, anon, authenticated;
revoke execute on function public.utcg_assert_squad(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.utcg_week_index() from public, anon, authenticated;
revoke execute on function public.utcg_brawl_rule(int) from public, anon, authenticated;
revoke execute on function public.utcg_brawl_check(text, jsonb) from public, anon, authenticated;
revoke execute on function public.utcg_boss_squad(int) from public, anon, authenticated;
revoke execute on function public.utcg_finish_weekly_play(uuid, text, numeric, boolean, text) from public, anon, authenticated;
revoke execute on function public.utcg_brawl_play(text, jsonb) from public, anon;
revoke execute on function public.utcg_boss_play(text, jsonb) from public, anon;
grant execute on function public.utcg_brawl_play(text, jsonb) to authenticated;
grant execute on function public.utcg_boss_play(text, jsonb) to authenticated;

-- utcg_progress_state gains the week's Brawl + Boss. It stays INVOKER; the
-- definer-only pieces (rule table, boss squad) come through a definer helper.
create or replace function public.utcg_weekly_state()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); wk text := public.utcg_period_key('weekly');
  rule record; boss jsonb; b public.utcg_weekly_results; x public.utcg_weekly_results;
begin
  if uid is null then return null; end if;
  select * into rule from public.utcg_brawl_rule(public.utcg_week_index());
  boss := public.utcg_boss_squad(public.utcg_week_index());
  select * into b from public.utcg_weekly_results where user_id = uid and week_key = wk and mode = 'brawl';
  select * into x from public.utcg_weekly_results where user_id = uid and week_key = wk and mode = 'boss';
  return jsonb_build_object(
    'week_key', wk,
    'brawl', jsonb_build_object('rule', rule.rule_key, 'label', rule.label,
      'description', rule.description, 'target', rule.target,
      'plays', coalesce(b.plays, 0), 'best_strength', b.best_strength, 'won', b.won_at is not null),
    'boss', boss || jsonb_build_object('plays', coalesce(x.plays, 0),
      'best_strength', x.best_strength, 'won', x.won_at is not null));
end $function$;
revoke execute on function public.utcg_weekly_state() from public, anon;
grant execute on function public.utcg_weekly_state() to authenticated;

notify pgrst, 'reload schema';
