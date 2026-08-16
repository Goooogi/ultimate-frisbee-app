import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: UA });
const page = await context.newPage();

await page.goto('http://localhost:3000/scores?league=usau', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

const links = await page.$$eval('a[href*="/usau/events/"]', (as) =>
  as.map((a) => a.getAttribute('href')),
);
console.log('EVENT LINKS:', JSON.stringify([...new Set(links)], null, 2));

await browser.close();
