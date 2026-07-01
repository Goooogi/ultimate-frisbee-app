// Text moderation for user-chosen public identifiers (display name + handle).
//
// Uses `obscenity` with its English recommended dataset + transformers, which
// catch common obfuscation (leetspeak "f4ck", spacing "f u c k", symbol
// substitution) far better than a naive word list, while its whitelist keeps
// the Scunthorpe class of false positives down. We layer a small supplemental
// blocklist for hard slurs we always reject regardless.
//
// One matcher instance is built once at module load and reused (it's stateless
// per-check). Safe on both server and client.

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Supplemental hard blocklist — normalized (lowercase, non-alphanumerics
// stripped) substring match. For slurs/phrases we never want, independent of
// the library. Keep terms lowercase + alphanumeric-only here.
const SUPPLEMENTAL_BLOCKLIST: string[] = [
  // racial / ethnic slurs
  'n1gger', 'nigger', 'nigga', 'chink', 'spic', 'kike', 'gook', 'wetback', 'coon',
  // homophobic / ableist slurs
  'faggot', 'fag', 'tranny', 'retard',
  // other hard terms
  'rape', 'rapist', 'nazi', 'hitler', 'kkk',
];

/** Collapse to lowercase alphanumerics so "f_a_g" / "f.a.g" also match. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True when `text` contains profanity/slurs and must be rejected.
 * Runs three passes:
 *   1. obscenity matcher on the raw text (obfuscation-aware).
 *   2. obscenity matcher on a whitespace-collapsed copy — catches spaced-out
 *      evasion like "f u c k" that the raw pass misses.
 *   3. supplemental normalized-substring blocklist (hard slurs).
 */
export function containsProfanity(text: string): boolean {
  if (!text) return false;
  if (matcher.hasMatch(text)) return true;
  // Collapse runs of whitespace/punctuation between single letters so
  // "f u c k" / "f-u-c-k" reduce to "fuck" for a second matcher pass.
  const despaced = text.replace(/[\s._\-*]+/g, '');
  if (despaced !== text && matcher.hasMatch(despaced)) return true;
  const norm = normalize(text);
  return SUPPLEMENTAL_BLOCKLIST.some((bad) => norm.includes(bad));
}

/**
 * Validate a public-facing name (display name OR handle-as-shown). Returns an
 * error string to show the user, or null when the value is acceptable.
 * `field` is used only for the message ("Display name" / "Handle").
 */
export function moderateName(text: string, field = 'Name'): string | null {
  if (containsProfanity(text)) {
    return `${field} contains language that isn't allowed. Please choose another.`;
  }
  return null;
}
