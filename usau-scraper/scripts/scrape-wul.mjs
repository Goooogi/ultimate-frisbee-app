// Automated WUL scraper — drives the WUL Stats Shiny dashboard with Playwright
// and extracts the Player Data + Team Data tables for every available season,
// writing CSVs in the exact column order the dashboard renders (which matches
// the manual-export format), so ingest-wul.py consumes them unchanged.
//
// Why a browser (not HTTP scraping like USAU): the dashboard is an R Shiny app
// that renders data into DataTables over a websocket session — there's no JSON
// API and no GET-able CSV. We read the rendered <table> directly (the same idea
// as USAU HTML scraping, just inside a real browser session). No download
// button is involved; we set DataTables page length to "All" and read all rows.
//
// Usage: node usau-scraper/scripts/scrape-wul.mjs [outdir] [year]
//   outdir  defaults to usau-scraper/data/wul
//   year    which season(s) to scrape:
//             - omitted  → CURRENT season only (the largest year offered by the
//               dashboard). This is the CI default: past seasons are immutable,
//               so re-scraping them each run buys nothing and multiplies both the
//               Shiny wait time and the window for a mid-run redeploy to break us.
//             - a 4-digit year (e.g. 2026) → just that season
//             - "all" → every season the dashboard offers (manual re-baseline)
//           Can also be set via the WUL_YEAR env var (arg wins if both given).
//
// Exit code: non-zero if a REQUESTED current/single season yields 0 rows
// (selector drift or Shiny down — a real failure, not a benign no-op). In
// "all" mode a single empty year is logged and skipped (older seasons may
// legitimately be absent), but zero usable years overall still fails.
//
// Output: wul-player-YYYY.csv + wul-team-YYYY.csv for each season scraped.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'https://westernultimateleague.shinyapps.io/stats/';
const OUTDIR = process.argv[2] || path.join(__dirname, '..', 'data', 'wul');
// Year selector: CLI arg 3 > WUL_YEAR env > '' (current season only).
const YEAR_ARG = (process.argv[3] || process.env.WUL_YEAR || '').trim().toLowerCase();

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function toCsv(headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // The manual export wraps EVERY field in quotes and has a leading blank
  // header for the row-index column. The dashboard table's first column is the
  // DataTables index; we mirror the export shape: leading "" header + index col.
  const head = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
  const body = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  return head + '\n' + body + '\n';
}

/** Read the correct DataTable by matching its HEADERS. The page holds one
 *  <table> per tab simultaneously; picking "the first table" always returns
 *  Player Data. So we choose the table whose header row CONTAINS `mustHave`
 *  (e.g. 'Player' for Player Data, 'GA' for Team Data) and does NOT contain
 *  `mustNot`. This is robust to Shiny's tab class/visibility quirks. */
async function readTable(page, mustHave, mustNot) {
  return page.evaluate(({ mustHave, mustNot }) => {
    const tables = [...document.querySelectorAll('table')];
    const score = (t) => {
      const hdr = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      if (mustHave && !hdr.includes(mustHave)) return null;
      if (mustNot && hdr.includes(mustNot)) return null;
      return hdr;
    };
    let chosen = null, headers = null;
    for (const t of tables) {
      const h = score(t);
      if (h) {
        // prefer the one with the most body rows (the populated one)
        const rc = t.querySelectorAll('tbody tr').length;
        if (!chosen || rc > chosen.querySelectorAll('tbody tr').length) { chosen = t; headers = h; }
      }
    }
    if (!chosen) return null;
    const rows = [...chosen.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
    );
    return { headers, rows };
  }, { mustHave, mustNot });
}

/** Set every VISIBLE DataTables length selector to "All" (-1). Multiple tabs
 *  each have one; selecting on all visible ones is harmless and ensures the
 *  active table shows all rows. */
async function showAllRows(page) {
  const sels = await page.$$('select[name*="length" i]');
  for (const sel of sels) {
    const visible = await sel.isVisible().catch(() => false);
    if (visible) await sel.selectOption('-1').catch(() => {});
  }
  await page.waitForTimeout(2000);
}

/** Select a year. The year selectize is the first VISIBLE .selectize-control
 *  on the active tab. We click it, then click the option with that data-value
 *  from whichever dropdown opened. */
async function selectYear(page, year) {
  const controls = await page.$$('.selectize-control');
  let opened = false;
  for (const c of controls) {
    if (await c.isVisible().catch(() => false)) { await c.click(); opened = true; break; }
  }
  if (!opened) throw new Error('no visible selectize control');
  await page.waitForTimeout(700);
  const opt = await page.$(`.selectize-dropdown-content .option[data-value="${year}"]`);
  if (!opt) { await page.keyboard.press('Escape').catch(() => {}); return false; }
  await opt.click();
  await page.waitForTimeout(4000); // Shiny reactive redraw
  return true;
}

