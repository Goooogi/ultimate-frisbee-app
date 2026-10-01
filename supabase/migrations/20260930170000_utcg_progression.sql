-- UTCG Phase 2 — progression core (proposal: "small capped dailies, value
-- weekly"). One composition seam, utcg_on_game_finished(uid, kind, wins),
-- called by every finished game (Squad Battle, draft, and later Brawl/Boss):
--   * objectives: 3 daily + 3 weekly slots, each rotating through a small
--     pool by UTC day / ISO week (no cron — the active def is computed).
--     Progress rows are keyed by period ('d:2026-09-30', 'w:2026-W40'), so a
--     new period simply has no row yet. Rewards are claimed explicitly.
--   * play streak: consecutive UTC days with a finished game; up to 2 banked
--     freezes cover missed days; milestones 3/7/14/every 30 pay out.
--   * season track: 6-week seasons (pre-seeded), 150 XP/level, max 30.
--     XP: 5 per finished game (first 10/day) + objective claims. Level-ups
--     pay coins and untradeable reward packs.
--   * Squad Battle pay decays by matches today: 1–3 full, 4–6 half, 7–10
--     quarter (was flat to the 10-match cap) — MTG Arena-style.
-- Rewards that are packs are untradeable reward packs (20260930160000).
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

-- ── objectives ──────────────────────────────────────────────────────────────
create table if not exists public.utcg_objective_defs (
  key text primary key,
  period text not null check (period in ('daily', 'weekly')),
  slot int not null check (slot between 1 and 3),
  pool_index int not null check (pool_index >= 0),
  metric text not null,
  target int not null check (target > 0),
  label text not null,
  reward_coins int not null default 0 check (reward_coins >= 0),
  reward_xp int not null default 0 check (reward_xp >= 0),
  unique (period, slot, pool_index)
);
alter table public.utcg_objective_defs enable row level security;
drop policy if exists utcg_objective_defs_select_all on public.utcg_objective_defs;
create policy utcg_objective_defs_select_all on public.utcg_objective_defs for select using (true);
revoke insert, update, delete on public.utcg_objective_defs from anon, authenticated;

insert into public.utcg_objective_defs
  (key, period, slot, pool_index, metric, target, label, reward_coins, reward_xp) values
  ('d_games_3',        'daily',  1, 0, 'games_finished',  3, 'Finish 3 games',                      30, 20),
  ('d_games_5',        'daily',  1, 1, 'games_finished',  5, 'Finish 5 games',                      40, 25),
  ('d_squad_win_1',    'daily',  2, 0, 'squad_wins',      1, 'Go 7-5 or better in a Squad Battle',  30, 20),
  ('d_squad_win_2',    'daily',  2, 1, 'squad_wins',      2, 'Go 7-5 or better in 2 Squad Battles', 45, 25),
  ('d_pack_1',         'daily',  3, 0, 'packs_opened',    1, 'Open a pack',                         25, 15),
  ('d_draft_1',        'daily',  3, 1, 'drafts_finished', 1, 'Finish a draft',                      35, 20),
  ('d_draft_rounds_2', 'daily',  3, 2, 'draft_rounds',    2, 'Win 2 draft rounds',                  40, 25),
  ('w_games_20',       'weekly', 1, 0, 'games_finished', 20, 'Finish 20 games',                    150, 75),
  ('w_games_30',       'weekly', 1, 1, 'games_finished', 30, 'Finish 30 games',                    200, 90),
  ('w_drafts_5',       'weekly', 2, 0, 'drafts_finished', 5, 'Finish 5 drafts',                    150, 75),
  ('w_draft_rounds_8', 'weekly', 2, 1, 'draft_rounds',    8, 'Win 8 draft rounds',                 175, 80),
  ('w_brawl_3',        'weekly', 3, 0, 'brawl_played',    3, 'Play the Weekly Brawl 3 times',      150, 75),
  ('w_boss_1',         'weekly', 3, 1, 'boss_played',     1, 'Take on the Featured Boss',          125, 60),
  ('w_packs_5',        'weekly', 3, 2, 'packs_opened',    5, 'Open 5 packs',                       150, 75)
on conflict (key) do nothing;

create table if not exists public.utcg_objective_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  objective_key text not null references public.utcg_objective_defs(key),
  period_key text not null,
  progress int not null default 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  primary key (user_id, objective_key, period_key)
);
alter table public.utcg_objective_progress enable row level security;
drop policy if exists utcg_objective_progress_select_own on public.utcg_objective_progress;
create policy utcg_objective_progress_select_own on public.utcg_objective_progress
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_objective_progress from anon, authenticated;

