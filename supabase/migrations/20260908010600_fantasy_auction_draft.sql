-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 7 of 9 — auction draft.
--
-- Clock model: current_overall on fantasy_drafts doubles as the nomination
-- counter (= the overall of the resulting pick once a nomination resolves);
-- current_started_at is the start of whichever clock is currently running
-- (nomination or bidding). Phase is derived, not stored: an open nomination
-- row means bidding is in progress; no open nomination means we're waiting
-- for the next team to nominate.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_drafts drop constraint fantasy_drafts_draft_type_check;
alter table public.fantasy_drafts add constraint fantasy_drafts_draft_type_check
  check (draft_type in ('snake','auction'));

alter table public.fantasy_drafts
  add column if not exists budget int not null default 200 check (budget between 1 and 10000),
  add column if not exists nomination_seconds int not null default 30 check (nomination_seconds between 10 and 300),
  add column if not exists bid_seconds int not null default 15 check (bid_seconds between 5 and 120),
  add column if not exists min_bid int not null default 1 check (min_bid >= 1);

alter table public.fantasy_draft_picks
  add column if not exists price int check (price is null or price >= 0);

create table public.fantasy_draft_prices (
  draft_id      uuid not null references public.fantasy_drafts(id) on delete cascade,
  player_league text not null check (player_league in ('ufa','usau','pul','wul','wfdf','euf')),
  player_id     text not null,
  price         int not null check (price >= 1),
  primary key (draft_id, player_league, player_id)
);

comment on table public.fantasy_draft_prices is 'Commissioner-set suggested opening bids for an auction draft, via fantasy_set_draft_prices. Read by fantasy_nominate/fantasy_auction_advance as the opening-bid floor for a player; absent = min_bid.';

alter table public.fantasy_draft_prices enable row level security;

create policy "fantasy_draft_prices public read"
  on public.fantasy_draft_prices for select
  to anon, authenticated
  using (true);

create table public.fantasy_draft_nominations (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references public.fantasy_drafts(id) on delete cascade,
  overall       int not null,
  team_id       uuid not null references public.fantasy_teams(id) on delete cascade,  -- nominator
  player_league text not null check (player_league in ('ufa','usau','pul','wul','wfdf','euf')),
  player_id     text not null,
  player_name   text not null,
  opened_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  high_bid      int not null check (high_bid >= 1),
  high_team_id  uuid not null references public.fantasy_teams(id) on delete cascade,
  status        text not null default 'open' check (status in ('open','won')),
  auto          boolean not null default false,
  closed_at     timestamptz,
  unique (draft_id, overall),
  unique (draft_id, player_league, player_id)
);

create unique index fantasy_draft_nominations_one_open
  on public.fantasy_draft_nominations(draft_id)
  where status = 'open';

create index fantasy_draft_nominations_draft_idx on public.fantasy_draft_nominations(draft_id);

comment on table public.fantasy_draft_nominations is 'Auction nomination/bidding board — one row per player put up for bid. At most one status=open row per draft (partial unique index) enforces a single active nomination at a time. Won rows are the auction equivalent of fantasy_draft_picks entries for snake drafts.';

alter table public.fantasy_draft_nominations enable row level security;

create policy "fantasy_draft_nominations public read"
  on public.fantasy_draft_nominations for select
  to anon, authenticated
  using (true);

create table public.fantasy_draft_bids (
  id            uuid primary key default gen_random_uuid(),
  nomination_id uuid not null references public.fantasy_draft_nominations(id) on delete cascade,
  team_id       uuid not null references public.fantasy_teams(id) on delete cascade,
  amount        int not null check (amount >= 1),
  created_at    timestamptz not null default now()
);

create index fantasy_draft_bids_nomination_idx on public.fantasy_draft_bids(nomination_id);

comment on table public.fantasy_draft_bids is 'Append-only bid history for one nomination. The nomination row itself carries the current high bid/team for fast reads; this table is the audit trail + realtime bid-ticker feed.';

