-- UTCG Phase 2 — Evolutions (proposal: FC Evolutions — commit a card, play
-- with it, it upgrades; committing locks one copy as untradeable).
--   * Per-user boost on one card identity, applied by utcg_eval_lineup only
--     for that user: player RPCs set the transaction-local GUC
--     utcg.eval_uid before scoring their own squad (never for boss / draft
--     cards), and eval adds that user's evolution boost.
--   * Progress = finished games with the card in the lineup (Squad Battle,
--     Brawl, Boss, Rivals). Stages raise the boost; up to 3 in progress.
--   * An evolved card keeps at least one copy (one copy is locked untradeable;
--     SBC hand-ins leave it alone).
-- Mirrors: src/lib/utcg/evolutions.ts.

create table if not exists public.utcg_evolution_defs (
  key text primary key,
  name text not null,
  description text not null,
  max_score numeric,       -- base score must be ≤ this
  max_year int,            -- card season must be ≤ this
  stages jsonb not null,   -- [{"games":5,"boost":2}, …] ascending
  active boolean not null default true
);
alter table public.utcg_evolution_defs enable row level security;
drop policy if exists utcg_evolution_defs_select_all on public.utcg_evolution_defs;
create policy utcg_evolution_defs_select_all on public.utcg_evolution_defs for select using (true);
revoke insert, update, delete on public.utcg_evolution_defs from anon, authenticated;

insert into public.utcg_evolution_defs (key, name, description, max_score, max_year, stages) values
  ('rising_star', 'Rising Star', 'Any card 80 OVR or lower. Play 5 / 15 / 30 games with it for +2 / +4 / +6.',
   80, null, '[{"games":5,"boost":2},{"games":15,"boost":4},{"games":30,"boost":6}]'),
  ('role_player', 'Role Player', 'Any card 85 OVR or lower. Play 10 / 25 games with it for +2 / +3.',
   85, null, '[{"games":10,"boost":2},{"games":25,"boost":3}]'),
  ('old_guard', 'Old Guard', 'A 2016-or-earlier card, 88 OVR or lower. Play 5 / 15 / 30 games for +1 / +2 / +3.',
   88, 2016, '[{"games":5,"boost":1},{"games":15,"boost":2},{"games":30,"boost":3}]')
on conflict (key) do nothing;

create table if not exists public.utcg_card_evolutions (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null,
  team_slug text not null,
  year int not null,
  evo_key text not null references public.utcg_evolution_defs(key),
  games int not null default 0,
  stage int not null default 0,
  boost numeric not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, player_id, team_slug, year)
);
alter table public.utcg_card_evolutions enable row level security;
drop policy if exists utcg_card_evolutions_select_own on public.utcg_card_evolutions;
create policy utcg_card_evolutions_select_own on public.utcg_card_evolutions
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_card_evolutions from anon, authenticated;

create or replace function public.utcg_evolution_start(p_key text, p_player_id text, p_team_slug text, p_year int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); d public.utcg_evolution_defs; oc public.utcg_owned_cards; score numeric; active_n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into d from public.utcg_evolution_defs where key = p_key and active;
  if d is null then raise exception 'evolution not found'; end if;
  select * into oc from public.utcg_owned_cards
    where user_id = uid and league = 'ufa' and player_id = p_player_id
      and team_slug = p_team_slug and year = p_year for update;
  if oc is null then raise exception 'card not owned'; end if;
  if exists (select 1 from public.utcg_card_evolutions
             where user_id = uid and player_id = p_player_id and team_slug = p_team_slug and year = p_year) then
    raise exception 'this card has already been evolved';
  end if;
  select count(*) into active_n from public.utcg_card_evolutions where user_id = uid and completed_at is null;
  if active_n >= 3 then raise exception 'finish an evolution first (3 in progress max)'; end if;

  select p.player_score::numeric into score from public.twelve_oh_players p
    where p.league = 'ufa' and p.player_id = p_player_id and p.team_slug = p_team_slug and p.year = p_year;
  if d.max_score is not null and score > d.max_score then
    raise exception 'card is above this evolution''s % OVR cap', d.max_score;
  end if;
  if d.max_year is not null and p_year > d.max_year then
    raise exception 'card must be from % or earlier', d.max_year;
  end if;

  if oc.untradeable_copies < oc.copies then
    update public.utcg_owned_cards set untradeable_copies = untradeable_copies + 1
      where user_id = uid and league = 'ufa' and player_id = p_player_id
        and team_slug = p_team_slug and year = p_year;
  end if;
  insert into public.utcg_card_evolutions (user_id, player_id, team_slug, year, evo_key)
    values (uid, p_player_id, p_team_slug, p_year, p_key);
  return jsonb_build_object('evo_key', p_key, 'stage', 0, 'boost', 0);
