// Cross-league name matching.
//
// Goal: link the same human across UFA + USAU even when one league has
// their middle name and the other doesn't. UFA's "Mitchell McCarthy"
// should match USAU's "Robert Mitchell McCarthy".
//
// Rule (token-subset):
//   1. Last token (surname) must match exactly after normalization.
//   2. The shorter name's other tokens (first + middles) must ALL appear
//      somewhere in the longer name's other tokens.
//
// It handles a curated set of common nicknames (Bob ↔ Robert, Abby ↔
// Abigail) via the NICKNAME_GROUPS table below, plus prefix abbreviations
// (Ben ⊂ Benjamin). It does NOT handle initials matched to full names
// (J. ↔ John) or transliterated variants beyond NFD-stripping. Anything
// outside the curated table needs a real identity layer.

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
 *
 * Examples (all return false):
 *   "John Smith"        ↔ "Jane Smith"        (givens differ)
 *   "Bob Smith"         ↔ "Robert Smith"      (nickname)
 *   "John A Smith"      ↔ "John B Smith"      (middles contradict)
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta || !tb) return false;
  if (ta.surname !== tb.surname) return false;

  // Pick shorter side; each of its givens must match SOME given on the longer
  // side, where "match" = exact OR an abbreviation prefix (Ben ⊂ Benjamin,
  // Dan ⊂ Daniel, Matt ⊂ Matthew). Each longer-side given can be claimed once.
  const [shorter, longer] = ta.givens.length <= tb.givens.length ? [ta, tb] : [tb, ta];
  const used = new Array(longer.givens.length).fill(false);
  for (const g of shorter.givens) {
    let matched = false;
    for (let i = 0; i < longer.givens.length; i++) {
      if (used[i]) continue;
      if (givenMatches(g, longer.givens[i])) {
        used[i] = true;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

// Curated nickname groups — each row is a set of given names that refer to the
// same person. Membership is symmetric and transitive within a row: any token
// in a group matches any other token in that group. All entries must be
// normalized (lowercase, no punctuation) to match normalizeName's output.
//
// Conservative by design: only known pairs match, and the caller still requires
// the surname to be equal, so a false merge needs both a nickname collision AND
// a shared surname. Add new rows as real edge cases surface — do NOT add stems
// so generic they'd merge distinct people (e.g. don't group "al" with both
// "albert" and "alexander").
const NICKNAME_GROUPS: readonly (readonly string[])[] = [
  ['abby', 'abigail'],
  ['bob', 'bobby', 'rob', 'robert'],
  ['mike', 'michael'],
  ['jim', 'jimmy', 'james'],
  ['bill', 'billy', 'will', 'william'],
  ['dick', 'rick', 'ricky', 'richard'],
  ['tom', 'tommy', 'thomas'],
  ['dave', 'david'],
  ['joe', 'joey', 'joseph'],
  ['chris', 'christopher'],
  ['nick', 'nicholas'],
  ['tony', 'anthony'],
  ['kate', 'katie', 'katherine', 'kathryn', 'catherine'],
  ['liz', 'beth', 'elizabeth'],
  ['meg', 'maggie', 'margaret'],
  ['becky', 'rebecca'],
  ['jen', 'jenny', 'jennifer'],
  ['sam', 'samantha', 'samuel'],
  ['alex', 'alexander', 'alexandra'],
  ['gabe', 'gabriel'],
  ['nate', 'nathan', 'nathaniel'],
  ['andy', 'drew', 'andrew'],
];

// Flattened symmetric index: given name → its group id. Two names are nickname-
// equivalent iff they resolve to the same group id.
const NICKNAME_GROUP_BY_NAME: Map<string, number> = (() => {
  const m = new Map<string, number>();
  NICKNAME_GROUPS.forEach((group, i) => {
    for (const name of group) {
      // A name in two rows would silently lose transitivity (the later row
      // overwrites the earlier), so reject overlap at module load — merge the
      // overlapping rows into one instead.
      if (m.has(name)) {
        throw new Error(`name-match: nickname "${name}" appears in multiple groups; merge them`);
      }
      m.set(name, i);
    }
  });
  return m;
})();

/**
 * True if given-name `a` matches `b` as the same first/middle name. Three ways
 * to match: exact equality, a curated nickname pairing (Abby ↔ Abigail), or
 * abbreviation by PREFIX. For the prefix case the shorter token must be a prefix
 * of the longer and be ≥3 chars, so we don't over-match short stems ("jo" →
 * Joseph/John/Joshua). Surname equality is already required by the caller,
 * keeping this conservative.
 *
 *   "ben"  ↔ "benjamin"  → true     "matt" ↔ "matthew" → true
 *   "dan"  ↔ "daniel"    → true     "ben"  ↔ "ben"     → true (exact)
 *   "abby" ↔ "abigail"   → true     "bob"  ↔ "robert"  → true (nickname table)
 *   "jo"   ↔ "joseph"    → false (prefix < 3, not a listed nickname)
 */
function givenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  // Curated nickname equivalence (symmetric via shared group id).
  const ga = NICKNAME_GROUP_BY_NAME.get(a);
  if (ga !== undefined && ga === NICKNAME_GROUP_BY_NAME.get(b)) return true;
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
