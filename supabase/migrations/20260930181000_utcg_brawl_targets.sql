-- Brawl targets eased after testing: a correctly slotted single-team 2013
-- top 7 (full 21 chem) scores 82.9, so 84–88 was out of reach for most
-- collections. Targets now 79–82.
-- Mirrored in src/lib/utcg/brawl.ts.
create or replace function public.utcg_brawl_rule(p_week int)
returns table(rule_key text, label text, description text, target numeric)
language sql immutable set search_path to 'public' as $function$
  select r.k, r.l, r.d, r.t from (values
    (0, 'max_85',       'Underdogs',       'Every card 85 OVR or lower',          79.0),
    (1, 'one_team',     'One Club',        'All 7 cards from the same franchise',  82.0),
    (2, 'throwback',    'Throwback',       'Every card from 2019 or earlier',      82.0),
    (3, 'seven_teams',  'All-Stars',       '7 different franchises',               81.0),
    (4, 'one_division', 'Division Rivals', 'All 7 cards from one division',        82.0),
    (5, 'new_school',   'New School',      'Every card from 2023 or later',        82.0)
  ) as r(i, k, l, d, t)
  where r.i = p_week % 6;
$function$;
revoke execute on function public.utcg_brawl_rule(int) from public, anon, authenticated;
