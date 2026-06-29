// diagnose-reachability: confirms whether this Edge Function can reach USAU.
//
// Run this FIRST after deploying. If it returns a 403 status from USAU,
// the rest of the architecture won't work without a proxy layer.
//
// No auth needed — set verify_jwt = false in config.toml.

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const TEST_URLS = [
  'https://play.usaultimate.org/',
  'https://play.usaultimate.org/events/tournament/',
  'https://play.usaultimate.org/teams/events/rankings/?RankSet=ClubMixed&Season=2025',
];

Deno.serve(async () => {
  const results: Array<{
    url: string;
    status: number | null;
    contentType: string | null;
    bodySize: number | null;
    bodySample: string | null;
    error: string | null;
  }> = [];

  for (const url of TEST_URLS) {
    try {
      const t0 = Date.now();
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      const body = await res.text();
      results.push({
        url,
        status: res.status,
        contentType: res.headers.get('content-type'),
        bodySize: body.length,
        bodySample: body.slice(0, 500),
        error: null,
      });
      console.log(`${url} → ${res.status} (${body.length} bytes, ${Date.now() - t0}ms)`);
    } catch (err) {
      results.push({
        url,
        status: null,
        contentType: null,
        bodySize: null,
        bodySample: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.status === 200);
  const anyBlocked = results.some((r) => r.status === 403);

  return Response.json({
    verdict: allOk
      ? 'REACHABLE — proceed with architecture as designed'
      : anyBlocked
      ? 'BLOCKED — USAU returned 403. Add proxy layer before continuing. See CLAUDE.md.'
      : 'PARTIAL — some requests failed. Investigate.',
    results,
  });
});
