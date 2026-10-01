-- UTCG Phase 2 — real-stats layer (proposal: TOTW in-forms, Live cards, Flash
-- challenges). Implemented as BOOSTS on existing card identities, not a wider
-- card key: utcg_eval_lineup adds a card's active boosts to its base score,
-- so every mode (Squad Battle, PvP, Rivals, Brawl, Boss, Draft) sees them and
-- no ownership/market path changes. Market floors/ceilings stay on base score.
--   * TOTW (+3, one ISO week): the 7 best real UFA performers of a week —
--     the latest completed UFA week when one exists with cards, otherwise a
--     deterministic Throwback week from history (UFA is out of season now).
--   * Live (permanent): season champions +2, finalists +1 — the final is the
--     last non-All-Star game of each season.
--   * Flash: a weekly "own 3 of this week's TOTW" challenge (Silver pack), plus
--     a repeatable-weekly TOTW SBC that grants one TOTW card (untradeable).
-- utcg_refresh_week_content() is idempotent; a daily pg_cron job at 00:05 UTC
-- runs it (cheap no-op after Monday). Boosts on one card cap at +6.
-- Mirrors: src/lib/utcg/boosts.ts.

create table if not exists public.utcg_card_boosts (
  player_id text not null,
  team_slug text not null,
  year int not null,
  boost numeric not null check (boost > 0),
  source text not null check (source in ('totw', 'live')),
  label text not null,
  starts_on date not null,
  ends_on date,  -- exclusive; null = permanent
  primary key (player_id, team_slug, year, source, starts_on)
);
create index if not exists utcg_card_boosts_active_idx on public.utcg_card_boosts (starts_on, ends_on);
alter table public.utcg_card_boosts enable row level security;
drop policy if exists utcg_card_boosts_select_all on public.utcg_card_boosts;
create policy utcg_card_boosts_select_all on public.utcg_card_boosts for select using (true);
revoke insert, update, delete on public.utcg_card_boosts from anon, authenticated;

create or replace function public.utcg_card_boost(p_player_id text, p_team_slug text, p_year int)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(least(6, sum(b.boost)), 0) from public.utcg_card_boosts b
  where b.player_id = p_player_id and b.team_slug = p_team_slug and b.year = p_year
    and current_date >= b.starts_on and (b.ends_on is null or current_date < b.ends_on);
$function$;

-- eval: base score + active boosts.
do $eval$
declare
  v_oid oid := to_regprocedure('public.utcg_eval_lineup(text,jsonb)');
  v_def text;
  c_old constant text := E'    if card is null then raise exception ''unknown card: %'', elem; end if;\n';
  c_new constant text := E'    if card is null then raise exception ''unknown card: %'', elem; end if;\n'
    || E'    card.score := card.score + public.utcg_card_boost(elem->>''player_id'', elem->>''team_slug'', (elem->>''year'')::int);\n';
begin
  v_def := pg_get_functiondef(v_oid);
  if position(c_new in v_def) > 0 then raise notice 'eval_lineup already boosted'; return; end if;
  if (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 then
    raise exception 'eval_lineup anchor not unique';
  end if;
  execute replace(v_def, c_old, c_new);
end
$eval$;

-- ── flash challenges ────────────────────────────────────────────────────────
create table if not exists public.utcg_flash_challenges (
  key text primary key,
  label text not null,
  kind text not null check (kind in ('own_totw')),
  target int not null check (target > 0),
  reward_pack text not null,
  starts_on date not null,
  ends_on date not null
);
alter table public.utcg_flash_challenges enable row level security;
drop policy if exists utcg_flash_challenges_select_all on public.utcg_flash_challenges;
create policy utcg_flash_challenges_select_all on public.utcg_flash_challenges for select using (true);
revoke insert, update, delete on public.utcg_flash_challenges from anon, authenticated;

create table if not exists public.utcg_flash_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_key text not null references public.utcg_flash_challenges(key),
  claimed_at timestamptz not null default now(),
  primary key (user_id, challenge_key)
);
alter table public.utcg_flash_claims enable row level security;
drop policy if exists utcg_flash_claims_select_own on public.utcg_flash_claims;
create policy utcg_flash_claims_select_own on public.utcg_flash_claims
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_flash_claims from anon, authenticated;

-- ── weekly content refresh (TOTW + flash) and Live champion boosts ──────────
create or replace function public.utcg_refresh_week_content()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  wk_start date := date_trunc('week', current_date)::date;
  src_year int; src_week text; lbl text; n int; y record; fin record;