async function discoverYears(page) {
  const controls = await page.$$('.selectize-control');
  for (const c of controls) {
    if (await c.isVisible().catch(() => false)) { await c.click(); break; }
  }
  await page.waitForTimeout(800);
  const years = await page.$$eval('.selectize-dropdown-content .option', (els) =>
    els.map((e) => e.getAttribute('data-value') || e.textContent.trim()).filter((v) => /^\d{4}$/.test(v)),
  );
  await page.keyboard.press('Escape').catch(() => {});
  return [...new Set(years)].sort();
}

async function scrapeTab(page, tabName, year) {
  await page.getByText(tabName, { exact: true }).first().click();
  await page.waitForTimeout(3500); // tab pane swap
  const ok = await selectYear(page, year);
  if (!ok) { log(`  ${tabName} ${year}: year not selectable, skip`); return null; }
  await showAllRows(page);
  await page.waitForTimeout(2500);

  // Read the RIGHT table by header signature. Player Data has 'Player';
  // Team Data has 'GA' and no 'Player'.
  const t =
    tabName === 'Player Data'
      ? await readTable(page, 'Player', null)
      : await readTable(page, 'GA', 'Player');
  if (!t || t.rows.length === 0) { log(`  ⚠ ${tabName} ${year}: no matching table / 0 rows — skip`); return null; }
  log(`  ${tabName} ${year}: ${t.rows.length} rows, ${t.headers.length} cols ✓ (${t.headers.slice(0,4).join(',')}…)`);
  return t;
}

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  log('loading dashboard (Shiny warms slowly)…');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await page.waitForSelector('.nav-tabs a, .nav-link', { timeout: 90000 });
  await page.waitForTimeout(4000);

  // Discover years from the Player Data tab.
  await page.getByText('Player Data', { exact: true }).first().click();
  await page.waitForTimeout(5000);
  const allYears = await discoverYears(page);
  log('years available:', allYears.join(', '));
  if (allYears.length === 0) {
    await browser.close();
    throw new Error('no seasons discovered on the dashboard (Shiny down or selectors drifted)');
  }

  // Resolve which season(s) to scrape from YEAR_ARG.
  //   ''     → current season only (largest year)  [CI default]
  //   'all'  → every discovered season              [manual re-baseline]
  //   '2026' → just that season (must exist)
  const currentSeason = allYears[allYears.length - 1]; // sorted ascending
  let targetYears;
  let singleRequired; // true → an empty result is a hard failure
  if (YEAR_ARG === 'all') {
    targetYears = allYears;
    singleRequired = false;
  } else if (/^\d{4}$/.test(YEAR_ARG)) {
    if (!allYears.includes(YEAR_ARG)) {
      await browser.close();
      throw new Error(`requested year ${YEAR_ARG} not offered by dashboard (have: ${allYears.join(', ')})`);
    }
    targetYears = [YEAR_ARG];
    singleRequired = true;
  } else {
    targetYears = [currentSeason];
    singleRequired = true;
  }
  log(`scraping: ${targetYears.join(', ')}${singleRequired ? ' (fail-loud on empty)' : ' (re-baseline)'}`);

  let yearsWritten = 0;
  for (const year of targetYears) {
    log(`=== ${year} ===`);
    const player = await scrapeTab(page, 'Player Data', year);
    if (player) {
      fs.writeFileSync(path.join(OUTDIR, `wul-player-${year}.csv`), toCsv(player.headers, player.rows));
    }
    const team = await scrapeTab(page, 'Team Data', year);
    if (team) {
      fs.writeFileSync(path.join(OUTDIR, `wul-team-${year}.csv`), toCsv(team.headers, team.rows));
    }
    // A year is "written" only if BOTH tables came through — a half-scrape
    // (e.g. player rows but no team rows) can't derive games, so don't count it.
    if (player && team) yearsWritten++;
    else log(`  ⚠ ${year}: incomplete (player=${!!player}, team=${!!team})`);
  }

  await browser.close();
  log(`done. ${yearsWritten}/${targetYears.length} season(s) fully scraped. CSVs in ${OUTDIR}`);

  // Fail-loud: a requested single/current season that produced nothing usable
  // means selector drift or Shiny down — surface it as a red run, don't exit 0.
  if (yearsWritten === 0) {
    throw new Error(
      singleRequired
        ? `current/requested season ${targetYears[0]} produced no usable data (selector drift or source down)`
        : 'no seasons produced usable data in re-baseline mode',
    );
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
