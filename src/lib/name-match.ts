// Cross-league name matching.
//
// Goal: link the same human across UFA + USAU even when one league has
// their middle name and the other doesn't. UFA's "Mitchell McCarthy"
// should match USAU's "Robert Mitchell McCarthy".
//
// Rule (token-subset):
//   1. Last token (surname) must match exactly after normalization — OR one
//      side's surname must equal the other side's trailing tokens joined
//      ("DeMarree" = "De" + "Marrée"), the compound-surname fallback.
//   2. The shorter name's other tokens (first + middles) must ALL appear
//      somewhere in the longer name's other tokens.
//
// MIRROR: public.names_match in Postgres implements the same rule and is what
// _build_player_profile uses to attach stints (web + mobile). Keep the rules in
// sync — a name that matches here but not in SQL shows up in search dedup but
// never attaches to the unified profile, and vice versa.
//
// The DATA both sides use lives in public.player_name_aliases (load it with
// loadNameAliases from '@/lib/name-aliases'): nickname pairs (Bob ↔ Robert) and
// person-specific full-name overrides (Chance Cochran ↔ Jackson Cochran). Add
// rows there, never here. Prefix abbreviations (Ben ⊂ Benjamin) are a rule.
// It does NOT handle initials matched to full names (J. ↔ John) or
// transliterated variants beyond NFD-stripping.

/**
 * Normalize a name for matching: NFD-strip diacritics, lowercase, drop
 * non-alphanumerics, collapse whitespace, trim.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize a normalized name into [givens..., surname]. Returns null
 * when there aren't at least two tokens to split.
 */
function tokenize(name: string): { givens: string[]; surname: string } | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  const tokens = norm.split(' ');
  if (tokens.length < 2) return null;
  return {
    surname: tokens[tokens.length - 1],
    givens: tokens.slice(0, -1),
  };
}

/**
 * True if two names refer to the same person under the token-subset
 * rule. Returns false for single-token names (we can't disambiguate
 * "Madonna" cross-league anyway).
 *
 * Examples (all return true):
 *   "Mitchell McCarthy" ↔ "Robert Mitchell McCarthy"
 *   "John Smith"        ↔ "John Robert Smith"
 *   "John Smith"        ↔ "John Smith"
 *   "Bob Smith"         ↔ "Robert Smith"      (given_name alias row)
 *   "Chance Cochran"    ↔ "Jackson Cochran"   (full_name alias row)
 *
 * Examples (all return false):
 *   "John Smith"        ↔ "Jane Smith"        (givens differ)
 *   "John A Smith"      ↔ "John B Smith"      (middles contradict)
 *   "Chance Smith"      ↔ "Jackson Smith"     (full_name aliases never
 *                                              generalize past that person)
 */
export function namesMatch(a: string, b: string, aliases: NameAliases): boolean {
  // Person-specific aliases first: these pairs deliberately FAIL the token rule
  // (different givens), so they must short-circuit before tokenization.
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na && nb && aliases.fullNames.get(na)?.has(nb)) return true;

  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta || !tb) return false;
  if (ta.surname === tb.surname) return givensCompatible(ta.givens, tb.givens, aliases.givenNames);

  // Compound-surname fallback: one source joins a particle surname that the
  // other splits — EUCS "Daan DeMarree" vs USAU "Daan De Marrée". If one
  // side's surname equals the other side's trailing tokens concatenated,
  // absorb those tokens into the surname and compare the remaining givens.
  // Requires an exact letter-sequence match of ≥2 absorbed tokens with ≥1
  // given left over, so a bare "De Marrée" can never claim every "Daan".
  const absorbedB = absorbTrailing(ta.surname, tb);
  if (absorbedB) return givensCompatible(ta.givens, absorbedB, aliases.givenNames);
  const absorbedA = absorbTrailing(tb.surname, ta);
  if (absorbedA) return givensCompatible(absorbedA, tb.givens, aliases.givenNames);
  return false;
}

