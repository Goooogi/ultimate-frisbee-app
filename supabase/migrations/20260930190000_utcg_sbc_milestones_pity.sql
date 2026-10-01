-- UTCG Phase 2 — card sinks + collection goals (proposal: SBCs are the main
-- sink; untradeable rewards; pity + pack points à la Hearthstone / TCG Pocket).
--   * SBC board: submit a set of cards meeting requirements; they're destroyed
--     (untradeable copies first) for an untradeable reward pack. One-time SBCs,
--     plus repeatable exchanges capped per ISO week.
--   * Collection milestones: distinct cards owned (25/50/100/200/400) and team
--     sets (10 distinct players from one team-season), each claimable once.
--   * Pity: a bought/free/reward pack that would make it 40 packs without an
--     All-Time Elite+ (rank 6+) upgrades one pull to rank 6.
--   * Pack points: +25 per bought or free pack (not reward packs); spent in
--     utcg_craft_card on any card at 2× its quicksell value. Crafted = untradeable.
-- Mirrors: src/lib/utcg/sinks.ts.

-- ── pity + pack points in the shared roller ─────────────────────────────────
alter table public.utcg_wallets
  add column if not exists pity_counter int not null default 0,
  add column if not exists pack_points int not null default 0;
alter table public.utcg_wallets drop constraint if exists utcg_wallets_pack_points_nonneg;
alter table public.utcg_wallets add constraint utcg_wallets_pack_points_nonneg check (pack_points >= 0);

create or replace function public.utcg_roll_pack(p_uid uuid, p_kind text, p_untradeable boolean default false)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  cfg record;
  i int; rolled_rank int; wsum numeric; r numeric; picked record; picked_player text;
  pulls jsonb := '[]'::jsonb; got_guarantee boolean := false; is_new boolean;
  pity int; got_elite boolean := false; pity_hit boolean := false;
begin
  select * into cfg from public.utcg_pack_config(p_kind);
  if cfg is null then raise exception 'unknown pack %', p_kind; end if;
  select pity_counter into pity from public.utcg_wallets where user_id = p_uid for update;
  pity := coalesce(pity, 0);

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
    -- Pity: the 40th pack without a rank 6+ card upgrades its last pull.
    if i = cfg.size and not got_elite and pity >= 39 and rolled_rank < 6 then
      rolled_rank := 6;
      pity_hit := true;
    end if;
    if rolled_rank >= cfg.guarantee_rank then got_guarantee := true; end if;
    if rolled_rank >= 6 then got_elite := true; end if;

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
      'is_new', is_new, 'untradeable', p_untradeable,
      'pity', pity_hit and i = cfg.size);
  end loop;

  update public.utcg_wallets
    set pity_counter = case when got_elite then 0 else pity + 1 end,
        pack_points = pack_points + case when p_untradeable then 0 else 25 end
    where user_id = p_uid;
  return pulls;
end $function$;
revoke execute on function public.utcg_roll_pack(uuid, text, boolean) from public, anon, authenticated;

-- ── crafting ────────────────────────────────────────────────────────────────
create or replace function public.utcg_craft_cost(p_rank int)
returns int language sql immutable set search_path to 'public' as $function$
  select 2 * public.utcg_quicksell_value(p_rank);
$function$;
revoke execute on function public.utcg_craft_cost(int) from public, anon, authenticated;

create or replace function public.utcg_craft_card(p_player_id text, p_team_slug text, p_year int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); score numeric; cost int; w public.utcg_wallets;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.player_score::numeric into score from public.twelve_oh_players p
    where p.league = 'ufa' and p.player_id = p_player_id
      and p.team_slug = p_team_slug and p.year = p_year;
  if score is null then raise exception 'card not found'; end if;
  cost := public.utcg_craft_cost(public.utcg_tier_rank(score));

  perform public.utcg_ensure_wallet();
  select * into w from public.utcg_wallets where user_id = uid for update;
  if w.pack_points < cost then
    raise exception 'not enough pack points (need %, have %)', cost, w.pack_points;
  end if;
  update public.utcg_wallets set pack_points = pack_points - cost where user_id = uid
    returning * into w;

  insert into public.utcg_owned_cards
    (user_id, league, player_id, team_slug, year, copies, untradeable_copies)
    values (uid, 'ufa', p_player_id, p_team_slug, p_year, 1, 1)
    on conflict (user_id, league, player_id, team_slug, year)
      do update set copies = public.utcg_owned_cards.copies + 1,
                    untradeable_copies = public.utcg_owned_cards.untradeable_copies + 1;
  return jsonb_build_object('pack_points', w.pack_points, 'cost', cost);
