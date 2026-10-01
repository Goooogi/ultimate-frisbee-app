-- UTCG Phase 2 foundation — untradeable copies + reward packs.
-- Earned rewards (Brawl first win, Rivals weekly, SBCs, season track,
-- milestones) must not be liquidatable or tradeable, or every new reward is
-- another funnel faucet (FC's untradeables model). Per card identity:
--   copies             total owned (unchanged meaning)
--   untradeable_copies how many of those can't be listed, offered or quicksold
-- The market (utcg_market_take_card) and quicksell only move TRADEABLE copies;
-- play paths only need copies ≥ 1, so untradeable cards still play.
--
-- The pull loop moves out of utcg_open_pack (remote-only) into
-- utcg_roll_pack (committed here), shared by bought packs and reward packs.
-- utcg_open_pack is patched to call it — same behavior, one roller.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

alter table public.utcg_owned_cards
  add column if not exists untradeable_copies int not null default 0;
alter table public.utcg_owned_cards
  drop constraint if exists utcg_owned_cards_untradeable_range;
alter table public.utcg_owned_cards
  add constraint utcg_owned_cards_untradeable_range
  check (untradeable_copies >= 0 and untradeable_copies <= copies);

-- Rolls one pack of p_kind (utcg_pack_config odds + guarantee) into p_uid's
-- collection. Internal — called only from SECURITY DEFINER RPCs.
create or replace function public.utcg_roll_pack(p_uid uuid, p_kind text, p_untradeable boolean default false)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  cfg record;
  i int; rolled_rank int; wsum numeric; r numeric; picked record; picked_player text;
  pulls jsonb := '[]'::jsonb; got_guarantee boolean := false; is_new boolean;
begin
  select * into cfg from public.utcg_pack_config(p_kind);
  if cfg is null then raise exception 'unknown pack %', p_kind; end if;

  wsum := cfg.w_greatest + cfg.w_elite + cfg.w_star + cfg.w_solidpro
        + cfg.w_contributor + cfg.w_leagueavg + cfg.w_fringe;

  for i in 1..cfg.size loop
    r := random() * wsum;
    rolled_rank := case
      when r < cfg.w_greatest then 7
      when r < cfg.w_greatest + cfg.w_elite then 6
      when r < cfg.w_greatest + cfg.w_elite + cfg.w_star then 5
      when r < cfg.w_greatest + cfg.w_elite + cfg.w_star + cfg.w_solidpro then 4
      when r < cfg.w_greatest + cfg.w_elite + cfg.w_star + cfg.w_solidpro + cfg.w_contributor then 3
      when r < cfg.w_greatest + cfg.w_elite + cfg.w_star + cfg.w_solidpro + cfg.w_contributor + cfg.w_leagueavg then 2
      else 1 end;

    if i = cfg.size and not got_guarantee and rolled_rank < cfg.guarantee_rank then
      rolled_rank := cfg.guarantee_rank;
    end if;
    if rolled_rank >= cfg.guarantee_rank then got_guarantee := true; end if;

    select p.player_id into picked_player
      from public.twelve_oh_players p
      where p.league = 'ufa'
        and public.utcg_tier_rank(p.player_score::numeric) = rolled_rank
      group by p.player_id
      order by random() limit 1;

    if picked_player is null then
      select p.player_id into picked_player
        from public.twelve_oh_players p
        where p.league = 'ufa'
        group by p.player_id
        order by min(abs(public.utcg_tier_rank(p.player_score::numeric) - rolled_rank)), random()
        limit 1;
    end if;

    select p.player_id, p.name, p.team_slug, p.team_abbr, p.year,
           p.player_score::numeric as player_score
      into picked
      from public.twelve_oh_players p
      where p.league = 'ufa' and p.player_id = picked_player
      order by random() limit 1;

    insert into public.utcg_owned_cards
      (user_id, league, player_id, team_slug, year, copies, untradeable_copies)
      values (p_uid, 'ufa', picked.player_id, picked.team_slug, picked.year, 1,
              case when p_untradeable then 1 else 0 end)
      on conflict (user_id, league, player_id, team_slug, year)
        do update set copies = public.utcg_owned_cards.copies + 1,
                      untradeable_copies = public.utcg_owned_cards.untradeable_copies
                                         + excluded.untradeable_copies
      returning (xmax = 0) into is_new;

    pulls := pulls || jsonb_build_object(
      'player_id', picked.player_id, 'name', picked.name,
      'team_slug', picked.team_slug, 'team_abbr', picked.team_abbr,
      'year', picked.year, 'player_score', picked.player_score,
      'tier_rank', public.utcg_tier_rank(picked.player_score),
      'is_new', is_new, 'untradeable', p_untradeable);
  end loop;

  return pulls;
end $function$;
revoke execute on function public.utcg_roll_pack(uuid, text, boolean) from public, anon, authenticated;

-- utcg_open_pack: replace its inline loop with the shared roller.
do $open_pack$
declare
  v_oid oid := to_regprocedure('public.utcg_open_pack(text)');
  v_def text; s int; e int;
  c_start constant text := '  wsum := cfg.w_greatest + cfg.w_elite';
  c_end constant text := E'  end loop;\n';
  c_new constant text := E'  pulls := public.utcg_roll_pack(uid, p_kind, false);\n';
begin
  if v_oid is null then raise exception 'utcg_open_pack not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(c_new in v_def) > 0 then raise notice 'utcg_open_pack already patched'; return; end if;
  if (length(v_def) - length(replace(v_def, c_start, ''))) / length(c_start) <> 1
     or (length(v_def) - length(replace(v_def, c_end, ''))) / length(c_end) <> 1 then
    raise exception 'utcg_open_pack anchors not unique';
  end if;
  s := position(c_start in v_def);
  e := position(c_end in v_def) + length(c_end);
  if e <= s then raise exception 'utcg_open_pack anchors out of order'; end if;
  execute overlay(v_def placing c_new from s for e - s);
end
$open_pack$;

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

-- Market moves only tradeable copies.
select pg_temp.utcg_patch('public.utcg_market_take_card(uuid,text,text,text,integer,integer)',
$o$declare have int;
$o$,
$n$declare have int; untr int;
$n$);
select pg_temp.utcg_patch('public.utcg_market_take_card(uuid,text,text,text,integer,integer)',
$o$  select copies into have from public.utcg_owned_cards$o$,
$n$  select copies, untradeable_copies into have, untr from public.utcg_owned_cards$n$);
select pg_temp.utcg_patch('public.utcg_market_take_card(uuid,text,text,text,integer,integer)',
$o$    raise exception 'card not owned in sufficient quantity';
  end if;
$o$,
$n$    raise exception 'card not owned in sufficient quantity';
  end if;
  if have - untr < p_qty then
    raise exception 'not enough tradeable copies (reward cards can''t be traded)';
  end if;
$n$);

-- Quicksell never liquidates untradeable copies (and still keeps the last copy).
select pg_temp.utcg_patch('public.utcg_quicksell(text,text,integer,integer)',
$o$  select oc.copies, p.player_score::numeric as score$o$,
$n$  select oc.copies, oc.untradeable_copies, p.player_score::numeric as score$n$);
select pg_temp.utcg_patch('public.utcg_quicksell(text,text,integer,integer)',
$o$  sellable := owned.copies - 1;$o$,
$n$  sellable := least(owned.copies - 1, owned.copies - owned.untradeable_copies);$n$);

-- Reward packs: an inventory of unopened packs granted by game features.
create table if not exists public.utcg_reward_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_kind text not null,
  source text not null,
  granted_at timestamptz not null default now(),
  opened_at timestamptz,
  pulls jsonb
);
create index if not exists utcg_reward_packs_unopened_idx
  on public.utcg_reward_packs (user_id) where opened_at is null;