create or replace function public.utcg_period_key(p_period text)
returns text language sql stable set search_path to 'public' as $function$
  select case p_period when 'daily' then 'd:' || current_date::text
                       else 'w:' || to_char(current_date, 'IYYY-"W"IW') end;
$function$;

-- Rotation index: UTC days (daily) or weeks (weekly) since Mon 2026-01-05.
create or replace function public.utcg_period_index(p_period text)
returns int language sql stable set search_path to 'public' as $function$
  select case p_period when 'daily' then (current_date - date '2026-01-05')
                       else (current_date - date '2026-01-05') / 7 end;
$function$;

create or replace function public.utcg_active_objectives()
returns setof public.utcg_objective_defs
language sql stable set search_path to 'public' as $function$
  select d.* from public.utcg_objective_defs d
  where d.pool_index = public.utcg_period_index(d.period)
    % (select count(*) from public.utcg_objective_defs x
       where x.period = d.period and x.slot = d.slot)::int;
$function$;

create or replace function public.utcg_bump_objective(p_uid uuid, p_metric text, p_amount int default 1)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare d record; pk text;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  for d in select * from public.utcg_active_objectives() a where a.metric = p_metric loop
    pk := public.utcg_period_key(d.period);
    insert into public.utcg_objective_progress (user_id, objective_key, period_key, progress, completed_at)
      values (p_uid, d.key, pk, least(d.target, p_amount),
              case when p_amount >= d.target then now() end)
    on conflict (user_id, objective_key, period_key) do update
      set progress = least(d.target, public.utcg_objective_progress.progress + p_amount),
          completed_at = coalesce(public.utcg_objective_progress.completed_at,
            case when public.utcg_objective_progress.progress + p_amount >= d.target then now() end);
  end loop;
end $function$;

-- ── seasons ─────────────────────────────────────────────────────────────────
create table if not exists public.utcg_seasons (
  id int primary key,
  name text not null,
  starts_on date not null,
  ends_on date not null  -- exclusive
);
alter table public.utcg_seasons enable row level security;
drop policy if exists utcg_seasons_select_all on public.utcg_seasons;
create policy utcg_seasons_select_all on public.utcg_seasons for select using (true);
revoke insert, update, delete on public.utcg_seasons from anon, authenticated;

-- 17 six-week seasons from Mon 2026-09-28 (through early 2028).
insert into public.utcg_seasons (id, name, starts_on, ends_on)
select n + 1, 'Season ' || (n + 1), date '2026-09-28' + n * 42, date '2026-09-28' + (n + 1) * 42
from generate_series(0, 16) n
on conflict (id) do nothing;

create table if not exists public.utcg_season_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id int not null references public.utcg_seasons(id),
  xp int not null default 0 check (xp >= 0),
  level int not null default 1 check (level between 1 and 30),
  primary key (user_id, season_id)
);
alter table public.utcg_season_progress enable row level security;
drop policy if exists utcg_season_progress_select_own on public.utcg_season_progress;
create policy utcg_season_progress_select_own on public.utcg_season_progress
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_season_progress from anon, authenticated;

create or replace function public.utcg_current_season_id()
returns int language sql stable set search_path to 'public' as $function$
  select id from public.utcg_seasons
  where current_date >= starts_on and current_date < ends_on;
$function$;

-- Level-up reward table (mirrored in src/lib/utcg/progression.ts).
create or replace function public.utcg_season_level_reward(p_level int)
returns table(coins int, pack text)
language sql immutable set search_path to 'public' as $function$
  select 20,
         case p_level when 5 then 'bronze' when 10 then 'silver' when 15 then 'bronze'
                      when 20 then 'silver' when 25 then 'gold' when 30 then 'gold' end;
