-- Season-add pipeline hook (scripts/add-new-seasons.ts, run by the
-- twelve-oh-new-season GitHub Action after each league's championship).
-- After new UFA rows land in twelve_oh_players: refresh the UTCG card pool
-- (packs/drafts/boss read it) and run the week-content refresh so the new
-- season's Champion/Finalist boosts are minted. CONCURRENTLY: readers aren't
-- blocked (utcg_card_pool_pk is the required unique index). Service role only.
create or replace function public.refresh_utcg_card_pool()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently public.utcg_card_pool;
  perform public.utcg_refresh_week_content();
end $function$;
revoke execute on function public.refresh_utcg_card_pool() from public, anon, authenticated;
grant execute on function public.refresh_utcg_card_pool() to service_role;
notify pgrst, 'reload schema';
