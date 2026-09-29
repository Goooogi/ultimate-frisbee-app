-- Shared name-match data: nickname pairs + person-specific full-name overrides.
-- One table read by public.names_match (the profile RPC, web + mobile) and by
-- both apps' TS namesMatch, replacing the NICKNAME_GROUPS / FULL_NAME_ALIASES
-- lists hardcoded in name-match.ts in each repo.
--
-- Why: those lists never reached profiles. _build_player_profile links leagues
-- through names_match, which had neither list, so /players/ccochran showed no
-- USAU career and "Mike Smith" never joined "Michael Smith" on a profile.
--
-- kind = 'given_name': one-token pair ("bob" = "robert"). Any first/middle name
--   pair, surnames must still match. Pairs, not groups: a group made every
--   member equal, which merged samantha=samuel, alexander=alexandra and
--   edwin=edward; those three pairs are deliberately not seeded.
-- kind = 'full_name': one person's two spellings ("chance cochran" = "jackson
--   cochran"). Full-name scoped, so it never merges other Chances/Jacksons.
--   SAME SURNAME ONLY (trigger-enforced): every names_match call site in
--   _build_player_profile prefilters on the anchor's surname first, so a
--   different-surname alias (married/maiden name) would silently never link.
--
-- Middle-name and abbreviation matching (token subset, Ben ⊂ Benjamin) are
-- rules, not data, and stay in code on both sides.
--
-- names_match is patched from the LIVE function body (md5 e032ae98…, mobile has
-- migrated it too), adding only the two lookups, and becomes STABLE since it now
-- reads a table. No index or view depends on it.

set local lock_timeout = '5s';

create table public.player_name_aliases (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('given_name', 'full_name')),
  name_a text not null,
  name_b text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint player_name_aliases_ordered check (name_a < name_b),
  constraint player_name_aliases_pair_key unique (name_a, name_b)
);

comment on table public.player_name_aliases is
  'Same-person name data for cross-league matching (names_match + TS namesMatch). Insert raw names; the trigger normalizes (normalize_player_name) and orders them. given_name = one-token nickname pair; full_name = one person''s two full names, same surname only.';

alter table public.player_name_aliases enable row level security;

create policy player_name_aliases_public_read on public.player_name_aliases
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.player_name_aliases from anon, authenticated;

-- Normalize + order, and reject rows names_match could never use.
create or replace function public._player_name_aliases_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  a text := public.normalize_player_name(new.name_a);
  b text := public.normalize_player_name(new.name_b);
  ta text[];
  tb text[];
begin
  if a is null or b is null then
    raise exception 'player_name_aliases: both names are required';
  end if;
  if a = b then
    raise exception 'player_name_aliases: "%" already matches itself', a;
  end if;
  ta := regexp_split_to_array(a, '\s+');
  tb := regexp_split_to_array(b, '\s+');
  if new.kind = 'given_name' then
    if array_length(ta, 1) <> 1 or array_length(tb, 1) <> 1 then
      raise exception 'player_name_aliases: given_name rows are single names ("%" / "%")', a, b;
    end if;
  else
    if array_length(ta, 1) < 2 or array_length(tb, 1) < 2 then
      raise exception 'player_name_aliases: full_name rows need a first and last name ("%" / "%")', a, b;
    end if;
    if ta[array_length(ta, 1)] <> tb[array_length(tb, 1)] then
      raise exception 'player_name_aliases: surnames differ ("%" / "%"); the profile RPC only links same-surname aliases', a, b;
    end if;
  end if;
  new.name_a := least(a, b);
  new.name_b := greatest(a, b);
  return new;
end;
$$;

create trigger player_name_aliases_normalize
  before insert or update on public.player_name_aliases
  for each row execute function public._player_name_aliases_normalize();

