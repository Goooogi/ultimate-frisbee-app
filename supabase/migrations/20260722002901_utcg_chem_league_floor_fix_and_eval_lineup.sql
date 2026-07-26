-- Exact copy of remote migration 20260722002901 (applied via MCP 2026-07-21).
-- utcg_eval_lineup: single SQL source of truth for squad evaluation, extracted
-- from utcg_record_match. Contains the league-floor FIX (+1 cap; was +3 at
-- count>=7 which gave every full squad 21/21 chem).
-- TS mirror: src/lib/utcg/chemistry.ts LEAGUE_THRESHOLDS = [5, 99, 99].

create or replace function public.utcg_eval_lineup(p_formation text, p_players jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  slot_types text[]; n int; i int; elem jsonb; in_position boolean;
  card record;
  scores numeric[] := array[]::numeric[];
  slugs text[] := array[]::text[];
  divs text[] := array[]::text[];
  positions text[] := array[]::text[];
  slots text[] := array[]::text[];
  team_counts jsonb := '{}'::jsonb;
  div_counts jsonb := '{}'::jsonb;
  league_count int := 0;
  chem_total int := 0; team_chem int; div_chem int; league_chem int; card_chem int; cnt int;
  mean_score numeric; chem_bonus numeric; min_boosted numeric; strength numeric;
begin
  slot_types := case p_formation
    when 'vert'     then array['handler','handler','cutter','cutter','cutter','cutter','cutter']
    when 'ho'       then array['handler','handler','handler','cutter','cutter','cutter','cutter']
    when 'hex'      then array['handler','handler','handler','handler','cutter','cutter','cutter']
    when 'threeTwo' then array['handler','handler','cutter','cutter','cutter','cutter','cutter']
    else null end;
  if slot_types is null then raise exception 'unknown formation %', p_formation; end if;

  n := jsonb_array_length(p_players);
  if n <> 7 then raise exception 'lineup must have exactly 7 cards'; end if;

  for i in 0..6 loop
    elem := p_players -> i;
    select p.player_score::numeric as score, p.team_slug,
           public.utcg_derive_position(p.goals, p.assists, p.yards_thrown, p.yards_received) as pos
      into card
      from public.twelve_oh_players p
      where p.league = 'ufa'
        and p.player_id = (elem->>'player_id')
        and p.team_slug = (elem->>'team_slug')
        and p.year = (elem->>'year')::int;
    if card is null then raise exception 'unknown card: %', elem; end if;

    scores := scores || card.score;
    slugs := slugs || card.team_slug;
    divs := divs || coalesce(public.utcg_ufa_division(card.team_slug), '');
    positions := positions || card.pos;
    slots := slots || slot_types[i+1];

    team_counts := jsonb_set(team_counts, array[card.team_slug],
                    to_jsonb(coalesce((team_counts->>card.team_slug)::int,0)+1));
    if public.utcg_ufa_division(card.team_slug) is not null then
      div_counts := jsonb_set(div_counts, array[public.utcg_ufa_division(card.team_slug)],
                    to_jsonb(coalesce((div_counts->>public.utcg_ufa_division(card.team_slug))::int,0)+1));
    end if;
    league_count := league_count + 1;
  end loop;

  for i in 1..7 loop
    in_position := (positions[i] = 'hybrid') or (positions[i] = slots[i]);
    if not in_position then continue; end if;

    cnt := (team_counts->>slugs[i])::int;
    team_chem := case when cnt >= 4 then 3 when cnt >= 3 then 2 when cnt >= 2 then 1 else 0 end;

    if divs[i] <> '' then
      cnt := (div_counts->>divs[i])::int;
      div_chem := case when cnt >= 7 then 3 when cnt >= 5 then 2 when cnt >= 3 then 1 else 0 end;
    else
      div_chem := 0;
    end if;

    -- FIX: league is a floor capped at +1 (was: >=7 -> 3)
    league_chem := case when league_count >= 5 then 1 else 0 end;

    card_chem := least(3, greatest(team_chem, div_chem, league_chem));
    chem_total := chem_total + card_chem;
  end loop;

  select avg(s) into mean_score from unnest(scores) s;
  chem_bonus := (chem_total::numeric / 21.0) * 3.0;
  select min(s + chem_bonus) into min_boosted from unnest(scores) s;
  strength := mean_score + chem_bonus
    + case when min_boosted > 85 then 0.5 when min_boosted > 78 then 0.3 else 0 end;

  return jsonb_build_object(
    'chem', chem_total,
    'mean_score', round(mean_score, 2),
    'strength', round(strength, 4)
  );
end $function$;

revoke execute on function public.utcg_eval_lineup(text, jsonb) from public, anon;

-- NOTE: utcg_record_match was refactored onto utcg_eval_lineup in this
-- migration; its CURRENT authoritative definition (incl. the daily reward cap)
-- lives in 20260722003729_utcg_hardening_match_cap_and_card_pool.sql.
