// Shared error helpers for Supabase / PostgREST responses.
//
// Goal: when something goes wrong, the UI gets a string the user can act on
// AND we keep the raw error available for logging. Three patterns:
//
//   1. Known PostgREST error codes get a friendly hand-written message
//      (e.g. 42501 → "You don't have permission to do that.").
//   2. Postgres trigger RAISE messages (P0001) pass through — they're
//      authored by us and already user-readable ("cannot remove the last
//      owner of a team").
//   3. Unknown errors fall back to the raw message with the code in
//      parens, so we can debug instead of staring at "Could not create team."

interface SupabaseLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
  // PostgrestError sometimes nests the original error.
  cause?: unknown;
}

/** Convert anything that came out of a Supabase call into a user-facing
 *  string. Pass `context` ("Create team", "Send invite") so errors are
 *  self-describing in toasts/banners. */
export function formatSupabaseError(err: unknown, context?: string): string {
  if (!err) return context ? `${context} failed.` : 'Something went wrong.';

  if (typeof err === 'string') return prefix(context, err);

  const e = err as SupabaseLikeError & { name?: string };
  const code = e.code ?? undefined;
  const raw = e.message ?? '';

  // Friendly messages for codes users will actually hit.
  if (code === '42501' || raw.includes('row-level security')) {
    return prefix(context, "You don't have permission to do that.");
  }
  if (code === '23505') {
    // Unique violation — most often "team already exists" or "invite already
    // pending" depending on which index. The detail field has the index
    // name, which we surface so devs can see it but the headline stays
    // friendly.
    const friendly = parseUniqueViolation(e.details ?? null) ?? 'That already exists.';
    return prefix(context, friendly);
  }
  if (code === '23514') {
    return prefix(context, parseCheckViolation(e.details ?? null) ?? 'Some of those fields look invalid.');
  }
  if (code === '23503') {
    return prefix(context, 'A linked record is missing or no longer exists.');
  }
  if (code === 'P0001' && raw) {
    // RAISE EXCEPTION from a trigger — message is already user-authored.
    return prefix(context, raw);
  }
  if (code === 'PGRST116') {
    // "JSON object requested, multiple (or no) rows returned" — the row we
    // expected isn't there (e.g. we just inserted it but RLS hides it).
    return prefix(context, "That action succeeded but the result wasn't visible to you. Refresh to see it.");
  }
  if (raw) return prefix(context, raw + (code ? ` (${code})` : ''));

  if (err instanceof Error) return prefix(context, err.message);
  return prefix(context, 'Something went wrong.');
}

function prefix(context: string | undefined, msg: string): string {
  if (!context) return msg;
  if (msg.endsWith('.') || msg.endsWith('!')) return `${context}: ${msg}`;
  return `${context}: ${msg}.`;
}

function parseUniqueViolation(detail: string | null): string | null {
  if (!detail) return null;
  if (detail.includes('teams_short_name')) return 'A team with that short code already exists.';
  if (detail.includes('teams_name')) return 'A team with that name already exists.';
  if (detail.includes('team_invites_unique_pending')) {
    return 'There is already a pending invite for that email on this team.';
  }
  if (detail.includes('profiles_phone_unique_idx')) return 'That phone number is already on another account.';
  if (detail.includes('profiles_username')) return 'That username is taken.';
  return null;
}

function parseCheckViolation(detail: string | null): string | null {
  if (!detail) return null;
  if (detail.includes('short_name')) return 'Short code must be 2–4 letters or numbers (uppercase).';
  if (detail.includes('color')) return 'Color must be a hex like #FF3D00.';
  if (detail.includes('name')) return 'Name is required.';
  if (detail.includes('phone_format')) return 'Phone must be in international format (e.g. +1 555 123 4567).';
  return null;
}