-- full_name rows: mark both people's cached profiles stale so the per-minute
-- trickle relinks them. Uses player_profiles_display_name_idx
-- (lower(displayName)); a display name with accents/punctuation won't equal the
-- normalized alias, so rebuild that anchor by hand. given_name rows touch too
-- many profiles for a per-row scan; the weekly trickle covers them.
create or replace function public._player_name_aliases_stale_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[];
begin
  v_names := array_remove(array[
    case when tg_op <> 'INSERT' and old.kind = 'full_name' then old.name_a end,
    case when tg_op <> 'INSERT' and old.kind = 'full_name' then old.name_b end,
    case when tg_op <> 'DELETE' and new.kind = 'full_name' then new.name_a end,
    case when tg_op <> 'DELETE' and new.kind = 'full_name' then new.name_b end
  ], null);
  if cardinality(v_names) > 0 then
    update public.player_profiles
    set built_at = '-infinity'
    where lower(profile ->> 'displayName') = any (v_names)
      and built_at <> '-infinity';
  end if;
  return null;
end;
$$;

revoke execute on function public._player_name_aliases_stale_profiles() from public;

create trigger player_name_aliases_stale_profiles
  after insert or update or delete on public.player_name_aliases
  for each row execute function public._player_name_aliases_stale_profiles();

-- names_match: live body + full-name override (before the token rule, since
-- those pairs deliberately FAIL it) + nickname pair as a third given-name match.
create or replace function public.names_match(a text, b text)
 returns boolean
 language plpgsql
 stable cost 1000
 set search_path to 'public'
as $function$
declare
  norm_a text := public.normalize_player_name(a);
  norm_b text := public.normalize_player_name(b);
  tokens_a text[];
  tokens_b text[];
  surname_a text;
  surname_b text;
  givens_a text[];
  givens_b text[];
  shorter text[];
  longer text[];
  used boolean[];
  g text;
  matched boolean;
  found boolean := false;
  suffix text;
  i integer;
begin
  if norm_a is null or norm_b is null then
    return false;
  end if;

  if norm_a <> norm_b and exists (
    select 1 from public.player_name_aliases
    where kind = 'full_name'
      and name_a = least(norm_a, norm_b) and name_b = greatest(norm_a, norm_b)
  ) then
    return true;
  end if;

  tokens_a := regexp_split_to_array(norm_a, '\s+');
  tokens_b := regexp_split_to_array(norm_b, '\s+');
  if array_length(tokens_a, 1) < 2 or array_length(tokens_b, 1) < 2 then
    return false;
  end if;

  surname_a := tokens_a[array_length(tokens_a, 1)];
  surname_b := tokens_b[array_length(tokens_b, 1)];
  givens_a := tokens_a[1:array_length(tokens_a, 1) - 1];
  givens_b := tokens_b[1:array_length(tokens_b, 1) - 1];

  if surname_a <> surname_b then
    -- Compound-surname fallback: does a's joined surname equal b's trailing
    -- tokens concatenated? Walk suffixes from the end; require >=2 absorbed
    -- tokens (i <= len-1) and >=1 remaining given (i >= 2).
    suffix := '';
    for i in reverse array_length(tokens_b, 1) .. 2 loop
      suffix := tokens_b[i] || suffix;
      if i <= array_length(tokens_b, 1) - 1 and suffix = surname_a then
        givens_b := tokens_b[1:i - 1];
        found := true;
        exit;
      end if;
    end loop;
    if not found then
      -- Symmetric: b's joined surname vs a's trailing tokens.
      suffix := '';
      for i in reverse array_length(tokens_a, 1) .. 2 loop
        suffix := tokens_a[i] || suffix;
        if i <= array_length(tokens_a, 1) - 1 and suffix = surname_b then
          givens_a := tokens_a[1:i - 1];
          found := true;
          exit;
        end if;
      end loop;
    end if;
    if not found then
      return false;
    end if;
  end if;

  if array_length(givens_a, 1) <= array_length(givens_b, 1) then
    shorter := givens_a;
    longer := givens_b;
  else
    shorter := givens_b;
    longer := givens_a;
  end if;

  used := array_fill(false, array[array_length(longer, 1)]);

  foreach g in array shorter loop
    matched := false;
    for i in 1..array_length(longer, 1) loop
      if used[i] then
        continue;
      end if;
      -- exact match OR >=3-char prefix match in either direction
      if g = longer[i]
         or (length(g) >= 3 and length(longer[i]) >= length(g) and left(longer[i], length(g)) = g)
         or (length(longer[i]) >= 3 and length(g) >= length(longer[i]) and left(g, length(longer[i])) = longer[i])
      then
        matched := true;
      -- nickname pair; only queried when the cheap checks fail
      elsif exists (
        select 1 from public.player_name_aliases
        where kind = 'given_name'
          and name_a = least(g, longer[i]) and name_b = greatest(g, longer[i])
      ) then
        matched := true;
      end if;
      if matched then
        used[i] := true;
        exit;
      end if;
    end loop;
    if not matched then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