$function$;

create or replace function public.utcg_add_xp(p_uid uuid, p_xp int)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare sid int; sp public.utcg_season_progress; new_level int; lvl int; rw record;
begin
  if p_xp is null or p_xp <= 0 then return; end if;
  sid := public.utcg_current_season_id();
  if sid is null then return; end if;

  insert into public.utcg_season_progress (user_id, season_id, xp)
    values (p_uid, sid, 0)
    on conflict (user_id, season_id) do nothing;
  select * into sp from public.utcg_season_progress
    where user_id = p_uid and season_id = sid for update;

  new_level := least(30, 1 + (sp.xp + p_xp) / 150);
  for lvl in sp.level + 1 .. new_level loop
    select * into rw from public.utcg_season_level_reward(lvl);
    update public.utcg_wallets set coins = coins + rw.coins where user_id = p_uid;
    if rw.pack is not null then
      perform public.utcg_grant_reward_pack(p_uid, rw.pack, 'season:' || sid || ':L' || lvl);
    end if;
  end loop;

  update public.utcg_season_progress
    set xp = sp.xp + p_xp, level = greatest(sp.level, new_level)
    where user_id = p_uid and season_id = sid;
end $function$;

-- ── streak + the seam ───────────────────────────────────────────────────────
alter table public.utcg_wallets
  add column if not exists streak_days int not null default 0,
  add column if not exists streak_best int not null default 0,
  add column if not exists streak_last_day date,
  add column if not exists streak_freezes int not null default 0,
  add column if not exists xp_day date,
  add column if not exists xp_games_today int not null default 0;
alter table public.utcg_wallets drop constraint if exists utcg_wallets_streak_freezes_range;
alter table public.utcg_wallets add constraint utcg_wallets_streak_freezes_range
  check (streak_freezes between 0 and 2);

create or replace function public.utcg_on_game_finished(p_uid uuid, p_kind text, p_wins int)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  w public.utcg_wallets; new_streak int; gap int; freezes int;
  coin_add int := 0; freeze_add int := 0; streak_pack text; xp_games int;
begin
  perform public.utcg_bump_objective(p_uid, 'games_finished', 1);
  if p_kind = 'squad' and p_wins >= 7 then
    perform public.utcg_bump_objective(p_uid, 'squad_wins', 1);
  elsif p_kind = 'draft' then
    perform public.utcg_bump_objective(p_uid, 'drafts_finished', 1);
    perform public.utcg_bump_objective(p_uid, 'draft_rounds', p_wins);
  elsif p_kind = 'brawl' then
    perform public.utcg_bump_objective(p_uid, 'brawl_played', 1);
  elsif p_kind = 'boss' then
    perform public.utcg_bump_objective(p_uid, 'boss_played', 1);
  end if;

  select * into w from public.utcg_wallets where user_id = p_uid for update;
  if w is null then return; end if;

  if w.streak_last_day is distinct from current_date then
    freezes := w.streak_freezes;
    if w.streak_last_day = current_date - 1 then
      new_streak := w.streak_days + 1;
    elsif w.streak_last_day is not null
          and current_date - w.streak_last_day - 1 <= w.streak_freezes then
      gap := current_date - w.streak_last_day - 1;
      freezes := freezes - gap;
      new_streak := w.streak_days + 1;
    else
      new_streak := 1;
    end if;

    if new_streak = 3 then coin_add := 50;
    elsif new_streak = 7 then streak_pack := 'bronze'; freeze_add := 1;
    elsif new_streak = 14 then streak_pack := 'silver'; freeze_add := 1;
    elsif new_streak % 30 = 0 then streak_pack := 'gold'; freeze_add := 1;
    end if;
    if streak_pack is not null then
      perform public.utcg_grant_reward_pack(p_uid, streak_pack, 'streak:' || new_streak);
    end if;

    update public.utcg_wallets
      set streak_days = new_streak,
          streak_best = greatest(streak_best, new_streak),
          streak_last_day = current_date,
          streak_freezes = least(2, freezes + freeze_add),
          coins = coins + coin_add
      where user_id = p_uid;
  end if;

  xp_games := case when w.xp_day is distinct from current_date then 0 else w.xp_games_today end;
  update public.utcg_wallets
    set xp_day = current_date, xp_games_today = xp_games + 1
    where user_id = p_uid;
  if xp_games < 10 then
    perform public.utcg_add_xp(p_uid, 5);
  end if;
