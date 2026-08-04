-- names_match: add the compound-surname fallback.
--
-- Sources disagree on whether a particle surname is joined or split:
-- EUCS 2025 rosters say "Daan DeMarree", USAU/UFA say "Daan De Marrée". The
-- token-subset rule compared surnames "demarree" vs "marree" and refused the
-- match, so his 2025 EUCS appearances never attached to the unified profile
-- and search listed him twice.
--
-- New rule: when the plain surname comparison fails, check whether one side's
-- surname equals the other side's TRAILING TOKENS CONCATENATED ("demarree" =
-- "de" + "marree"). If so, absorb those tokens into the surname and run the
-- usual givens subset check on what's left. Conservative by construction:
-- exact letter-sequence equality, >=2 tokens absorbed, and >=1 given must
-- remain — a bare "De Marrée" can never claim every "Daan".
--
-- Full CREATE OR REPLACE (not a prosrc patch): the deployed body was fetched
-- 2026-08-04 and this text is that body plus the fallback. MIRROR of the TS
-- rule in src/lib/name-match.ts (minus its curated nickname table) — keep the
-- two in sync.
CREATE OR REPLACE FUNCTION public.names_match(a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
        used[i] := true;
        matched := true;
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