end $function$;
revoke execute on function public.utcg_craft_card(text, text, int) from public, anon;
grant execute on function public.utcg_craft_card(text, text, int) to authenticated;

-- ── SBC board ───────────────────────────────────────────────────────────────
create table if not exists public.utcg_sbc_defs (
  key text primary key,
  name text not null,
  description text not null,
  -- count (req), min_avg, min_rank, max_rank, min_teams, max_teams, same_team,
  -- min_year, max_year, rank_at_least {rank, count}
  requirements jsonb not null,
  reward_pack text not null,
  repeatable boolean not null default false,
  weekly_limit int,
  sort int not null default 0,
  active boolean not null default true
);
alter table public.utcg_sbc_defs enable row level security;
drop policy if exists utcg_sbc_defs_select_all on public.utcg_sbc_defs;
create policy utcg_sbc_defs_select_all on public.utcg_sbc_defs for select using (true);
revoke insert, update, delete on public.utcg_sbc_defs from anon, authenticated;

insert into public.utcg_sbc_defs
  (key, name, description, requirements, reward_pack, repeatable, weekly_limit, sort) values
  ('bench_clearout', 'Bench Clear-Out', '10 Fringe or League Average cards',
   '{"count":10,"max_rank":2}', 'bronze', true, 5, 10),
  ('contributor_swap', 'Contributor Swap', '7 Contributor cards',
   '{"count":7,"min_rank":3,"max_rank":3}', 'silver', true, 3, 20),
  ('franchise_core', 'Franchise Core', '7 cards from one franchise, 78+ average',
   '{"count":7,"same_team":true,"min_avg":78}', 'silver', false, null, 30),
  ('old_school', 'Old School', '7 cards from 2016 or earlier, 3+ franchises',
   '{"count":7,"max_year":2016,"min_teams":3}', 'silver', false, null, 40),
  ('star_power', 'Star Power', '7 cards, 82+ average, at least 2 Star or better',
   '{"count":7,"min_avg":82,"rank_at_least":{"rank":5,"count":2}}', 'gold', false, null, 50),
  ('league_all_stars', 'League All-Stars', '7 cards from 7 franchises, 84+ average',
   '{"count":7,"min_teams":7,"min_avg":84}', 'gold', false, null, 60)
on conflict (key) do nothing;

create table if not exists public.utcg_sbc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sbc_key text not null references public.utcg_sbc_defs(key),
  cards jsonb not null,
  reward_pack_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists utcg_sbc_submissions_user_idx
  on public.utcg_sbc_submissions (user_id, sbc_key, created_at desc);
alter table public.utcg_sbc_submissions enable row level security;
drop policy if exists utcg_sbc_submissions_select_own on public.utcg_sbc_submissions;
create policy utcg_sbc_submissions_select_own on public.utcg_sbc_submissions
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_sbc_submissions from anon, authenticated;