alter table public.fantasy_draft_bids enable row level security;

create policy "fantasy_draft_bids public read"
  on public.fantasy_draft_bids for select
  to anon, authenticated
  using (true);

-- No client write policies on any of the three tables above — RPC-only.

alter publication supabase_realtime add table public.fantasy_draft_nominations;
alter publication supabase_realtime add table public.fantasy_draft_bids;

-- ── fantasy_auction_team_to_nominate — internal, mirrors teamToNominate() ────
-- Nominator = draft_order[(current_overall-1) mod n], skipping teams with no
-- open roster slots left or less than min_bid remaining. Returns NULL when
-- every team is full/broke (auction is effectively over).
create or replace function public.fantasy_auction_team_to_nominate(p_draft uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_draft      public.fantasy_drafts;
  n            int;
  i            int;
  v_team       uuid;
  v_spent      int;
  v_open_slots int;
  v_remaining  int;
begin
  select * into v_draft from public.fantasy_drafts where id = p_draft;
  if v_draft is null then
    return null;
  end if;

  n := jsonb_array_length(v_draft.draft_order);
  if n = 0 then
    return null;
  end if;

  for i in 0 .. n - 1 loop
    v_team := (v_draft.draft_order ->> ((v_draft.current_overall - 1 + i) % n))::uuid;

    select coalesce(sum(price), 0) into v_spent
    from public.fantasy_draft_picks
    where draft_id = p_draft and team_id = v_team;

    select v_draft.rounds - count(*) into v_open_slots
    from public.fantasy_draft_picks
    where draft_id = p_draft and team_id = v_team;

    v_remaining := v_draft.budget - v_spent;

    if v_open_slots > 0 and v_remaining >= v_draft.min_bid then
      return v_team;
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.fantasy_auction_team_to_nominate(uuid) from anon, authenticated, public;

-- ── fantasy_auction_team_state — internal, spent/remaining/slots/max_bid ─────
create or replace function public.fantasy_auction_team_state(p_draft uuid, p_team uuid)
returns table (spent int, remaining int, open_slots int, max_bid int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(price) from public.fantasy_draft_picks where draft_id = p_draft and team_id = p_team), 0)::int as spent,
    d.budget - coalesce((select sum(price) from public.fantasy_draft_picks where draft_id = p_draft and team_id = p_team), 0) as remaining,
    d.rounds - coalesce((select count(*) from public.fantasy_draft_picks where draft_id = p_draft and team_id = p_team), 0) as open_slots,
    (d.budget - coalesce((select sum(price) from public.fantasy_draft_picks where draft_id = p_draft and team_id = p_team), 0))
      - (greatest(d.rounds - coalesce((select count(*) from public.fantasy_draft_picks where draft_id = p_draft and team_id = p_team), 0) - 1, 0) * d.min_bid) as max_bid
  from public.fantasy_drafts d
  where d.id = p_draft;
$$;

revoke execute on function public.fantasy_auction_team_state(uuid, uuid) from anon, authenticated, public;

comment on function public.fantasy_auction_team_state is 'spent = sum(price) of this team''s picks; remaining = budget - spent; open_slots = rounds - picks made; max_bid = remaining reserved down to min_bid for every OTHER open slot. A bid is valid iff open_slots >= 1, amount > current high_bid, amount <= max_bid, and the bidder is not already the high bidder.';

