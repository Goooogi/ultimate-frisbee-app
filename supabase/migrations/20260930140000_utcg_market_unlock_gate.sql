-- UTCG Phase 1.1 — graduated unlock for the market + staked PvP (EA FC model).
-- A throwaway account's starter coins can't be funneled until it is ≥7 days
-- old AND has finished ≥10 games (Squad Battles or drafts) on ≥3 distinct UTC
-- days. Packs, Squad Battle, Draft and the collection stay open from day one.
-- Gated: utcg_market_list, utcg_market_make_offer, utcg_market_buy,
-- utcg_pvp_enter. The pass is cached in utcg_wallets.market_unlocked_at.
-- Existing wallets (4, all known accounts) are grandfathered.
-- prosrc patches from the LIVE bodies — same pattern as 20260922200000.

alter table public.utcg_wallets
  add column if not exists finished_games int not null default 0,
  add column if not exists play_day_count int not null default 0,
  add column if not exists last_play_day date,
  add column if not exists market_unlocked_at timestamptz;

update public.utcg_wallets set market_unlocked_at = now() where market_unlocked_at is null;

create or replace function public.utcg_require_market_unlocked(p_uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare w public.utcg_wallets; created timestamptz; age_days int;
begin
  select * into w from public.utcg_wallets where user_id = p_uid;
  if w.market_unlocked_at is not null then return; end if;
  select u.created_at into created from auth.users u where u.id = p_uid;
  age_days := floor(extract(epoch from now() - created) / 86400)::int;
  if age_days >= 7 and coalesce(w.finished_games, 0) >= 10
     and coalesce(w.play_day_count, 0) >= 3 then
    update public.utcg_wallets set market_unlocked_at = now()
      where user_id = p_uid and market_unlocked_at is null;
    return;
  end if;
  raise exception 'Market and PvP unlock after 7 days and 10 games on 3 different days (you: % days, % games, % days played)',
    age_days, coalesce(w.finished_games, 0), coalesce(w.play_day_count, 0);
end $function$;
revoke execute on function public.utcg_require_market_unlocked(uuid) from public, anon, authenticated;

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

-- The gate, right after the auth check in each gated RPC.
do $gate$
declare sig text;
begin
  foreach sig in array array[
    'public.utcg_market_list(text,text,integer,text,integer)',
    'public.utcg_market_make_offer(uuid,jsonb,integer)',
    'public.utcg_market_buy(uuid)',
    'public.utcg_pvp_enter(text,jsonb)'
  ] loop
    perform pg_temp.utcg_patch(sig,
$o$  if uid is null then raise exception 'not authenticated'; end if;
$o$,
$n$  if uid is null then raise exception 'not authenticated'; end if;
  perform public.utcg_require_market_unlocked(uid);
$n$);
  end loop;
end $gate$;

-- Progress counters: a finished Squad Battle or a finished draft run counts.
select pg_temp.utcg_patch('public.utcg_record_match(text,jsonb)',
$o$        matches_today = w.matches_today + 1,
        matches_day = current_date
$o$,
$n$        matches_today = w.matches_today + 1,
        matches_day = current_date,
        finished_games = finished_games + 1,
        play_day_count = play_day_count
          + case when last_play_day is distinct from current_date then 1 else 0 end,
        last_play_day = current_date
$n$);

select pg_temp.utcg_patch('public.utcg_draft_play(uuid)',
$o$      set coins = coins + case when run.practice then 0 else new_bank end
      where user_id = uid returning * into w;$o$,
$n$      set coins = coins + case when run.practice then 0 else new_bank end,
          finished_games = finished_games + 1,
          play_day_count = play_day_count
            + case when last_play_day is distinct from current_date then 1 else 0 end,
          last_play_day = current_date
      where user_id = uid returning * into w;$n$);

select pg_temp.utcg_patch('public.utcg_draft_abandon(uuid)',
$o$    set coins = coins + case when run.practice then 0 else run.bank end
    where user_id = uid returning * into w;$o$,
$n$    set coins = coins + case when run.practice then 0 else run.bank end,
        finished_games = finished_games + case when run.status = 'playing' then 1 else 0 end,
        play_day_count = play_day_count
          + case when run.status = 'playing' and last_play_day is distinct from current_date
                 then 1 else 0 end,
        last_play_day = case when run.status = 'playing' then current_date else last_play_day end
    where user_id = uid returning * into w;$n$);

notify pgrst, 'reload schema';
