// Shared HTTP client for USAU scraping.
// Handles: User-Agent, retries, throttling, timeouts.
//
// DO NOT remove the throttle — 2s minimum gap is intentional, see CLAUDE.md.

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Safari/605.1.15';

let lastRequestAt = 0;
// 5s gap (up from 2s) — USAU started rate-limiting our cloud IP after
// sustained bursts of resolver/roster traffic. The extra headroom lets
// large bulk passes run to completion without 429/timeout retries.
const MIN_GAP_MS = 5000;

async function throttle(gapMs: number = MIN_GAP_MS) {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + gapMs - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export type FetchOptions = {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  /** Per-call throttle gap override. Defaults to MIN_GAP_MS (5s). Discovery
   *  walks that paginate a single calendar in one invocation pass 2000 here:
   *  ~30 sequential GETs at 2s = light browsing (not the sustained roster/
   *  resolver bursts that triggered the 5s default), and keeps the whole walk
   *  under the Edge ~150s wall-clock limit. */
  gapMs?: number;
};

export async function fetchHtml(
  url: string,
  opts: FetchOptions = {}
): Promise<string> {
  const { retries = 3, retryDelayMs = 1500, timeoutMs = 20_000, gapMs } = opts;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    await throttle(gapMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 403) {
        // Likely WAF block on cloud IPs. Retrying same IP won't help.
        throw new Error(
          `403 Forbidden for ${url} — likely USAU WAF block. See CLAUDE.md.`
        );
      }
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Retryable HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      attempt++;
      if (attempt > retries) break;
      await new Promise((r) =>
        setTimeout(r, retryDelayMs * Math.pow(2, attempt - 1))
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unknown fetch error');
}

/**
 * POST an application/x-www-form-urlencoded form to `url` and return the
 * response body as text.  Used for ASP.NET __doPostBack pagination.
 *
 * Shares the same throttle, User-Agent, retry logic, and error handling as
 * fetchHtml.  Adds Content-Type + Referer/Origin headers that ASP.NET
 * ViewState validation expects (some ASP.NET setups 302-redirect or 500 if
 * the referer is missing).
 */
export async function postForm(
  url: string,
  formData: Record<string, string>,
  opts: FetchOptions = {},
): Promise<string> {
  const { retries = 3, retryDelayMs = 1500, timeoutMs = 20_000, gapMs } = opts;
  const body = new URLSearchParams(formData).toString();

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    await throttle(gapMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded',
          // ASP.NET EventValidation and some WAF rules check referer.
          Referer: url,
          Origin: new URL(url).origin,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 403) {
        throw new Error(
          `403 Forbidden (postForm) for ${url} — likely USAU WAF block. See CLAUDE.md.`,
        );
      }
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Retryable HTTP ${res.status} (postForm) for ${url}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (postForm) for ${url}`);
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      attempt++;
      if (attempt > retries) break;
      await new Promise((r) =>
        setTimeout(r, retryDelayMs * Math.pow(2, attempt - 1)),
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unknown postForm error');
}
