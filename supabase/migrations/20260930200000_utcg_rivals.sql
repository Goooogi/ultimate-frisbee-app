-- UTCG Phase 2 — Rivals: unstaked async PvP with weekly point tiers
-- (proposal: FC Division Rivals — pay weekly by threshold, not per win).
--   * Same squad-parking mechanics as staked PvP, but no coins move: a win is
--     3 points, a draw 1, for BOTH sides (the parked defender scores too).
--   * Weekly tiers (ISO week): 6 pts Bronze, 15 Silver, 30 Gold — untradeable
--     reward packs, each tier claimable once, this week or last week.
--   * Same pair can't meet twice in 24h (any mode). Not market-gated: nothing
--     transferable is at stake.
-- utcg_pvp_squads / utcg_pvp_matches gain `mode` ('staked' | 'rivals'); the
-- one-open-squad rule becomes one per mode, and staked PvP + cancel are
-- scoped to mode = 'staked'. Rank-gated stake payouts wait for Rivals data.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

alter table public.utcg_pvp_squads
  add column if not exists mode text not null default 'staked';
alter table public.utcg_pvp_squads drop constraint if exists utcg_pvp_squads_mode_check;
alter table public.utcg_pvp_squads add constraint utcg_pvp_squads_mode_check check (mode in ('staked', 'rivals'));
alter table public.utcg_pvp_matches
  add column if not exists mode text not null default 'staked';
alter table public.utcg_pvp_matches drop constraint if exists utcg_pvp_matches_mode_check;
alter table public.utcg_pvp_matches add constraint utcg_pvp_matches_mode_check check (mode in ('staked', 'rivals'));

drop index if exists public.utcg_pvp_squads_one_open_per_user;
create unique index if not exists utcg_pvp_squads_one_open_per_user_mode
  on public.utcg_pvp_squads (user_id, mode) where consumed_at is null;

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

-- Staked PvP only ever sees staked squads.
select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$    where s.consumed_at is null
      and s.user_id <> uid$o$,
$n$    where s.consumed_at is null
      and s.mode = 'staked'
      and s.user_id <> uid$n$);
select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$      where user_id = uid and consumed_at is null and staked_coins = 0;$o$,
$n$      where user_id = uid and consumed_at is null and staked_coins = 0 and mode = 'staked';$n$);
select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$               where user_id = uid and consumed_at is null and staked_coins > 0) then$o$,
$n$               where user_id = uid and consumed_at is null and staked_coins > 0
                 and mode = 'staked') then$n$);
select pg_temp.utcg_patch('public.utcg_pvp_cancel()',
$o$    where user_id = uid and consumed_at is null
    for update;$o$,
$n$    where user_id = uid and consumed_at is null and mode = 'staked'
    for update;$n$);

create table if not exists public.utcg_rivals_weeks (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_key text not null,
  points int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  claimed_tier int not null default 0,
  primary key (user_id, week_key)
);
alter table public.utcg_rivals_weeks enable row level security;
drop policy if exists utcg_rivals_weeks_select_own on public.utcg_rivals_weeks;
create policy utcg_rivals_weeks_select_own on public.utcg_rivals_weeks
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_rivals_weeks from anon, authenticated;

-- Weekly tiers — mirrored in src/lib/utcg/rivals.ts.
create or replace function public.utcg_rivals_tiers()
returns table(tier int, points int, pack text)
language sql immutable set search_path to 'public' as $function$
  select * from (values (1, 6, 'bronze'), (2, 15, 'silver'), (3, 30, 'gold')) t(tier, points, pack);
$function$;

create or replace function public.utcg_rivals_score(p_uid uuid, p_result text)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare wk text := public.utcg_period_key('weekly');
begin
  insert into public.utcg_rivals_weeks (user_id, week_key) values (p_uid, wk)
    on conflict (user_id, week_key) do nothing;
  update public.utcg_rivals_weeks
    set points = points + case p_result when 'win' then 3 when 'draw' then 1 else 0 end,
        wins = wins + case when p_result = 'win' then 1 else 0 end,
        draws = draws + case when p_result = 'draw' then 1 else 0 end,
        losses = losses + case when p_result = 'loss' then 1 else 0 end
    where user_id = p_uid and week_key = wk;