end $function$;
revoke execute on function public.utcg_evolution_start(text, text, text, int) from public, anon;
grant execute on function public.utcg_evolution_start(text, text, text, int) to authenticated;

-- +1 game for each in-progress evolution among the squad's cards.
create or replace function public.utcg_evolution_progress(p_uid uuid, p_cards jsonb)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare e record; st jsonb; new_stage int; new_boost numeric; last_idx int;
begin
  for e in
    select ev.*, d.stages from public.utcg_card_evolutions ev
    join public.utcg_evolution_defs d on d.key = ev.evo_key
    where ev.user_id = p_uid and ev.completed_at is null
      and exists (select 1 from jsonb_array_elements(p_cards) x
                  where x->>'player_id' = ev.player_id and x->>'team_slug' = ev.team_slug
                    and (x->>'year')::int = ev.year)
    for update of ev
  loop
    new_stage := 0; new_boost := 0;
    last_idx := jsonb_array_length(e.stages);
    for i in 1..last_idx loop
      st := e.stages -> (i - 1);
      if e.games + 1 >= (st->>'games')::int then
        new_stage := i; new_boost := (st->>'boost')::numeric;
      end if;
    end loop;
    update public.utcg_card_evolutions
      set games = e.games + 1, stage = new_stage, boost = new_boost,
          completed_at = case when new_stage = last_idx then now() end
      where user_id = p_uid and player_id = e.player_id and team_slug = e.team_slug and year = e.year;
  end loop;
end $function$;
revoke execute on function public.utcg_evolution_progress(uuid, jsonb) from public, anon, authenticated;