alter table public.utcg_reward_packs enable row level security;
drop policy if exists utcg_reward_packs_select_own on public.utcg_reward_packs;
create policy utcg_reward_packs_select_own on public.utcg_reward_packs
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_reward_packs from anon, authenticated;

create or replace function public.utcg_grant_reward_pack(p_uid uuid, p_kind text, p_source text)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if (select count(*) from public.utcg_pack_config(p_kind)) = 0 then
    raise exception 'unknown pack %', p_kind;
  end if;
  insert into public.utcg_reward_packs (user_id, pack_kind, source)
    values (p_uid, p_kind, p_source) returning id into v_id;
  return v_id;
end $function$;
revoke execute on function public.utcg_grant_reward_pack(uuid, text, text) from public, anon, authenticated;

create or replace function public.utcg_open_reward_pack(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); rp public.utcg_reward_packs; v_pulls jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into rp from public.utcg_reward_packs
    where id = p_id and user_id = uid for update;
  if rp is null then raise exception 'reward pack not found'; end if;
  if rp.opened_at is not null then raise exception 'reward pack already opened'; end if;

  perform public.utcg_ensure_wallet();
  v_pulls := public.utcg_roll_pack(uid, rp.pack_kind, true);
  update public.utcg_reward_packs set opened_at = now(), pulls = v_pulls where id = rp.id;
  update public.utcg_wallets set packs_opened = packs_opened + 1 where user_id = uid;
  return v_pulls;
end $function$;
revoke execute on function public.utcg_open_reward_pack(uuid) from public, anon;
grant execute on function public.utcg_open_reward_pack(uuid) to authenticated;

notify pgrst, 'reload schema';