end $function$;

revoke execute on function public.utcg_period_key(text) from public, anon, authenticated;
revoke execute on function public.utcg_period_index(text) from public, anon, authenticated;
revoke execute on function public.utcg_active_objectives() from public, anon, authenticated;
revoke execute on function public.utcg_bump_objective(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.utcg_current_season_id() from public, anon, authenticated;
revoke execute on function public.utcg_season_level_reward(int) from public, anon, authenticated;
revoke execute on function public.utcg_add_xp(uuid, int) from public, anon, authenticated;
revoke execute on function public.utcg_on_game_finished(uuid, text, int) from public, anon, authenticated;

-- ── player-facing RPCs ──────────────────────────────────────────────────────
create or replace function public.utcg_claim_objective(p_key text, p_period_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); pr public.utcg_objective_progress; d public.utcg_objective_defs; w public.utcg_wallets;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into pr from public.utcg_objective_progress
    where user_id = uid and objective_key = p_key and period_key = p_period_key for update;
  if pr is null or pr.completed_at is null then raise exception 'objective not complete'; end if;
  if pr.claimed_at is not null then raise exception 'reward already claimed'; end if;
  select * into d from public.utcg_objective_defs where key = p_key;

  update public.utcg_objective_progress set claimed_at = now()
    where user_id = uid and objective_key = p_key and period_key = p_period_key;
  update public.utcg_wallets set coins = coins + d.reward_coins where user_id = uid
    returning * into w;
  perform public.utcg_add_xp(uid, d.reward_xp);
  select * into w from public.utcg_wallets where user_id = uid;
  return jsonb_build_object('coins', w.coins, 'reward_coins', d.reward_coins, 'reward_xp', d.reward_xp);
end $function$;
revoke execute on function public.utcg_claim_objective(text, text) from public, anon;
grant execute on function public.utcg_claim_objective(text, text) to authenticated;

-- One bounded read for the page: active objectives + progress, season,
-- streak, unopened reward packs. Invoker — RLS scopes every table to the caller.
create or replace function public.utcg_progress_state()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); sid int; result jsonb;
begin
  if uid is null then return null; end if;
  select id into sid from public.utcg_seasons
    where current_date >= starts_on and current_date < ends_on;

  select jsonb_build_object(
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', d.key, 'period', d.period, 'slot', d.slot, 'label', d.label,
          'target', d.target, 'reward_coins', d.reward_coins, 'reward_xp', d.reward_xp,
          'period_key', pk.k, 'progress', coalesce(p.progress, 0),
          'completed', p.completed_at is not null, 'claimed', p.claimed_at is not null)
        order by d.period, d.slot)
      from public.utcg_objective_defs d
      cross join lateral (select case d.period when 'daily' then 'd:' || current_date::text
                                   else 'w:' || to_char(current_date, 'IYYY-"W"IW') end k) pk
      left join public.utcg_objective_progress p
        on p.user_id = uid and p.objective_key = d.key and p.period_key = pk.k
      where d.pool_index = (case d.period when 'daily' then (current_date - date '2026-01-05')
                                 else (current_date - date '2026-01-05') / 7 end)
            % (select count(*) from public.utcg_objective_defs x
               where x.period = d.period and x.slot = d.slot)::int), '[]'::jsonb),
    'season', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on,
        'ends_on', s.ends_on, 'xp', coalesce(sp.xp, 0), 'level', coalesce(sp.level, 1))
      from public.utcg_seasons s
      left join public.utcg_season_progress sp on sp.user_id = uid and sp.season_id = s.id
      where s.id = sid),
    'streak', (
      select jsonb_build_object('days',
          case when w.streak_last_day >= current_date - 1 - w.streak_freezes then w.streak_days else 0 end,
          'best', w.streak_best, 'freezes', w.streak_freezes,
          'played_today', w.streak_last_day = current_date)
      from public.utcg_wallets w where w.user_id = uid),
    'reward_packs', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'pack_kind', r.pack_kind,
               'source', r.source, 'granted_at', r.granted_at) order by r.granted_at)
      from public.utcg_reward_packs r
      where r.user_id = uid and r.opened_at is null), '[]'::jsonb)
  ) into result;
  return result;