-- p_cards: one element per COPY submitted ({player_id, team_slug, year});
-- the same card may repeat to hand in duplicates.
create or replace function public.utcg_sbc_submit(p_key text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid(); d public.utcg_sbc_defs; req jsonb; n int; ok boolean;
  st record; c record; oc public.utcg_owned_cards; take_untr int; pack_id uuid; done_count int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into d from public.utcg_sbc_defs where key = p_key and active;
  if d is null then raise exception 'SBC not found'; end if;
  req := d.requirements;

  if not d.repeatable and exists (
    select 1 from public.utcg_sbc_submissions where user_id = uid and sbc_key = p_key) then
    raise exception 'SBC already completed';
  end if;
  if d.repeatable and d.weekly_limit is not null then
    select count(*) into done_count from public.utcg_sbc_submissions
      where user_id = uid and sbc_key = p_key
        and created_at >= date_trunc('week', now());
    if done_count >= d.weekly_limit then
      raise exception 'weekly limit reached for this SBC (% per week)', d.weekly_limit;
    end if;
  end if;

  n := coalesce(jsonb_array_length(p_cards), 0);
  if n <> (req->>'count')::int then
    raise exception 'this SBC needs exactly % cards', req->>'count';
  end if;

  select count(*) filter (where p.player_id is null) missing,
         avg(p.player_score::numeric) avg_score,
         min(public.utcg_tier_rank(p.player_score::numeric)) min_rank,
         max(public.utcg_tier_rank(p.player_score::numeric)) max_rank,
         count(distinct e->>'team_slug') teams,
         min((e->>'year')::int) min_year, max((e->>'year')::int) max_year,
         count(*) filter (where public.utcg_tier_rank(p.player_score::numeric)
                                >= coalesce((req->'rank_at_least'->>'rank')::int, 99)) ranked
    into st
    from jsonb_array_elements(p_cards) e
    left join public.twelve_oh_players p
      on p.league = 'ufa' and p.player_id = e->>'player_id'
     and p.team_slug = e->>'team_slug' and p.year = (e->>'year')::int;
  if st.missing > 0 then raise exception 'unknown card in submission'; end if;

  ok := (req->'min_avg' is null or st.avg_score >= (req->>'min_avg')::numeric)
    and (req->'min_rank' is null or st.min_rank >= (req->>'min_rank')::int)
    and (req->'max_rank' is null or st.max_rank <= (req->>'max_rank')::int)
    and (req->'min_teams' is null or st.teams >= (req->>'min_teams')::int)
    and (req->'max_teams' is null or st.teams <= (req->>'max_teams')::int)
    and (req->'same_team' is null or not (req->>'same_team')::boolean or st.teams = 1)
    and (req->'min_year' is null or st.min_year >= (req->>'min_year')::int)
    and (req->'max_year' is null or st.max_year <= (req->>'max_year')::int)
    and (req->'rank_at_least' is null or st.ranked >= (req->'rank_at_least'->>'count')::int);
  if not ok then raise exception 'submission doesn''t meet the requirements'; end if;

  -- Consume copies, untradeable first. A card in the parked PvP squad must keep one copy.
  for c in
    select e->>'player_id' player_id, e->>'team_slug' team_slug, (e->>'year')::int yr, count(*)::int qty
    from jsonb_array_elements(p_cards) e group by 1, 2, 3
  loop
    select * into oc from public.utcg_owned_cards
      where user_id = uid and league = 'ufa' and player_id = c.player_id
        and team_slug = c.team_slug and year = c.yr
      for update;
    if oc is null or oc.copies < c.qty then
      raise exception 'not enough copies of % (%)', c.player_id, c.yr;
    end if;
    if oc.copies - c.qty < 1 and exists (
      select 1 from public.utcg_pvp_squads s, jsonb_array_elements(s.cards) x
      where s.user_id = uid and s.consumed_at is null and s.staked_coins > 0
        and x->>'player_id' = c.player_id and x->>'team_slug' = c.team_slug
        and (x->>'year')::int = c.yr) then
      raise exception 'a card is in your parked PvP squad — withdraw the squad first';
    end if;
    take_untr := least(oc.untradeable_copies, c.qty);
    if oc.copies = c.qty then
      delete from public.utcg_owned_cards
        where user_id = uid and league = 'ufa' and player_id = c.player_id
          and team_slug = c.team_slug and year = c.yr;
    else
      update public.utcg_owned_cards
        set copies = copies - c.qty, untradeable_copies = untradeable_copies - take_untr
        where user_id = uid and league = 'ufa' and player_id = c.player_id
          and team_slug = c.team_slug and year = c.yr;
    end if;
  end loop;

  perform public.utcg_ensure_wallet();
  pack_id := public.utcg_grant_reward_pack(uid, d.reward_pack, 'sbc:' || d.key);
  insert into public.utcg_sbc_submissions (user_id, sbc_key, cards, reward_pack_id)
    values (uid, d.key, p_cards, pack_id);
  return jsonb_build_object('reward_pack_id', pack_id, 'reward_pack', d.reward_pack);
end $function$;
revoke execute on function public.utcg_sbc_submit(text, jsonb) from public, anon;
grant execute on function public.utcg_sbc_submit(text, jsonb) to authenticated;

-- ── collection milestones ───────────────────────────────────────────────────
create table if not exists public.utcg_milestone_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone text not null,  -- 'distinct:25' … or 'team_set:<team_slug>:<year>'
  claimed_at timestamptz not null default now(),
  primary key (user_id, milestone)
);
alter table public.utcg_milestone_claims enable row level security;
drop policy if exists utcg_milestone_claims_select_own on public.utcg_milestone_claims;
create policy utcg_milestone_claims_select_own on public.utcg_milestone_claims
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.utcg_milestone_claims from anon, authenticated;

