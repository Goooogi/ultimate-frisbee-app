// probe-url: fetch a URL from the Edge Function and return
// status + body sample + optional pattern-based extracts.
//
// SECURITY: this function is deployed with verify_jwt=false so it is reachable
// by anyone. Without restriction it is an SSRF pivot — a caller could point it
// at cloud metadata (169.254.169.254), internal services, or use it as an
// anonymous fetch proxy. It is an operator debug tool for a fixed set of
// scraping targets, so we hard-restrict the fetch target to an allowlist of
// those hosts. Anything off-allowlist is rejected before any network call.

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// Hosts this tool is allowed to fetch. Exact host or a subdomain of one of
// these. Derived from the actual scraper targets used across the project.
const ALLOWED_HOST_SUFFIXES = [
  'usaultimate.org', // play.usaultimate.org (USAU)
  'ultirzr.app',
  'pul-stats-hub.pages.dev',
  'shinyapps.io', // westernultimateleague.shinyapps.io (WUL)
  'ufastats.com', // www.backend.ufastats.com (UFA)
  'watchufa.com',
];

function isAllowedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  // Only http(s). Blocks file:, data:, etc.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

Deno.serve(async (req) => {
  let url: string | null = null;
  let extract: string | null = null;
  let sampleLen = 600;
  let aroundNeedle: string | null = null;
  let aroundLen = 800;
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      const body = await req.json();
      url = body.url ?? null;
      extract = body.extract ?? null;
      if (typeof body.sampleLen === 'number') sampleLen = body.sampleLen;
      if (typeof body.aroundNeedle === 'string') aroundNeedle = body.aroundNeedle;
      if (typeof body.aroundLen === 'number') aroundLen = body.aroundLen;
    } else {
      const u = new URL(req.url);
      url = u.searchParams.get('url');
      extract = u.searchParams.get('extract');
      const an = u.searchParams.get('around');
      if (an) aroundNeedle = an;
    }
  } catch {
    /* ignore */
  }
  if (!url) {
    return Response.json({ ok: false, error: 'url is required' }, { status: 400 });
  }

  // SSRF guard: reject any target that is not an allowlisted scraping host.
  if (!isAllowedUrl(url)) {
    return Response.json(
      { ok: false, error: 'url host is not allowed' },
      { status: 403 },
    );
  }

  try {
    const res = await fetch(url, {
      redirect: 'manual', // a 3xx to an internal host must not be auto-followed
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await res.text();

    // Slice around a needle (e.g. 'Pool A') for debugging.
    let aroundMatches: Array<{ index: number; snippet: string }> | null = null;
    if (aroundNeedle) {
      aroundMatches = [];
      let i = 0;
      while (aroundMatches.length < 8) {
        const j = body.indexOf(aroundNeedle, i);
        if (j === -1) break;
        aroundMatches.push({
          index: j,
          snippet: body.slice(Math.max(0, j - 100), j + aroundLen),
        });
        i = j + aroundNeedle.length;
      }
    }

    let extracted: string[] | null = null;
    if (extract === 'event-slugs') {
      const matches = new Set<string>();
      const re = /\/events\/([a-zA-Z0-9-]+)\/?["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        if (!m[1].match(/^(tournament|team|rankings)$/i)) {
          matches.add(m[1]);
        }
      }
      extracted = Array.from(matches);
    } else if (extract === 'event-team-ids') {
      const matches = new Set<string>();
      const re = /<a[^>]*href="[^"]*EventTeamId=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        matches.add(`${m[2].trim()} :: ${decodeURIComponent(m[1])}`);
      }
      extracted = Array.from(matches);
    } else if (extract === 'schedule-links') {
      const matches = new Set<string>();
      const re = /href="([^"]*schedule[^"]*)"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        matches.add(m[1]);
      }
      extracted = Array.from(matches);
    } else if (extract === 'any-links') {
      const matches = new Set<string>();
      const re = /href="([^"#][^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        if (m[1].includes('/events/') || m[1].includes('schedule')) {
          matches.add(m[1]);
        }
      }
      extracted = Array.from(matches);
    } else if (extract === 'headings') {
      const matches: string[] = [];
      const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) {
        const txt = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (txt) matches.push(`${m[1]}: ${txt}`);
      }
      extracted = matches;
    } else if (extract === 'tables') {
      // For each <table>, capture its class attribute + nearest prior
      // heading text so we can see what classes USAU uses for each kind
      // of table on the page.
      const matches: string[] = [];
      const tableRe = /<table[^>]*class="([^"]*)"[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = tableRe.exec(body)) !== null) {
        // Find the closest <hN> heading text BEFORE this table.
        const before = body.slice(0, m.index);
        const headingRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
        let lastHeading = '';
        let hm: RegExpExecArray | null;
        while ((hm = headingRe.exec(before)) !== null) {
          lastHeading = `${hm[1]}: ${hm[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`;
        }
        matches.push(`class="${m[1]}" prev="${lastHeading}"`);
      }
      extracted = matches;
    }

    return Response.json({
      ok: true,
      url,
      status: res.status,
      contentType: res.headers.get('content-type'),
      size: body.length,
      sample: body.slice(0, sampleLen),
      around: aroundMatches,
      extracted,
    });
  } catch (err) {
    return Response.json({
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
});