begin
  -- Live: champion / finalist boosts for every season with cards.
  for y in select distinct p.year from public.twelve_oh_players p where p.league = 'ufa' loop
    continue when exists (select 1 from public.utcg_card_boosts
                          where source = 'live' and year = y.year);
    select g.home_team_id, g.away_team_id, g.home_score, g.away_score into fin
      from public.ufa_games g
      where g.year = y.year and g.status = 'Final'
        and g.home_team_id not like 'allstars%' and g.away_team_id not like 'allstars%'
      order by g.start_timestamp desc limit 1;
    continue when fin is null or fin.home_score = fin.away_score;
    insert into public.utcg_card_boosts (player_id, team_slug, year, boost, source, label, starts_on)
    select p.player_id, p.team_slug, p.year,
           case when p.team_slug = (case when fin.home_score > fin.away_score then fin.home_team_id else fin.away_team_id end)
                then 2 else 1 end,
           'live',
           case when p.team_slug = (case when fin.home_score > fin.away_score then fin.home_team_id else fin.away_team_id end)
                then 'Champion ' || p.year else 'Finalist ' || p.year end,
           date '2026-01-01'
    from public.twelve_oh_players p
    where p.league = 'ufa' and p.year = y.year and p.team_slug in (fin.home_team_id, fin.away_team_id)
    on conflict do nothing;
  end loop;

  if exists (select 1 from public.utcg_card_boosts where source = 'totw' and starts_on = wk_start) then
    return;
  end if;

  -- Source week: the latest completed UFA week (last 8 days) with cards, else Throwback.
  select g.year, g.week into src_year, src_week
    from public.ufa_games g
    where g.status = 'Final' and g.start_timestamp >= now() - interval '8 days'
      and g.week like 'week-%' and g.week <> 'week-allstars'
      and exists (select 1 from public.twelve_oh_players p where p.league = 'ufa' and p.year = g.year)
    order by g.start_timestamp desc limit 1;
  if src_year is not null then
    lbl := 'TOTW · ' || src_year || ' ' || initcap(replace(src_week, '-', ' '));
  else
    select count(*) into n from (
      select distinct g.year, g.week from public.ufa_games g
      where g.week ~ '^week-[0-9]+$'
        and exists (select 1 from public.twelve_oh_players p where p.league = 'ufa' and p.year = g.year)) t;
    select t.year, t.week into src_year, src_week from (
      select distinct g.year, g.week from public.ufa_games g
      where g.week ~ '^week-[0-9]+$'
        and exists (select 1 from public.twelve_oh_players p where p.league = 'ufa' and p.year = g.year)
      order by g.year, g.week) t
    offset (public.utcg_week_index() * 37) % n limit 1;
    lbl := 'Throwback TOTW · ' || src_year || ' ' || initcap(replace(src_week, '-', ' '));
  end if;

  insert into public.utcg_card_boosts (player_id, team_slug, year, boost, source, label, starts_on, ends_on)
  select s.player_id, s.team_id, g.year, 3, 'totw', lbl, wk_start, wk_start + 7
    from public.ufa_game_player_stats s
    join public.ufa_games g on g.id = s.game_id
    where g.year = src_year and g.week = src_week
      and exists (select 1 from public.twelve_oh_players p
                  where p.league = 'ufa' and p.player_id = s.player_id
                    and p.team_slug = s.team_id and p.year = g.year)
    group by s.player_id, s.team_id, g.year
    order by sum(s.goals + s.assists + s.blocks * 1.5 + s.callahans * 2
                 - s.throwaways * 0.5 - s.drops * 0.5) desc,
             sum(s.yards_thrown + s.yards_received) desc
    limit 7
  on conflict do nothing;

  insert into public.utcg_flash_challenges (key, label, kind, target, reward_pack, starts_on, ends_on)
    values ('own_totw:' || wk_start, 'Own 3 of this week''s Team of the Week', 'own_totw', 3,
            'silver', wk_start, wk_start + 7)
    on conflict (key) do nothing;
end $function$;
revoke execute on function public.utcg_refresh_week_content() from public, anon, authenticated;

create or replace function public.utcg_claim_flash(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); f public.utcg_flash_challenges; have int; pack_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into f from public.utcg_flash_challenges where key = p_key;
  if f is null then raise exception 'challenge not found'; end if;
  if current_date < f.starts_on or current_date >= f.ends_on then raise exception 'challenge is not active'; end if;
  if exists (select 1 from public.utcg_flash_claims where user_id = uid and challenge_key = p_key) then
    raise exception 'already claimed';
  end if;
  if f.kind = 'own_totw' then
    select count(*) into have from public.utcg_card_boosts b
      join public.utcg_owned_cards oc
        on oc.user_id = uid and oc.league = 'ufa' and oc.player_id = b.player_id
       and oc.team_slug = b.team_slug and oc.year = b.year
      where b.source = 'totw' and b.starts_on = f.starts_on;
  end if;
  if coalesce(have, 0) < f.target then raise exception 'not complete yet (% of %)', coalesce(have, 0), f.target; end if;

  perform public.utcg_ensure_wallet();
  insert into public.utcg_flash_claims (user_id, challenge_key) values (uid, p_key);
  pack_id := public.utcg_grant_reward_pack(uid, f.reward_pack, 'flash:' || p_key);
  return jsonb_build_object('reward_pack_id', pack_id, 'reward_pack', f.reward_pack);
