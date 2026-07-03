// ASP.NET WebForms postback helpers for USAU scraping.
//
// USAU's tournament calendar uses ASP.NET GridView pagination via
// __doPostBack — there are no ?page=N query parameters.  Each "Next 25 »"
// link encodes the postback target + argument.  To advance a page we must:
//   1. Extract hidden form fields (__VIEWSTATE etc.) from the current HTML.
//   2. Find the "Next" anchor in the pager and pull out its target + arg.
//   3. POST all of the above back to the same URL.
//   4. Repeat from step 1 using the NEW hidden fields the server returns.
//
// The VIEWSTATE value changes on every round-trip — NEVER reuse a stale one.

import { load } from 'npm:cheerio@1.0.0';

// ----------------------------------------------------------------
// Hidden-field extraction
// ----------------------------------------------------------------

/**
 * Extract every `<input type="hidden" name="__*" ...>` field from the page.
 * This always includes __VIEWSTATE, __VIEWSTATEGENERATOR, and __EVENTVALIDATION,
 * plus any other ASP.NET infrastructure fields present.
 *
 * cheerio's .val() / .attr('value') returns already HTML-decoded strings, so
 * the large base64 VIEWSTATE blob is returned verbatim and safe to POST back.
 */
export function parseHiddenFields(html: string): Record<string, string> {
  const $ = load(html);
  const fields: Record<string, string> = {};
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name') ?? '';
    const value = $(el).attr('value') ?? '';
    // Capture all hidden inputs — ASP.NET may add more than the three
    // canonical ones (__VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION).
    if (name) {
      fields[name] = value;
    }
  });
  return fields;
}

// ----------------------------------------------------------------
// Pager "Next" link extraction
// ----------------------------------------------------------------

/**
 * Find the "Next 25 »" anchor within the pager row of a specific GridView
 * and return the __EVENTTARGET / __EVENTARGUMENT values encoded in its href.
 *
 * USAU's ASP.NET pager renders something like:
 *
 *   <a href="javascript:__doPostBack('CT_HP_Mid_1$gvCurrentUpcomingEvents$ctl28$ctl00$ctl09','')">
 *     Next 25 &raquo;
 *   </a>
 *
 * The `ctlNN` segments CHANGE every render — we cannot hardcode them.
 * We locate the link by its text content ("next" case-insensitively, which
 * matches both "Next 25 »" and plain "Next »") within the pager cells of
 * the targeted grid.
 *
 * @param html    Full page HTML string
 * @param gridId  The HTML element id of the GridView table, e.g.
 *                "CT_HP_Mid_1_gvCurrentUpcomingEvents".  Note that the id
 *                attribute uses underscores while the postback target uses
 *                dollar signs — we handle both.
 * @returns { target, argument } if a "Next" link is found, null otherwise.
 */
export function extractNextPostback(
  html: string,
  gridId = 'CT_HP_Mid_1_gvCurrentUpcomingEvents',
): { target: string; argument: string } | null {
  const $ = load(html);

  // The pager lives inside the GridView table.  ASP.NET renders the pager
  // as the last <tr> in the table's <tbody>, containing <td> cells with
  // page-number/Previous/Next links.
  const $grid = $(`#${gridId}`);
  if (!$grid.length) return null;

  let result: { target: string; argument: string } | null = null;

  $grid.find('a').each((_, el) => {
    const text = $(el).text().trim();
    // Match any anchor whose text starts with "Next" (handles "Next 25 »",
    // "Next »", "Next", etc.).
    if (!/^next\b/i.test(text)) return;

    const href = $(el).attr('href') ?? '';
    // href is: javascript:__doPostBack('<target>','<argument>')
    // The target string uses $ delimiters:
    //   CT_HP_Mid_1$gvCurrentUpcomingEvents$ctl28$ctl00$ctl09
    const m = href.match(
      /javascript:__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)/i,
    );
    if (m) {
      result = { target: m[1], argument: m[2] };
      return false; // break cheerio .each()
    }
  });

  return result;
}

/**
 * Find the "View All" postback link and return its __EVENTTARGET / __EVENTARGUMENT.
 *
 * USAU's paged GridViews (e.g. the team rankings page) render a single link
 * below the grid that expands every page onto one:
 *
 *   <a id="CT_Main_0_lnkViewAll"
 *      href="javascript:__doPostBack('CT_Main_0$lnkViewAll','')">View All</a>
 *
 * One "View All" postback returns ALL rows in a single response — far cheaper
 * (and gentler on the WAF) than looping "Next 20 »" pages. The ctl/id prefix
 * changes across pages/versions, so we locate the link by its id ending in
 * "lnkViewAll" OR its visible text "View All" and pull the target out of the
 * __doPostBack href.
 *
 * @returns { target, argument } if found, else null (caller falls back to page 1).
 */
export function extractViewAllPostback(
  html: string,
): { target: string; argument: string } | null {
  const $ = load(html);
  let result: { target: string; argument: string } | null = null;

  $('a').each((_, el) => {
    const id = $(el).attr('id') ?? '';
    const text = $(el).text().trim();
    const isViewAll = /lnkViewAll$/i.test(id) || /^view all$/i.test(text);
    if (!isViewAll) return;

    const href = $(el).attr('href') ?? '';
    const m = href.match(/javascript:__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)/i);
    if (m) {
      result = { target: m[1], argument: m[2] };
      return false; // break cheerio .each()
    }
  });

  return result;
}