-- ── fantasy_schedule_auction_draft — commissioner-only RPC ───────────────────
create or replace function public.fantasy_schedule_auction_draft(
  p_contest uuid,
  p_at timestamptz,
  p_rounds int default 12,
  p_budget int default 200,
  p_nomination_seconds int default 30,
  p_bid_seconds int default 15,
  p_min_bid int default 1
)
returns public.fantasy_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller   uuid := (select auth.uid());
  v_league   uuid;
  v_status   text;
  v_order    jsonb;
  v_draft    public.fantasy_drafts;
  v_earliest timestamptz;
  v_lock     timestamptz;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select league_id, status into v_league, v_status
  from public.fantasy_contests
  where id = p_contest
  for update;

  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  if v_league is null then
    raise exception 'the Public League never drafts';
  end if;

  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if v_status <> 'open' then
    raise exception 'contest is not open for drafting (status: %)', v_status;
  end if;

  if p_rounds < 1 or p_rounds > 40 then
    raise exception 'rounds must be between 1 and 40';
  end if;
  if p_budget < 1 or p_budget > 10000 then
    raise exception 'budget must be between 1 and 10000';
  end if;
  if p_nomination_seconds < 10 or p_nomination_seconds > 300 then
    raise exception 'nomination_seconds must be between 10 and 300';
  end if;
  if p_bid_seconds < 5 or p_bid_seconds > 120 then
    raise exception 'bid_seconds must be between 5 and 120';
  end if;
  if p_min_bid < 1 then
    raise exception 'min_bid must be at least 1';
  end if;
  if p_budget < p_rounds * p_min_bid then
    raise exception 'budget must be enough to afford min_bid for every roster slot (% rounds x % min_bid)', p_rounds, p_min_bid;
  end if;

  v_earliest := public.fantasy_draft_earliest_at(p_contest);
  select lock_at into v_lock
  from public.fantasy_contest_periods
  where contest_id = p_contest and period = 'event';

  if v_lock is not null and now() >= v_lock then
    raise exception 'the tournament has started — drafting is closed';
  end if;
  if p_at is not null and v_earliest is not null and p_at < v_earliest then
    raise exception 'drafts open %, once teams and rosters are in',
      to_char(v_earliest at time zone 'America/New_York', 'Dy Mon FMDD');
  end if;
  if p_at is not null and v_lock is not null and p_at >= v_lock then
    raise exception 'the draft must start before the tournament begins — pick an earlier time';
  end if;

  select coalesce(jsonb_agg(id order by random()), '[]'::jsonb) into v_order
  from public.fantasy_teams
  where contest_id = p_contest;

  if jsonb_array_length(v_order) < 4 then
    raise exception 'a draft needs at least 4 teams';
  end if;

  insert into public.fantasy_drafts (
    contest_id, status, draft_type, rounds, pick_seconds, draft_order, scheduled_at, original_scheduled_at, created_by,
    budget, nomination_seconds, bid_seconds, min_bid
  )
  values (
    p_contest, 'scheduled', 'auction', p_rounds, 60, v_order, p_at, p_at, v_caller,
    p_budget, p_nomination_seconds, p_bid_seconds, p_min_bid
  )
  returning * into v_draft;

  update public.fantasy_contests
  set settings = settings || jsonb_build_object('draft', true)
  where id = p_contest;

  return v_draft;
end;
$$;

revoke all on function public.fantasy_schedule_auction_draft(uuid, timestamptz, int, int, int, int, int) from public, anon;
grant execute on function public.fantasy_schedule_auction_draft(uuid, timestamptz, int, int, int, int, int) to authenticated;