end $function$;
revoke execute on function public.utcg_claim_flash(text) from public, anon;
grant execute on function public.utcg_claim_flash(text) to authenticated;

-- ── TOTW SBC: 7 cards (80+ avg) → one random TOTW card, untradeable ─────────
insert into public.utcg_sbc_defs
  (key, name, description, requirements, reward_pack, repeatable, weekly_limit, sort) values
  ('totw_upgrade', 'TOTW Upgrade', '7 cards, 80+ average → a random Team of the Week card',
   '{"count":7,"min_avg":80}', 'totw', true, 1, 5)
on conflict (key) do nothing;

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

select pg_temp.utcg_patch('public.utcg_sbc_submit(text,jsonb)',
$o$  pack_id := public.utcg_grant_reward_pack(uid, d.reward_pack, 'sbc:' || d.key);$o$,
$n$  if d.reward_pack = 'totw' then
    select b.player_id, b.team_slug, b.year into c from public.utcg_card_boosts b
      where b.source = 'totw' and current_date >= b.starts_on and current_date < b.ends_on
      order by random() limit 1;
    if c is null then raise exception 'no Team of the Week this week'; end if;
    insert into public.utcg_owned_cards
      (user_id, league, player_id, team_slug, year, copies, untradeable_copies)
      values (uid, 'ufa', c.player_id, c.team_slug, c.year, 1, 1)
      on conflict (user_id, league, player_id, team_slug, year)
        do update set copies = public.utcg_owned_cards.copies + 1,
                      untradeable_copies = public.utcg_owned_cards.untradeable_copies + 1;
    insert into public.utcg_sbc_submissions (user_id, sbc_key, cards) values (uid, d.key, p_cards);
    return jsonb_build_object('reward_pack', 'totw', 'card',
      jsonb_build_object('player_id', c.player_id, 'team_slug', c.team_slug, 'year', c.year));
  end if;
  pack_id := public.utcg_grant_reward_pack(uid, d.reward_pack, 'sbc:' || d.key);$n$);

-- Weekly state gains TOTW + flash (with the caller's ownership / claim status).
create or replace function public.utcg_week_extras()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then return null; end if;
  return jsonb_build_object(
    'totw', coalesce((
      select jsonb_agg(jsonb_build_object('player_id', b.player_id, 'team_slug', b.team_slug,
               'year', b.year, 'boost', b.boost, 'label', b.label,
               'name', p.name, 'team_abbr', p.team_abbr, 'score', p.player_score,
               'owned', exists (select 1 from public.utcg_owned_cards oc
                                where oc.user_id = uid and oc.league = 'ufa'
                                  and oc.player_id = b.player_id and oc.team_slug = b.team_slug
                                  and oc.year = b.year))
             order by p.player_score desc)
      from public.utcg_card_boosts b
      join public.twelve_oh_players p
        on p.league = 'ufa' and p.player_id = b.player_id and p.team_slug = b.team_slug and p.year = b.year
      where b.source = 'totw' and current_date >= b.starts_on and current_date < b.ends_on), '[]'::jsonb),
    'flash', coalesce((
      select jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'kind', f.kind,
               'target', f.target, 'reward_pack', f.reward_pack, 'ends_on', f.ends_on,
               'claimed', exists (select 1 from public.utcg_flash_claims c
                                  where c.user_id = uid and c.challenge_key = f.key)))
      from public.utcg_flash_challenges f
      where current_date >= f.starts_on and current_date < f.ends_on), '[]'::jsonb),
    'owned_boosts', coalesce((
      select jsonb_agg(jsonb_build_object('player_id', oc.player_id, 'team_slug', oc.team_slug,
               'year', oc.year, 'boost', public.utcg_card_boost(oc.player_id, oc.team_slug, oc.year),
               'labels', (select jsonb_agg(b.label) from public.utcg_card_boosts b
                          where b.player_id = oc.player_id and b.team_slug = oc.team_slug
                            and b.year = oc.year and current_date >= b.starts_on
                            and (b.ends_on is null or current_date < b.ends_on))))
      from public.utcg_owned_cards oc
      where oc.user_id = uid
        and exists (select 1 from public.utcg_card_boosts b
                    where b.player_id = oc.player_id and b.team_slug = oc.team_slug
                      and b.year = oc.year and current_date >= b.starts_on
                      and (b.ends_on is null or current_date < b.ends_on))), '[]'::jsonb));
end $function$;
revoke execute on function public.utcg_week_extras() from public, anon;
grant execute on function public.utcg_week_extras() to authenticated;
revoke execute on function public.utcg_card_boost(text, text, int) from public, anon;

select public.utcg_refresh_week_content();

select cron.schedule('utcg-week-content-daily', '5 0 * * *', $cron$ select public.utcg_refresh_week_content(); $cron$);

notify pgrst, 'reload schema';