-- eval: + the scoring user's evolution boost (utcg.eval_uid, set by player RPCs).
do $eval$
declare
  v_oid oid := to_regprocedure('public.utcg_eval_lineup(text,jsonb)');
  v_def text;
  c_old constant text := E'    card.score := card.score + public.utcg_card_boost(elem->>''player_id'', elem->>''team_slug'', (elem->>''year'')::int);\n';
  c_new constant text := E'    card.score := card.score + public.utcg_card_boost(elem->>''player_id'', elem->>''team_slug'', (elem->>''year'')::int);\n'
    || E'    card.score := card.score + coalesce((select e.boost from public.utcg_card_evolutions e\n'
    || E'      where e.user_id = nullif(current_setting(''utcg.eval_uid'', true), '''')::uuid\n'
    || E'        and e.player_id = elem->>''player_id'' and e.team_slug = elem->>''team_slug''\n'
    || E'        and e.year = (elem->>''year'')::int), 0);\n';
begin
  v_def := pg_get_functiondef(v_oid);
  if position(c_new in v_def) > 0 then raise notice 'eval_lineup already has evolutions'; return; end if;
  if (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 then
    raise exception 'eval_lineup boost anchor not unique';
  end if;
  execute replace(v_def, c_old, c_new);
end
$eval$;

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

-- Scoring the caller's own squad: set utcg.eval_uid first; count evolution games after.
select pg_temp.utcg_patch('public.utcg_record_match(text,jsonb)',
$o$  ev := public.utcg_eval_lineup(p_formation, p_cards);$o$,
$n$  perform set_config('utcg.eval_uid', uid::text, true);
  ev := public.utcg_eval_lineup(p_formation, p_cards);$n$);
select pg_temp.utcg_patch('public.utcg_record_match(text,jsonb)',
$o$  perform public.utcg_on_game_finished(uid, 'squad', wins);$o$,
$n$  perform public.utcg_on_game_finished(uid, 'squad', wins);
  perform public.utcg_evolution_progress(uid, p_cards);$n$);

select pg_temp.utcg_patch('public.utcg_pvp_enter(text,jsonb)',
$o$  ev := public.utcg_eval_lineup(p_formation, p_cards);$o$,
$n$  perform set_config('utcg.eval_uid', uid::text, true);
  ev := public.utcg_eval_lineup(p_formation, p_cards);$n$);

select pg_temp.utcg_patch('public.utcg_rivals_enter(text,jsonb)',
$o$  ev := public.utcg_eval_lineup(p_formation, p_cards);$o$,
$n$  perform set_config('utcg.eval_uid', uid::text, true);
  ev := public.utcg_eval_lineup(p_formation, p_cards);$n$);
select pg_temp.utcg_patch('public.utcg_rivals_enter(text,jsonb)',
$o$  perform public.utcg_on_game_finished(uid, 'rivals', case when outcome = 'challenger' then 1 else 0 end);$o$,
$n$  perform public.utcg_on_game_finished(uid, 'rivals', case when outcome = 'challenger' then 1 else 0 end);
  perform public.utcg_evolution_progress(uid, p_cards);$n$);

select pg_temp.utcg_patch('public.utcg_brawl_play(text,jsonb)',
$o$  ev := public.utcg_eval_lineup(p_formation, p_cards);$o$,
$n$  perform set_config('utcg.eval_uid', uid::text, true);
  ev := public.utcg_eval_lineup(p_formation, p_cards);$n$);
select pg_temp.utcg_patch('public.utcg_brawl_play(text,jsonb)',
$o$  pack_id := public.utcg_finish_weekly_play(uid, 'brawl', strength, won, 'bronze');$o$,
$n$  pack_id := public.utcg_finish_weekly_play(uid, 'brawl', strength, won, 'bronze');
  perform public.utcg_evolution_progress(uid, p_cards);$n$);

-- Boss: its squad is scored BEFORE the GUC is set, so a user's evolutions never boost the boss.
select pg_temp.utcg_patch('public.utcg_boss_play(text,jsonb)',
$o$  ev := public.utcg_eval_lineup(p_formation, p_cards);$o$,
$n$  perform set_config('utcg.eval_uid', uid::text, true);
  ev := public.utcg_eval_lineup(p_formation, p_cards);$n$);
select pg_temp.utcg_patch('public.utcg_boss_play(text,jsonb)',
$o$  pack_id := public.utcg_finish_weekly_play(uid, 'boss', strength, won, 'silver');$o$,
$n$  pack_id := public.utcg_finish_weekly_play(uid, 'boss', strength, won, 'silver');
  perform public.utcg_evolution_progress(uid, p_cards);$n$);

-- SBC hand-ins leave an evolved card's locked copy in place.
select pg_temp.utcg_patch('public.utcg_sbc_submit(text,jsonb)',
$o$    take_untr := least(oc.untradeable_copies, c.qty);
$o$,
$n$    if exists (select 1 from public.utcg_card_evolutions e
               where e.user_id = uid and e.player_id = c.player_id
                 and e.team_slug = c.team_slug and e.year = c.yr) then
      if oc.copies - c.qty < 1 then
        raise exception 'an evolved card must keep one copy';
      end if;
      take_untr := least(greatest(oc.untradeable_copies - 1, 0), c.qty);
    else
      take_untr := least(oc.untradeable_copies, c.qty);
    end if;
$n$);

create or replace function public.utcg_evolution_state()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then return null; end if;
  return jsonb_build_object(
    'defs', coalesce((select jsonb_agg(jsonb_build_object('key', d.key, 'name', d.name,
              'description', d.description, 'max_score', d.max_score, 'max_year', d.max_year,
              'stages', d.stages) order by d.key)
            from public.utcg_evolution_defs d where d.active), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('player_id', e.player_id,
              'team_slug', e.team_slug, 'year', e.year, 'evo_key', e.evo_key, 'games', e.games,
              'stage', e.stage, 'boost', e.boost, 'completed', e.completed_at is not null)
              order by e.started_at desc)
            from public.utcg_card_evolutions e where e.user_id = uid), '[]'::jsonb));
end $function$;
revoke execute on function public.utcg_evolution_state() from public, anon;
grant execute on function public.utcg_evolution_state() to authenticated;

notify pgrst, 'reload schema';
