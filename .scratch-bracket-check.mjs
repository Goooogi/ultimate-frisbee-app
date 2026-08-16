import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const OUT = '/private/tmp/claude-501/-Users-huntermay-git-ultimate-frisbee-app/a272e1ca-42ac-4678-9f80-ad760ff65230/scratchpad';

const browser = await chromium.launch();

const targets = [
  { div: 'men', width: 1440, name: 'skitown-men-desktop' },
  { div: 'women', width: 1440, name: 'skitown-women-desktop' },
  { div: 'men', width: 390, name: 'skitown-men-mobile' },
  { div: 'women', width: 390, name: 'skitown-women-mobile' },
];

for (const t of targets) {
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: t.width, height: t.width === 390 ? 3200 : 2400 },
  });
  const page = await context.newPage();
  const url = `http://localhost:3000/usau/events/Ski-Town-Classic-2026?div=${t.div}`;
  console.log(`--- ${t.name}: ${url} ---`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const status = page.url();
    console.log('landed at', status);

    // Try to click a "Bracket" tab if one exists, in case it's not default.
    const bracketTabCandidates = await page.$$('button, a');
    for (const el of bracketTabCandidates) {
      const text = (await el.textContent())?.trim().toLowerCase();
      if (text === 'bracket' || text === 'brackets') {
        await el.click().catch(() => {});
        await page.waitForTimeout(1000);
        break;
      }
    }

    const gChips = await page.locator('text=/^G\\d+$/').count();
    const wOfLabels = await page.locator('text=/^W of /').count();
    console.log(`G-chips found: ${gChips}, "W of ..." labels found: ${wOfLabels}`);

    await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: true });
    console.log(`saved ${t.name}.png`);
  } catch (e) {
    console.log('ERROR', t.name, e.message);
  }
  await context.close();
}

await browser.close();
