-- Real bug (pre-existing in utcg_open_pack, carried into utcg_roll_pack): the
-- roller picks a PLAYER who has a season at the rolled tier, then took a
-- RANDOM season of that player — often a different tier. Pack odds and
-- guarantees (e.g. Platinum's rank-5 floor, the pity rank-6 upgrade) weren't
-- honored. Now the season is chosen at the rolled tier (nearest tier only in
-- the fallback path where no player has that tier).

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

select pg_temp.utcg_patch('public.utcg_roll_pack(uuid,text,boolean)',
$o$      where p.league = 'ufa' and p.player_id = picked_player
      order by random() limit 1;$o$,
$n$      where p.league = 'ufa' and p.player_id = picked_player
      order by abs(public.utcg_tier_rank(p.player_score::numeric) - rolled_rank), random()
      limit 1;$n$);
