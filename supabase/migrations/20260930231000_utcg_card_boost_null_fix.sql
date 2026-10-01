-- Real bug in 20260930210000: utcg_card_boost returned least(6, sum(boost)),
-- and LEAST ignores NULLs — a card with NO active boost got +6 instead of 0,
-- inflating every unboosted card in every mode. Coalesce before capping, then
-- rebuild the week's cached boss (its strength was computed with the bug).
create or replace function public.utcg_card_boost(p_player_id text, p_team_slug text, p_year int)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select least(6, coalesce(sum(b.boost), 0)) from public.utcg_card_boosts b
  where b.player_id = p_player_id and b.team_slug = p_team_slug and b.year = p_year
    and current_date >= b.starts_on and (b.ends_on is null or current_date < b.ends_on);
$function$;
revoke execute on function public.utcg_card_boost(text, text, int) from public, anon;

delete from public.utcg_boss_weeks;
select public.utcg_boss_current();