-- ── fantasy_set_draft_prices — commissioner-only RPC ──────────────────────────
create or replace function public.fantasy_set_draft_prices(p_draft uuid, p_prices jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft   public.fantasy_drafts;
  v_league  uuid;
  v_entry   jsonb;
  v_league_ok boolean;
  v_count   int := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  select league_id into v_league from public.fantasy_contests where id = v_draft.contest_id;
  if not public.fantasy_is_commissioner(v_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if v_draft.status <> 'scheduled' then
    raise exception 'draft is not scheduled (status: %)', v_draft.status;
  end if;

  if jsonb_typeof(p_prices) <> 'array' then
    raise exception 'p_prices must be a JSON array';
  end if;
  if jsonb_array_length(p_prices) > 2000 then
    raise exception 'at most 2000 prices per call';
  end if;

  delete from public.fantasy_draft_prices where draft_id = p_draft;

  for v_entry in select * from jsonb_array_elements(p_prices)
  loop
    select public.fantasy_draft_player_league_valid(
      (select competition from public.fantasy_contests where id = v_draft.contest_id),
      v_entry ->> 'playerLeague'
    ) into v_league_ok;

    if not v_league_ok then
      raise exception 'invalid player_league % for this contest', v_entry ->> 'playerLeague';
    end if;

    if (v_entry ->> 'price')::int < v_draft.min_bid or (v_entry ->> 'price')::int > v_draft.budget then
      raise exception 'price for % must be between % and %', v_entry ->> 'playerId', v_draft.min_bid, v_draft.budget;
    end if;

    insert into public.fantasy_draft_prices (draft_id, player_league, player_id, price)
    values (p_draft, v_entry ->> 'playerLeague', v_entry ->> 'playerId', (v_entry ->> 'price')::int);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.fantasy_set_draft_prices(uuid, jsonb) from public, anon;
grant execute on function public.fantasy_set_draft_prices(uuid, jsonb) to authenticated;

-- ── fantasy_nominate — put a player up for auction ────────────────────────────
create or replace function public.fantasy_nominate(
  p_draft uuid,
  p_player_league text,
  p_player_id text,
  p_player_name text,
  p_opening int default null
)
returns public.fantasy_draft_nominations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller     uuid := (select auth.uid());
  v_draft      public.fantasy_drafts;
  v_contest    public.fantasy_contests;
  v_nominator  uuid;
  v_team_id    uuid;
  v_state      record;
  v_price      int;
  v_opening    int;
  v_nom        public.fantasy_draft_nominations;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  if v_draft.status <> 'live' or v_draft.draft_type <> 'auction' then
    raise exception 'draft is not a live auction';
  end if;

  if exists (select 1 from public.fantasy_draft_nominations where draft_id = p_draft and status = 'open') then
    raise exception 'a nomination is already open';
  end if;

  select * into v_contest from public.fantasy_contests where id = v_draft.contest_id;

  if not public.fantasy_draft_player_league_valid(v_contest.competition, p_player_league) then
    raise exception 'player_league % is not valid for %', p_player_league, v_contest.competition;
  end if;

  v_nominator := public.fantasy_auction_team_to_nominate(p_draft);
  if v_nominator is null then
    raise exception 'no team is eligible to nominate — the auction may be complete';
  end if;

  select id into v_team_id from public.fantasy_teams where id = v_nominator and owner_id = v_caller;
  if v_team_id is null then
    raise exception 'not your team''s turn to nominate';
  end if;

  if exists (
    select 1 from public.fantasy_draft_picks
    where draft_id = p_draft and player_league = p_player_league and player_id = p_player_id
  ) or exists (
    select 1 from public.fantasy_draft_nominations
    where draft_id = p_draft and player_league = p_player_league and player_id = p_player_id
  ) then
    raise exception 'player already drafted or nominated';
  end if;

  select price into v_price
  from public.fantasy_draft_prices
  where draft_id = p_draft and player_league = p_player_league and player_id = p_player_id;

  select * into v_state from public.fantasy_auction_team_state(p_draft, v_team_id);

  v_opening := greatest(coalesce(p_opening, 0), coalesce(v_price, 0), v_draft.min_bid);
  if v_opening > v_state.max_bid then
    raise exception 'opening bid % exceeds your max bid of %', v_opening, v_state.max_bid;
  end if;

  insert into public.fantasy_draft_nominations (
    draft_id, overall, team_id, player_league, player_id, player_name,
    ends_at, high_bid, high_team_id
  )
  values (
    p_draft, v_draft.current_overall, v_team_id, p_player_league, p_player_id, p_player_name,
    now() + make_interval(secs => v_draft.bid_seconds), v_opening, v_team_id
  )
  returning * into v_nom;

  insert into public.fantasy_draft_bids (nomination_id, team_id, amount)
  values (v_nom.id, v_team_id, v_opening);

  update public.fantasy_drafts set current_started_at = now() where id = p_draft;

  return v_nom;
end;
$$;

revoke all on function public.fantasy_nominate(uuid, text, text, text, int) from public, anon;
grant execute on function public.fantasy_nominate(uuid, text, text, text, int) to authenticated;

-- ── fantasy_bid — place a bid on the open nomination ──────────────────────────
create or replace function public.fantasy_bid(p_draft uuid, p_amount int)
returns public.fantasy_draft_nominations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_draft  public.fantasy_drafts;
  v_nom    public.fantasy_draft_nominations;
  v_team   uuid;
  v_state  record;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then
    raise exception 'unknown draft %', p_draft;
  end if;

  if v_draft.status <> 'live' or v_draft.draft_type <> 'auction' then
    raise exception 'draft is not a live auction';
  end if;

  select * into v_nom from public.fantasy_draft_nominations
  where draft_id = p_draft and status = 'open'
  for update;

  if not found then
    raise exception 'no open nomination to bid on';
  end if;

  if now() >= v_nom.ends_at then
    raise exception 'bidding has closed for this nomination';
  end if;

  select id into v_team from public.fantasy_teams
  where contest_id = v_draft.contest_id and owner_id = v_caller;
  if v_team is null then
    raise exception 'you do not have a team in this contest';
  end if;

  if v_team = v_nom.high_team_id then
    raise exception 'you are already the high bidder';
  end if;

  select * into v_state from public.fantasy_auction_team_state(p_draft, v_team);

  if v_state.open_slots < 1 then
    raise exception 'your roster is full';
  end if;
  if p_amount < v_nom.high_bid + 1 then
    raise exception 'bid must be at least %', v_nom.high_bid + 1;
  end if;
  if p_amount > v_state.max_bid then
    raise exception 'bid exceeds your max bid of %', v_state.max_bid;
  end if;

  update public.fantasy_draft_nominations
  set high_bid = p_amount, high_team_id = v_team, ends_at = now() + make_interval(secs => v_draft.bid_seconds)
  where id = v_nom.id
  returning * into v_nom;

  insert into public.fantasy_draft_bids (nomination_id, team_id, amount)
  values (v_nom.id, v_team, p_amount);

  return v_nom;
end;
$$;

revoke all on function public.fantasy_bid(uuid, int) from public, anon;
grant execute on function public.fantasy_bid(uuid, int) to authenticated;

-- ── fantasy_auction_advance — internal, one resolution/nomination step ───────
create or replace function public.fantasy_auction_advance(p_draft uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft       public.fantasy_drafts;
  v_contest     public.fantasy_contests;
  v_nom         public.fantasy_draft_nominations;
  v_round       int;
  v_team_count  int;
  v_applied     int := 0;
  v_next_team   uuid;
  v_state       record;
  v_best_league text;
  v_best_id     text;
  v_best_name   text;
  v_price       int;
  v_opening     int;
  v_all_done    boolean;
begin
  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found or v_draft.status <> 'live' or v_draft.draft_type <> 'auction' then
    return 0;
  end if;

  select * into v_contest from public.fantasy_contests where id = v_draft.contest_id;
  v_team_count := jsonb_array_length(v_draft.draft_order);

  loop
    -- (1) An open nomination whose bidding clock has expired (+3s grace) → win it.
    select * into v_nom from public.fantasy_draft_nominations
    where draft_id = p_draft and status = 'open'
    for update;

    if found and now() >= v_nom.ends_at + interval '3 seconds' then
      v_round := (
        select count(*) + 1 from public.fantasy_draft_picks
        where draft_id = p_draft and team_id = v_nom.high_team_id
      );

      insert into public.fantasy_draft_picks (draft_id, overall, round, team_id, player_league, player_id, player_name, auto, price)
      values (p_draft, v_nom.overall, v_round, v_nom.high_team_id, v_nom.player_league, v_nom.player_id, v_nom.player_name, v_nom.auto, v_nom.high_bid);

      update public.fantasy_draft_nominations
      set status = 'won', closed_at = now()
      where id = v_nom.id;

      update public.fantasy_drafts
      set current_overall = current_overall + 1, current_started_at = now()
      where id = p_draft
      returning * into v_draft;

      v_applied := v_applied + 1;

      -- Completion check after a win.
      v_next_team := public.fantasy_auction_team_to_nominate(p_draft);
      v_all_done := v_next_team is null;
      if v_all_done then
        update public.fantasy_drafts set status = 'complete' where id = p_draft;
        perform public.fantasy_draft_on_complete(p_draft, v_contest);
        return v_applied;
      end if;

      continue;
    end if;

    -- (2) No open nomination and the nomination clock has expired (+3s grace)
    -- → auto-nominate for the team on the clock (queue first, else best-
    -- available), at a floor/ceiling-clamped opening bid.
    if not found and v_draft.current_started_at is not null
       and now() >= v_draft.current_started_at + make_interval(secs => v_draft.nomination_seconds) + interval '3 seconds'
    then
      v_next_team := public.fantasy_auction_team_to_nominate(p_draft);

      if v_next_team is null then
        update public.fantasy_drafts set status = 'complete' where id = p_draft;
        perform public.fantasy_draft_on_complete(p_draft, v_contest);
        return v_applied;
      end if;

      select * into v_state from public.fantasy_auction_team_state(p_draft, v_next_team);

      v_best_league := null;
      v_best_id := null;
      v_best_name := null;
      -- Queue first: first queued entry not yet drafted/nominated.
      declare
        v_queue jsonb;
        v_entry jsonb;
      begin
        select entries into v_queue
        from public.fantasy_draft_queues
        where draft_id = p_draft and team_id = v_next_team;

        if v_queue is not null then
          for v_entry in select * from jsonb_array_elements(v_queue)
          loop
            if not exists (
              select 1 from public.fantasy_draft_picks
              where draft_id = p_draft and player_league = (v_entry ->> 'playerLeague') and player_id = (v_entry ->> 'playerId')
            ) and not exists (
              select 1 from public.fantasy_draft_nominations
              where draft_id = p_draft and player_league = (v_entry ->> 'playerLeague') and player_id = (v_entry ->> 'playerId')
            ) then
              v_best_league := v_entry ->> 'playerLeague';
              v_best_id := v_entry ->> 'playerId';
              v_best_name := coalesce(v_entry ->> 'playerName', v_entry ->> 'playerId');
              exit;
            end if;
          end loop;
        end if;
      end;

      if v_best_id is null then
        select bp.player_league, bp.player_id, bp.player_name
        into v_best_league, v_best_id, v_best_name
        from public.fantasy_draft_best_available(p_draft, v_contest) bp
        where not exists (
          select 1 from public.fantasy_draft_nominations n
          where n.draft_id = p_draft and n.player_league = bp.player_league and n.player_id = bp.player_id
        );
      end if;

      if v_best_id is null then
        -- Pool exhausted for this team's turn — advance the nomination
        -- counter with no nomination rather than looping forever.
        update public.fantasy_drafts
        set current_overall = current_overall + 1, current_started_at = now()
        where id = p_draft
        returning * into v_draft;
        v_applied := v_applied + 1;
        continue;
      end if;

      select price into v_price
      from public.fantasy_draft_prices
      where draft_id = p_draft and player_league = v_best_league and player_id = v_best_id;

      v_opening := least(greatest(coalesce(v_price, v_draft.min_bid), v_draft.min_bid), v_state.max_bid);

      insert into public.fantasy_draft_nominations (
        draft_id, overall, team_id, player_league, player_id, player_name,
        ends_at, high_bid, high_team_id, auto
      )
      values (
        p_draft, v_draft.current_overall, v_next_team, v_best_league, v_best_id, v_best_name,
        now() + make_interval(secs => v_draft.bid_seconds), v_opening, v_next_team, true
      );

      insert into public.fantasy_draft_bids (nomination_id, team_id, amount)
      select id, v_next_team, v_opening from public.fantasy_draft_nominations
      where draft_id = p_draft and player_league = v_best_league and player_id = v_best_id and status = 'open';

      update public.fantasy_drafts set current_started_at = now() where id = p_draft;

      v_applied := v_applied + 1;
      continue;
    end if;

    exit;
  end loop;

  return v_applied;
end;
$$;

revoke execute on function public.fantasy_auction_advance(uuid) from anon, authenticated, public;

-- ── fantasy_resolve_auction — public wrapper, any league member ──────────────
create or replace function public.fantasy_resolve_auction(p_draft uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest uuid;
  v_league  uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select contest_id into v_contest from public.fantasy_drafts where id = p_draft;
  if v_contest is null then
    raise exception 'unknown draft %', p_draft;
  end if;

  select league_id into v_league from public.fantasy_contests where id = v_contest;

  if v_league is not null and not exists (
    select 1 from public.fantasy_league_members
    where league_id = v_league and user_id = (select auth.uid())
  ) then
    raise exception 'not authorized — league members only';
  end if;

  return public.fantasy_auction_advance(p_draft);
end;
$$;

revoke all on function public.fantasy_resolve_auction(uuid) from public, anon;
grant execute on function public.fantasy_resolve_auction(uuid) to authenticated;

-- ── Public reads for the current nomination/bids ──────────────────────────────
create or replace function public.fantasy_get_open_nomination(p_draft uuid)
returns public.fantasy_draft_nominations
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.fantasy_draft_nominations where draft_id = p_draft and status = 'open' limit 1;
$$;

revoke all on function public.fantasy_get_open_nomination(uuid) from public, anon;
grant execute on function public.fantasy_get_open_nomination(uuid) to authenticated;

create or replace function public.fantasy_get_nomination_bids(p_nomination uuid)
returns setof public.fantasy_draft_bids
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.fantasy_draft_bids where nomination_id = p_nomination order by created_at;
$$;

revoke all on function public.fantasy_get_nomination_bids(uuid) from public, anon;
grant execute on function public.fantasy_get_nomination_bids(uuid) to authenticated;

-- ── Event-roster seeding for auction drafts: order by price desc ─────────────
-- One-line change from the snake version: priority order = draft order for
-- snake, price desc for auction (auction has no "pick order" — it has price).
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_draft_seed_event_rosters(uuid, text, int)'::regprocedure)
     <> '84d3017a0d20ff9bb1ffc6f188ccded2' then
    raise exception 'fantasy_draft_seed_event_rosters body has diverged from expected — aborting migration';
  end if;
end $$;

create or replace function public.fantasy_draft_seed_event_rosters(p_draft uuid, p_contest_mode text, p_flex int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft_type text;
  v_seed       record;
begin
  if p_contest_mode <> 'event' then
    return;
  end if;

  select draft_type into v_draft_type from public.fantasy_drafts where id = p_draft;

  for v_seed in
    select team_id, player_league, player_id,
           row_number() over (
             partition by team_id
             order by case when v_draft_type = 'auction' then -coalesce(price, 0) else overall end
           ) as rn
    from public.fantasy_draft_picks
    where draft_id = p_draft
  loop
    if v_seed.rn <= p_flex then
      insert into public.fantasy_roster_slots (team_id, week, player_id, player_league, role)
      values (v_seed.team_id, 'event', v_seed.player_id, v_seed.player_league, 'flex')
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- Internal only (20260827010300 already revoked this from anon/authenticated/
-- public — every caller is SECURITY DEFINER, so no client grant is needed).
revoke execute on function public.fantasy_draft_seed_event_rosters(uuid, text, int) from anon, authenticated, public;

notify pgrst, 'reload schema';