end $function$;

create or replace function public.utcg_rivals_enter(p_formation text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev jsonb; my_chem int; my_mean numeric; my_strength numeric;
  foe public.utcg_pvp_squads; outcome text; decided text; match_id uuid; wk record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.utcg_assert_squad(uid, p_cards);
  if exists (select 1 from public.utcg_pvp_squads
             where user_id = uid and consumed_at is null and mode = 'rivals') then
    raise exception 'you already have a Rivals squad waiting for a challenger';
  end if;

  ev := public.utcg_eval_lineup(p_formation, p_cards);
  my_chem := (ev->>'chem')::int;
  my_mean := (ev->>'mean_score')::numeric;
  my_strength := (ev->>'strength')::numeric;
  perform public.utcg_ensure_wallet();

  select * into foe
    from public.utcg_pvp_squads s
    where s.consumed_at is null and s.mode = 'rivals' and s.user_id <> uid
      and not exists (
        select 1 from public.utcg_pvp_matches m
        where least(m.challenger_id, m.defender_id) = least(uid, s.user_id)
          and greatest(m.challenger_id, m.defender_id) = greatest(uid, s.user_id)
          and m.created_at >= now() - interval '24 hours')
    order by abs(s.strength - my_strength), s.created_at
    limit 1
    for update skip locked;

  if foe is null then
    insert into public.utcg_pvp_squads
      (user_id, formation, cards, chem, mean_score, strength, staked_coins, mode)
    values (uid, p_formation, p_cards, my_chem, my_mean, my_strength, 0, 'rivals');
    return jsonb_build_object('status', 'queued', 'chem', my_chem, 'strength', round(my_strength, 2));
  end if;

  if my_strength > foe.strength then outcome := 'challenger'; decided := 'strength';
  elsif my_strength < foe.strength then outcome := 'defender'; decided := 'strength';
  elsif my_chem > foe.chem then outcome := 'challenger'; decided := 'chem';
  elsif my_chem < foe.chem then outcome := 'defender'; decided := 'chem';
  elsif my_mean < foe.mean_score then outcome := 'challenger'; decided := 'mean';
  elsif my_mean > foe.mean_score then outcome := 'defender'; decided := 'mean';
  else outcome := 'draw'; decided := 'draw';
  end if;

  update public.utcg_pvp_squads set consumed_at = now() where id = foe.id;
  insert into public.utcg_pvp_matches
    (challenger_id, defender_id, challenger_strength, defender_strength,
     challenger_chem, defender_chem, outcome, decided_by, pot, rake, mode)
  values (uid, foe.user_id, my_strength, foe.strength, my_chem, foe.chem,
          outcome, decided, 0, 0, 'rivals')
  returning id into match_id;

  perform public.utcg_rivals_score(uid,
    case outcome when 'challenger' then 'win' when 'draw' then 'draw' else 'loss' end);
  perform public.utcg_rivals_score(foe.user_id,
    case outcome when 'defender' then 'win' when 'draw' then 'draw' else 'loss' end);

  update public.utcg_wallets
    set finished_games = finished_games + 1,
        play_day_count = play_day_count
          + case when last_play_day is distinct from current_date then 1 else 0 end,
        last_play_day = current_date
    where user_id = uid;
  perform public.utcg_on_game_finished(uid, 'rivals', case when outcome = 'challenger' then 1 else 0 end);

  select * into wk from public.utcg_rivals_weeks
    where user_id = uid and week_key = public.utcg_period_key('weekly');
  return jsonb_build_object('status', 'resolved', 'match_id', match_id,
    'outcome', outcome, 'decided_by', decided,
    'chem', my_chem, 'strength', round(my_strength, 2),
    'opponent_chem', foe.chem, 'opponent_strength', round(foe.strength, 2),
    'week_points', wk.points);
end $function$;

create or replace function public.utcg_rivals_cancel()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.utcg_pvp_squads set consumed_at = now()
    where user_id = uid and consumed_at is null and mode = 'rivals';
  if not found then raise exception 'no Rivals squad to withdraw'; end if;
end $function$;

-- Claim every tier reached but not yet claimed, for this week or last week.
create or replace function public.utcg_rivals_claim(p_week_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); r public.utcg_rivals_weeks; t record; packs jsonb := '[]'::jsonb; reached int := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_week_key not in (public.utcg_period_key('weekly'),
                        'w:' || to_char(current_date - 7, 'IYYY-"W"IW')) then
    raise exception 'that week can no longer be claimed';
  end if;
  select * into r from public.utcg_rivals_weeks
    where user_id = uid and week_key = p_week_key for update;
  if r is null then raise exception 'no Rivals points that week'; end if;

  for t in select * from public.utcg_rivals_tiers() order by tier loop
    if r.points >= t.points then
      reached := t.tier;
      if t.tier > r.claimed_tier then
        packs := packs || to_jsonb(public.utcg_grant_reward_pack(uid, t.pack, 'rivals:' || p_week_key || ':T' || t.tier));
      end if;
    end if;
  end loop;
  if reached <= r.claimed_tier then raise exception 'no new Rivals tier to claim'; end if;
  update public.utcg_rivals_weeks set claimed_tier = reached
    where user_id = uid and week_key = p_week_key;
  return jsonb_build_object('reward_pack_ids', packs, 'claimed_tier', reached);
end $function$;

revoke execute on function public.utcg_rivals_tiers() from public, anon, authenticated;
revoke execute on function public.utcg_rivals_score(uuid, text) from public, anon, authenticated;
revoke execute on function public.utcg_rivals_enter(text, jsonb) from public, anon;
revoke execute on function public.utcg_rivals_cancel() from public, anon;
revoke execute on function public.utcg_rivals_claim(text) from public, anon;
grant execute on function public.utcg_rivals_enter(text, jsonb) to authenticated;
grant execute on function public.utcg_rivals_cancel() to authenticated;
grant execute on function public.utcg_rivals_claim(text) to authenticated;

-- utcg_weekly_state gains Rivals (this week + last week's unclaimed tiers).
create or replace function public.utcg_weekly_state()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); wk text := public.utcg_period_key('weekly');
  prev text := 'w:' || to_char(current_date - 7, 'IYYY-"W"IW');
  rule record; boss jsonb; b public.utcg_weekly_results; x public.utcg_weekly_results;
  rv public.utcg_rivals_weeks; rp public.utcg_rivals_weeks;
begin
  if uid is null then return null; end if;
  select * into rule from public.utcg_brawl_rule(public.utcg_week_index());
  boss := public.utcg_boss_squad(public.utcg_week_index());
  select * into b from public.utcg_weekly_results where user_id = uid and week_key = wk and mode = 'brawl';
  select * into x from public.utcg_weekly_results where user_id = uid and week_key = wk and mode = 'boss';
  select * into rv from public.utcg_rivals_weeks where user_id = uid and week_key = wk;
  select * into rp from public.utcg_rivals_weeks where user_id = uid and week_key = prev;
  return jsonb_build_object(
    'week_key', wk,
    'brawl', jsonb_build_object('rule', rule.rule_key, 'label', rule.label,
      'description', rule.description, 'target', rule.target,
      'plays', coalesce(b.plays, 0), 'best_strength', b.best_strength, 'won', b.won_at is not null),
    'boss', boss || jsonb_build_object('plays', coalesce(x.plays, 0),
      'best_strength', x.best_strength, 'won', x.won_at is not null),
    'rivals', jsonb_build_object(
      'week_key', wk,
      'points', coalesce(rv.points, 0), 'wins', coalesce(rv.wins, 0),
      'draws', coalesce(rv.draws, 0), 'losses', coalesce(rv.losses, 0),
      'claimed_tier', coalesce(rv.claimed_tier, 0),
      'open_squad', exists (select 1 from public.utcg_pvp_squads
                            where user_id = uid and consumed_at is null and mode = 'rivals'),
      'last_week', case when rp is null then null else jsonb_build_object(
        'week_key', prev, 'points', rp.points, 'claimed_tier', rp.claimed_tier) end));
end $function$;
revoke execute on function public.utcg_weekly_state() from public, anon;
grant execute on function public.utcg_weekly_state() to authenticated;

notify pgrst, 'reload schema';