/**
 * If `joinedSurname` equals the concatenation of `split`'s trailing tokens
 * (surname + one or more particles: "demarree" = "de" + "marree"), return the
 * tokens left over as givens. At least 2 tokens must be absorbed and at least
 * 1 given must remain; otherwise null.
 */
function absorbTrailing(
  joinedSurname: string,
  split: { givens: string[]; surname: string },
): string[] | null {
  const tokens = [...split.givens, split.surname];
  let suffix = '';
  for (let i = tokens.length - 1; i >= 1; i--) {
    suffix = tokens[i] + suffix;
    if (i <= tokens.length - 2 && suffix === joinedSurname) return tokens.slice(0, i);
  }
  return null;
}

/**
 * Token-subset check over given names. Pick the shorter side; each of its
 * givens must match SOME given on the longer side, where "match" = exact OR a
 * nickname pair OR an abbreviation prefix (Ben ⊂ Benjamin, Dan ⊂ Daniel).
 * Each longer-side given can be claimed once.
 */
function givensCompatible(a: string[], b: string[], nicknames: AliasIndex): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Array(longer.length).fill(false);
  for (const g of shorter) {
    let matched = false;
    for (let i = 0; i < longer.length; i++) {
      if (used[i]) continue;
      if (givenMatches(g, longer[i], nicknames)) {
        used[i] = true;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

/** Normalized name → the names it aliases to (symmetric). */
type AliasIndex = ReadonlyMap<string, ReadonlySet<string>>;

/** Rows of public.player_name_aliases, as loadNameAliases reads them. */
export type NameAliasRow = { kind: 'given_name' | 'full_name'; name_a: string; name_b: string };

export type NameAliases = { givenNames: AliasIndex; fullNames: AliasIndex };

/**
 * Index alias rows for namesMatch. Rows are stored normalized by SQL
 * (normalize_player_name); they're re-normalized here so lookups compare in
 * this module's normalization.
 */
export function buildNameAliases(rows: readonly NameAliasRow[]): NameAliases {
  const givenNames = new Map<string, Set<string>>();
  const fullNames = new Map<string, Set<string>>();
  const link = (m: Map<string, Set<string>>, from: string, to: string) => {
    let s = m.get(from);
    if (!s) m.set(from, (s = new Set()));
    s.add(to);
  };
  for (const r of rows) {
    const m = r.kind === 'given_name' ? givenNames : fullNames;
    const a = normalizeName(r.name_a);
    const b = normalizeName(r.name_b);
    link(m, a, b);
    link(m, b, a);
  }
  return { givenNames, fullNames };
}

/**
 * True if given-name `a` matches `b` as the same first/middle name. Three ways
 * to match: exact equality, a nickname pair row (Abby ↔ Abigail), or
 * abbreviation by PREFIX. For the prefix case the shorter token must be a prefix
 * of the longer and be ≥3 chars, so we don't over-match short stems ("jo" →
 * Joseph/John/Joshua). Surname equality is already required by the caller,
 * keeping this conservative.
 *
 *   "ben"  ↔ "benjamin"  → true     "matt" ↔ "matthew" → true
 *   "dan"  ↔ "daniel"    → true     "ben"  ↔ "ben"     → true (exact)
 *   "abby" ↔ "abigail"   → true     "bob"  ↔ "robert"  → true (nickname pair)
 *   "jo"   ↔ "joseph"    → false (prefix < 3, not a listed nickname)
 */
function givenMatches(a: string, b: string, nicknames: AliasIndex): boolean {
  if (a === b) return true;
  if (nicknames.get(a)?.has(b)) return true;
  // Prefix abbreviation.
  const [shortG, longG] = a.length <= b.length ? [a, b] : [b, a];
  if (shortG.length < 3) return false;
  return longG.startsWith(shortG);
}

/**
 * Build a SQL-side `OR`-friendly prefilter: ilike on surname so we can
 * fetch a small candidate set from Postgres before applying the strict
 * `namesMatch` check in JS.
 *
 * Returns null when the name has fewer than two tokens — caller should
 * skip cross-league lookup in that case.
 */
export function surnameForPrefilter(name: string): string | null {
  const t = tokenize(name);
  return t ? t.surname : null;
}
