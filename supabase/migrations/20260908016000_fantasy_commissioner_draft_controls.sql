-- ─────────────────────────────────────────────────────────────────────────────
-- Commissioner draft controls (Hunter, 2026-09-08 — depth backlog 5).
--   pause / resume  — freezes every clock (snake pick clock, auction nomination
--                     and bid clocks). While paused: picks, nominations, bids
--                     and lazy clock resolution are refused / no-op. Resume
--                     restarts the clocks from now.
--   undo last pick  — snake: deletes the latest pick, steps current_overall
--                     back, restarts the clock. Auction: reverts the latest
--                     WON nomination (pick + nomination row deleted, money
--                     refunded because price lives on the pick).
--   skip            — force the on-clock team's autopick now (snake) / force
--                     the current nomination to close or the nominator to be
--                     auto-nominated (auction), by expiring the clock and
--                     running the normal lazy resolver.
-- fantasy_drafts.paused_at is the pause flag (null = running).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_drafts add column if not exists paused_at timestamptz;

-- ── Helper: commissioner of the draft's league ───────────────────────────────
create or replace function public.fantasy_draft_commissioner_check(p_draft uuid)
returns public.fantasy_drafts
language plpgsql security definer set search_path = ''
as $$
declare v_draft public.fantasy_drafts; v_league uuid;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  select * into v_draft from public.fantasy_drafts where id = p_draft for update;
  if not found then raise exception 'unknown draft %', p_draft; end if;
  select league_id into v_league from public.fantasy_contests where id = v_draft.contest_id;
  if not public.fantasy_is_commissioner(v_league) then raise exception 'not authorized — commissioner only'; end if;
  return v_draft;
end;
$$;
revoke execute on function public.fantasy_draft_commissioner_check(uuid) from anon, authenticated, public;

create or replace function public.fantasy_pause_draft(p_draft uuid)
returns public.fantasy_drafts language plpgsql security definer set search_path = ''
as $$
declare v_draft public.fantasy_drafts;
begin
  v_draft := public.fantasy_draft_commissioner_check(p_draft);
  if v_draft.status <> 'live' then raise exception 'only a live draft can be paused'; end if;
  if v_draft.paused_at is not null then return v_draft; end if;
  update public.fantasy_drafts set paused_at = now() where id = p_draft returning * into v_draft;
  return v_draft;
end;
$$;
revoke all on function public.fantasy_pause_draft(uuid) from public, anon;
grant execute on function public.fantasy_pause_draft(uuid) to authenticated;

create or replace function public.fantasy_resume_draft(p_draft uuid)
returns public.fantasy_drafts language plpgsql security definer set search_path = ''
as $$
declare v_draft public.fantasy_drafts;
begin
  v_draft := public.fantasy_draft_commissioner_check(p_draft);
  if v_draft.paused_at is null then return v_draft; end if;
  -- Restart every clock from now: the pick/nomination clock and any open bid.
  update public.fantasy_drafts set paused_at = null, current_started_at = now() where id = p_draft returning * into v_draft;
  update public.fantasy_draft_nominations set ends_at = now() + make_interval(secs => v_draft.bid_seconds)
  where draft_id = p_draft and status = 'open';
  return v_draft;
end;
$$;
revoke all on function public.fantasy_resume_draft(uuid) from public, anon;
grant execute on function public.fantasy_resume_draft(uuid) to authenticated;

create or replace function public.fantasy_undo_last_pick(p_draft uuid)
returns public.fantasy_drafts language plpgsql security definer set search_path = ''
as $$
declare v_draft public.fantasy_drafts; v_pick public.fantasy_draft_picks; v_nom public.fantasy_draft_nominations;
begin
  v_draft := public.fantasy_draft_commissioner_check(p_draft);
  if v_draft.status <> 'live' then raise exception 'only a live draft can be undone'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id = p_draft order by overall desc limit 1;
  if not found then raise exception 'nothing to undo'; end if;

  if v_draft.draft_type = 'auction' then
    -- An open nomination in progress must be dropped first (its bids are void).
    delete from public.fantasy_draft_nominations where draft_id = p_draft and status = 'open';
    delete from public.fantasy_draft_picks where id = v_pick.id;
    delete from public.fantasy_draft_nominations where draft_id = p_draft and overall = v_pick.overall;
    update public.fantasy_drafts set current_overall = v_pick.overall, current_started_at = now() where id = p_draft returning * into v_draft;
  else
    delete from public.fantasy_draft_picks where id = v_pick.id;
    update public.fantasy_drafts set current_overall = v_pick.overall, current_started_at = now() where id = p_draft returning * into v_draft;
  end if;
  return v_draft;
end;
$$;
revoke all on function public.fantasy_undo_last_pick(uuid) from public, anon;
grant execute on function public.fantasy_undo_last_pick(uuid) to authenticated;

-- Skip = expire the running clock so the normal resolver autopicks / closes.
create or replace function public.fantasy_skip_clock(p_draft uuid)
returns int language plpgsql security definer set search_path = ''
as $$
declare v_draft public.fantasy_drafts;
begin
  v_draft := public.fantasy_draft_commissioner_check(p_draft);
  if v_draft.status <> 'live' then raise exception 'only a live draft can be skipped'; end if;
  if v_draft.paused_at is not null then raise exception 'resume the draft first'; end if;
  if v_draft.draft_type = 'auction' then
    update public.fantasy_draft_nominations set ends_at = now() - interval '4 seconds' where draft_id = p_draft and status = 'open';
    update public.fantasy_drafts set current_started_at = now() - make_interval(secs => v_draft.nomination_seconds + 4) where id = p_draft;
    return public.fantasy_auction_advance(p_draft);
  else
    update public.fantasy_drafts set current_started_at = now() - make_interval(secs => v_draft.pick_seconds + 4) where id = p_draft;
    return public.fantasy_resolve_clock(p_draft);
  end if;
end;
$$;
revoke all on function public.fantasy_skip_clock(uuid) from public, anon;
grant execute on function public.fantasy_skip_clock(uuid) to authenticated;

-- ── Pause gates on the existing RPCs (bodies are ours; add one guard each) ──
-- Rather than re-emitting four large bodies, wrap: a BEFORE INSERT trigger on
-- fantasy_draft_picks / fantasy_draft_nominations / fantasy_draft_bids refuses
-- writes while the draft is paused — every pick/nomination/bid path inserts
-- into one of them (the lazy resolvers included), so the pause holds
-- everywhere. Commissioner undo deletes rows (not gated).
create or replace function public.fantasy_draft_refuse_when_paused()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_draft uuid; v_paused timestamptz;
begin
  if tg_table_name = 'fantasy_draft_bids' then
    select draft_id into v_draft from public.fantasy_draft_nominations where id = new.nomination_id;
  else
    v_draft := new.draft_id;
  end if;
  select paused_at into v_paused from public.fantasy_drafts where id = v_draft;
  if v_paused is not null then
    raise exception 'the draft is paused by the commissioner';
  end if;
  return new;
end;
$$;
revoke execute on function public.fantasy_draft_refuse_when_paused() from anon, authenticated, public;
create trigger fantasy_draft_picks_paused before insert on public.fantasy_draft_picks for each row execute function public.fantasy_draft_refuse_when_paused();
create trigger fantasy_draft_nominations_paused before insert on public.fantasy_draft_nominations for each row execute function public.fantasy_draft_refuse_when_paused();
create trigger fantasy_draft_bids_paused before insert on public.fantasy_draft_bids for each row execute function public.fantasy_draft_refuse_when_paused();

notify pgrst, 'reload schema';
