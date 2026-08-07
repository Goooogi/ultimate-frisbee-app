-- Cross-league appearances for a EUCS club-division.
--
-- Clubs are keyed by (name, division), so cross-league matching requires the
-- DIVISION to agree too — a club's Women's page must not pick up its Open
-- squad's overseas results.
--
-- Division vocabularies differ per league and are normalized to the EUF one:
--   USAU  gender_division: Men → Open, Women → Women's, Mixed → Mixed
--   WFDF  division name:   "Master Open" / "Grand Master Open" → Open, etc.
--         (the Master/Grand Master prefix is stripped — a club's masters squad
--          is still that club's Open/Women's/Mixed line for matching purposes)
--
-- Measured over the 18 name-colliding WFDF rows, the base division agrees on 16;
-- the 2 that don't are correct rejections: `remix` (Canada vs Netherlands, also
-- caught by country) and `UFO` (WFDF Master Mixed vs EUCS Open — different squad).
--
-- WFDF: exact name AND same country AND same base division. Country is
-- load-bearing, not decoration — WFDF "remix" is CANADA while EUCS "Remix" is
-- the Netherlands, so name alone would merge two unrelated clubs.
--
-- USAU: European clubs appear in usau_teams only via the U.S. Open / ICC, and
-- their `state` is VENUE leakage (Mooncatchers tagged CO for Aurora; Fire of
-- London and Iceni tagged MN for Minneapolis), NOT a home state — so state
-- cannot be used to confirm identity. Instead require every event the USAU row
-- played to be a U.S. Open/ICC event. Measured over all 12 name-colliding USAU
-- rows this separates perfectly: the 6 real European clubs (Mooncatchers,
-- Clapham, BFD LaFotta, BFD Shout, Fire of London, Iceni) played ONLY U.S.
-- Opens; the 6 American namesakes (Spice, UFO, Eclipse, Jinx, remix, ECHO)
-- played sectionals/regionals/college and never a U.S. Open.

drop function if exists public.get_euf_club_cross_league(text);

create function public.get_euf_club_cross_league(p_name text, p_division text)
returns table (
  league        text,
  ref_id        text,
  team_name     text,
  country_name  text,
  event_name    text,
  event_slug    text,
  year          int,
  division      text,
  placement     int
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select lower(trim(p_name)) as k,
           lower(trim(p_division)) as d,
           (select max(country_name) from euf_teams
             where lower(trim(name)) = lower(trim(p_name))
               and lower(trim(division::text)) = lower(trim(p_division))) as country
  )
  select 'wfdf'::text            as league,
         w.id::text              as ref_id,
         w.name::text            as team_name,
         w.country_name::text,
         e.name::text            as event_name,
         e.slug::text            as event_slug,
         e.year::int,
         d.name::text            as division,
         w.final_standing::int   as placement
    from wfdf_teams w
    join wfdf_divisions d on d.id = w.division_id
    join target on lower(trim(w.name)) = target.k
                and lower(trim(coalesce(w.country_name,''))) = lower(trim(coalesce(target.country,'')))
                and lower(regexp_replace(d.name, '^(Grand )?Master ', '')) = target.d
    join wfdf_events e on e.id = w.event_id

  union all

  select 'usau'::text,
         u.id::text,
         u.name::text,
         (select country from target),
         ev.name::text,
         ev.usau_slug::text,
         ev.season::int,
         u.gender_division::text,
         null::int
    from usau_teams u
    join target on lower(trim(u.name)) = target.k
                and case lower(trim(u.gender_division::text))
                      when 'men'   then 'open'
                      when 'women' then 'women''s'
                      when 'mixed' then 'mixed'
                      else lower(trim(u.gender_division::text))
                    end = target.d
    join lateral (
      select e2.*
        from usau_games g2
        join usau_events e2 on e2.id = g2.event_id
       where g2.team_a_id = u.id or g2.team_b_id = u.id
    ) ev on true
   where not exists (
     -- reject the row entirely if it EVER played a non-U.S.-Open event:
     -- that's a domestic American club that merely shares the name.
     select 1
       from usau_games g3
       join usau_events e3 on e3.id = g3.event_id
      where (g3.team_a_id = u.id or g3.team_b_id = u.id)
        and e3.name !~* '(u\.s\.|us) open'
        and e3.name !~* 'ICC'
   )
   group by u.id, u.name, ev.name, ev.usau_slug, ev.season, u.gender_division
   order by year desc, league;
$$;

notify pgrst, 'reload schema';