end $function$;
revoke execute on function public.utcg_progress_state() from public, anon;
grant execute on function public.utcg_progress_state() to authenticated;

-- ── hooks into existing RPCs ────────────────────────────────────────────────
create or replace function pg_temp.utcg_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $patch$
declare v_oid oid; v_def text;
begin
  v_oid := to_regprocedure(p_sig);
  if v_oid is null then raise exception '% not found', p_sig; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(p_new in v_def) > 0 then
    raise notice '% already patched: %', p_sig, left(p_new, 60); return;
  end if;
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception '% anchor not unique: %', p_sig, left(p_old, 80);
  end if;
  execute replace(v_def, p_old, p_new);
end $patch$;

-- Squad Battle: decaying pay by matches today, then the seam.
select pg_temp.utcg_patch('public.utcg_record_match(text,jsonb)',
$o$            + case when wins >= 12 then 60 when wins >= 11 then 30 when wins >= 10 then 15 else 0 end;
$o$,
$n$            + case when wins >= 12 then 60 when wins >= 11 then 30 when wins >= 10 then 15 else 0 end;
    reward := floor(reward * case when w.matches_today < 3 then 1.0
                                  when w.matches_today < 6 then 0.5
                                  else 0.25 end)::int;
$n$);

select pg_temp.utcg_patch('public.utcg_record_match(text,jsonb)',
$o$        last_play_day = current_date
    where user_id = uid returning * into w;
$o$,
$n$        last_play_day = current_date
    where user_id = uid returning * into w;

  perform public.utcg_on_game_finished(uid, 'squad', wins);
  select * into w from public.utcg_wallets where user_id = uid;
$n$);

select pg_temp.utcg_patch('public.utcg_record_match(text,jsonb)',
$o$    'wins', wins, 'losses', 12 - wins, 'reward', reward, 'capped', capped,$o$,
$n$    'wins', wins, 'losses', 12 - wins, 'reward', reward, 'capped', capped,
    'matches_today', w.matches_today,$n$);

-- Draft: the seam on completion (play) and on abandoning a gauntlet run.
select pg_temp.utcg_patch('public.utcg_draft_play(uuid)',
$o$          last_play_day = current_date
      where user_id = uid returning * into w;$o$,
$n$          last_play_day = current_date
      where user_id = uid returning * into w;
    perform public.utcg_on_game_finished(uid, 'draft', new_round);
    select * into w from public.utcg_wallets where user_id = uid;$n$);

select pg_temp.utcg_patch('public.utcg_draft_abandon(uuid)',
$o$        last_play_day = case when run.status = 'playing' then current_date else last_play_day end
    where user_id = uid returning * into w;
$o$,
$n$        last_play_day = case when run.status = 'playing' then current_date else last_play_day end
    where user_id = uid returning * into w;
  if run.status = 'playing' then
    perform public.utcg_on_game_finished(uid, 'draft', run.round);
    select * into w from public.utcg_wallets where user_id = uid;
  end if;
$n$);

-- Packs count toward "open a pack" objectives.
select pg_temp.utcg_patch('public.utcg_open_pack(text)',
$o$  insert into public.utcg_pack_openings$o$,
$n$  perform public.utcg_bump_objective(uid, 'packs_opened', 1);
  insert into public.utcg_pack_openings$n$);

select pg_temp.utcg_patch('public.utcg_open_reward_pack(uuid)',
$o$  update public.utcg_wallets set packs_opened = packs_opened + 1 where user_id = uid;
$o$,
$n$  update public.utcg_wallets set packs_opened = packs_opened + 1 where user_id = uid;
  perform public.utcg_bump_objective(uid, 'packs_opened', 1);
$n$);

notify pgrst, 'reload schema';