-- Seed: the NICKNAME_GROUPS rows from name-match.ts as pairs (minus the three
-- cross-name merges above), and the one FULL_NAME_ALIASES row.
insert into public.player_name_aliases (kind, name_a, name_b)
select 'given_name', x.a, x.b
from (values
  ('abby', 'abigail'),
  ('bob', 'bobby'), ('bob', 'rob'), ('bob', 'robert'), ('bobby', 'rob'), ('bobby', 'robert'), ('rob', 'robert'),
  ('mike', 'michael'),
  ('jim', 'jimmy'), ('jim', 'james'), ('jimmy', 'james'),
  ('bill', 'billy'), ('bill', 'will'), ('bill', 'william'), ('billy', 'will'), ('billy', 'william'), ('will', 'william'),
  ('dick', 'rick'), ('dick', 'ricky'), ('dick', 'richard'), ('rick', 'ricky'), ('rick', 'richard'), ('ricky', 'richard'),
  ('tom', 'tommy'), ('tom', 'thomas'), ('tommy', 'thomas'),
  ('dave', 'david'),
  ('joe', 'joey'), ('joe', 'joseph'), ('joey', 'joseph'),
  ('chris', 'christopher'),
  ('nick', 'nicholas'),
  ('tony', 'anthony'),
  ('kate', 'katie'), ('kate', 'katherine'), ('kate', 'kathryn'), ('kate', 'catherine'), ('katie', 'katherine'),
  ('katie', 'kathryn'), ('katie', 'catherine'), ('katherine', 'kathryn'), ('katherine', 'catherine'), ('kathryn', 'catherine'),
  ('liz', 'beth'), ('liz', 'elizabeth'), ('beth', 'elizabeth'),
  ('meg', 'maggie'), ('meg', 'margaret'), ('maggie', 'margaret'),
  ('becky', 'rebecca'),
  ('jen', 'jenny'), ('jen', 'jennifer'), ('jenny', 'jennifer'),
  ('sam', 'sammy'), ('sam', 'samantha'), ('sam', 'samuel'), ('sammy', 'samantha'), ('sammy', 'samuel'),
  ('alex', 'alexander'), ('alex', 'alexandra'),
  ('gabe', 'gabriel'),
  ('nate', 'nathan'), ('nate', 'nathaniel'), ('nathan', 'nathaniel'),
  ('andy', 'drew'), ('andy', 'andrew'), ('drew', 'andrew'),
  ('eddie', 'eddy'), ('eddie', 'ed'), ('eddie', 'edwin'), ('eddie', 'edward'), ('eddy', 'ed'), ('eddy', 'edwin'),
  ('eddy', 'edward'), ('ed', 'edwin'), ('ed', 'edward')
) as x(a, b);

insert into public.player_name_aliases (kind, name_a, name_b, note)
values ('full_name', 'Chance Cochran', 'Jackson Cochran',
  'UFA Chance Cochran (Colorado Summit 2024) = USAU Jackson Cochran (Johnny Bravo 2022-26), both Denver. Verified 2026-08-13 + 2026-09-29.');

-- Relink profiles whose first name has a nickname pair (~3.3k of 21k); the
-- per-minute trickle (50/min, ~160 ms each) works through them in ~1 h.
update public.player_profiles p
set built_at = '-infinity'
where built_at <> '-infinity'
  and split_part(public.normalize_player_name(p.profile ->> 'displayName'), ' ', 1) in (
    select name_a from public.player_name_aliases where kind = 'given_name'
    union
    select name_b from public.player_name_aliases where kind = 'given_name'
  );

notify pgrst, 'reload schema';