create or replace function public.utcg_distinct_milestones()
returns table(threshold int, reward_pack text)
language sql immutable set search_path to 'public' as $function$
  select * from (values (25, 'bronze'), (50, 'silver'), (100, 'gold'), (200, 'gold'), (400, 'platinum'))
    as t(threshold, reward_pack);
$function$;
revoke execute on function public.utcg_distinct_milestones() from public, anon, authenticated;

-- p_milestone: 'distinct:<threshold>' or 'team_set:<team_slug>:<year>'
-- (team set = 10 distinct players from that team-season; Silver pack).
create or replace function public.utcg_claim_milestone(p_milestone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); parts text[]; have int; pack text; pack_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.utcg_milestone_claims where user_id = uid and milestone = p_milestone) then
    raise exception 'milestone already claimed';
  end if;
  parts := string_to_array(p_milestone, ':');

  if parts[1] = 'distinct' and array_length(parts, 1) = 2 then
    select m.reward_pack into pack from public.utcg_distinct_milestones() m
      where m.threshold = parts[2]::int;
    if pack is null then raise exception 'unknown milestone'; end if;
    select count(*) into have from public.utcg_owned_cards where user_id = uid;
    if have < parts[2]::int then raise exception 'milestone not reached (% of %)', have, parts[2]; end if;
  elsif parts[1] = 'team_set' and array_length(parts, 1) = 3 then
    select count(distinct player_id) into have from public.utcg_owned_cards
      where user_id = uid and team_slug = parts[2] and year = parts[3]::int;
    if have < 10 then raise exception 'team set not complete (% of 10)', have; end if;
    pack := 'silver';
  else
    raise exception 'unknown milestone';
  end if;

  perform public.utcg_ensure_wallet();
  insert into public.utcg_milestone_claims (user_id, milestone) values (uid, p_milestone);
  pack_id := public.utcg_grant_reward_pack(uid, pack, 'milestone:' || p_milestone);
  return jsonb_build_object('reward_pack_id', pack_id, 'reward_pack', pack);
end $function$;
revoke execute on function public.utcg_claim_milestone(text) from public, anon;
grant execute on function public.utcg_claim_milestone(text) to authenticated;

-- One bounded read for the Collection tab: SBC board with the caller's
-- completion/weekly counts, milestone progress, craft wallet.
create or replace function public.utcg_collection_state()
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
    'sbcs', coalesce((
      select jsonb_agg(jsonb_build_object('key', d.key, 'name', d.name, 'description', d.description,
        'requirements', d.requirements, 'reward_pack', d.reward_pack, 'repeatable', d.repeatable,
        'weekly_limit', d.weekly_limit,
        'completed', exists (select 1 from public.utcg_sbc_submissions s
                             where s.user_id = uid and s.sbc_key = d.key),
        'done_this_week', (select count(*) from public.utcg_sbc_submissions s
                           where s.user_id = uid and s.sbc_key = d.key
                             and s.created_at >= date_trunc('week', now())))
        order by d.sort)
      from public.utcg_sbc_defs d where d.active), '[]'::jsonb),
    'distinct_cards', (select count(*) from public.utcg_owned_cards where user_id = uid),
    'milestones_claimed', coalesce((
      select jsonb_agg(milestone) from public.utcg_milestone_claims where user_id = uid), '[]'::jsonb),
    'team_sets', coalesce((
      select jsonb_agg(jsonb_build_object('team_slug', t.team_slug, 'year', t.year, 'have', t.have)
                       order by t.have desc, t.year desc)
      from (select team_slug, year, count(distinct player_id) have
            from public.utcg_owned_cards where user_id = uid
            group by team_slug, year having count(distinct player_id) >= 5
            order by 3 desc limit 12) t), '[]'::jsonb),
    'pack_points', (select pack_points from public.utcg_wallets where user_id = uid),
    'pity_counter', (select pity_counter from public.utcg_wallets where user_id = uid)
  );
end $function$;
revoke execute on function public.utcg_collection_state() from public, anon;
grant execute on function public.utcg_collection_state() to authenticated;

notify pgrst, 'reload schema';
