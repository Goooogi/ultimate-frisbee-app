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
// This is conservative on purpose. It does NOT handle nicknames
// (Bob ↔ Robert), initials matched to full names (J. ↔ John), or
// transliterated/diacritic variants beyond NFD-stripping. Those need
// a real identity layer.

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

/**
 * True if given-name `a` matches `b` as the same first/middle name, allowing
 * abbreviation by PREFIX. The shorter token must be a prefix of the longer and
 * be ≥3 chars, so we don't over-match short stems ("jo" → Joseph/John/Joshua).
 * Surname equality is already required by the caller, keeping this conservative.
 *
 *   "ben"  ↔ "benjamin"  → true     "matt" ↔ "matthew" → true
 *   "dan"  ↔ "daniel"    → true     "ben"  ↔ "ben"     → true (exact)
 *   "jo"   ↔ "joseph"    → false (prefix < 3)
 *   "bob"  ↔ "robert"    → false (non-prefix nickname, out of scope)
 */
function givenMatches(a: string, b: string): boolean {
  if (a === b) return true;
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
