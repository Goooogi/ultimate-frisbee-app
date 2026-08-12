// Distinguishing "the database is in trouble" from "the query returned
// something I can't use".
//
// App Health Rule #2 (born from the 2026-08-12 outage, vault "App Health
// Rules.md"): a fallback must be CHEAPER than what failed. Several call sites
// answer an RPC error by running a multi-query assembler — 6-10 queries where
// one failed. When the error was a timeout, that fallback also times out, so
// every failure bought 6-10 more failures and load turned into collapse.
//
// The rule this encodes: fall back on CONTRACT errors (the DB answered, but the
// answer was unusable — missing function, unmappable payload, stale schema
// cache), fail fast on HEALTH errors (timeout, connection loss, overload).

interface ErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * True when an error indicates the database/network is saturated or unreachable
 * — i.e. retrying or running a heavier alternate path will make things worse.
 */
export function isUnhealthyError(err: ErrorLike | null | undefined): boolean {
  if (!err) return false;

  switch (err.code ?? '') {
    case '57014': // query_canceled — statement_timeout fired
    case '53300': // too_many_connections
    case '53400': // configuration_limit_exceeded
    case '08006': // connection_failure
    case '08003': // connection_does_not_exist
    case '08001': // sqlclient_unable_to_establish_sqlconnection
    case 'PGRST504': // PostgREST gateway timeout
    case 'PGRST002': // schema cache could not be loaded (DB unreachable at boot)
      return true;
  }

  const msg = (err.message ?? '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('canceling statement') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('socket hang up') ||
    msg.includes('network request failed')
  );
}
