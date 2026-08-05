// Regenerates the README screenshots by driving the real app in headless Chrome.
//   npm run build && npm run preview &   # serve dist/ on :4173
//   npm run screenshots
// Everything is driven through the UI — no reaching into component internals —
// so this doubles as an end-to-end smoke test of the whole flow.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://localhost:4173/octatrack-exporter/';
const OUT = 'docs/img';
const wait = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1400, height: 640, deviceScaleFactor: 1 },
  args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'],
});
const page = await browser.newPage();

const click = (text) => page.evaluate((t) => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t));
  if (!button) throw new Error(`no button starting with "${t}"`);
  button.click();
}, text);

const clickTitle = (title) => page.evaluate((t) => {
  const button = [...document.querySelectorAll('button')].find(b => b.title?.startsWith(t));
  if (!button) throw new Error(`no button titled "${t}"`);
  button.click();
}, title);

const until = (fn, arg, timeout = 40000) => page.waitForFunction(fn, { timeout, polling: 200 }, arg);
const atStep = (label) => until(l => document.querySelector('.stp.on')?.textContent === l, label);
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('✓', name); };

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await wait(500);

// 1 — intake
await shot('01-files-empty');
await click('Shake');
await until(() => /STEMS · 5 loaded/.test(document.body.innerText));
await shot('02-files-loaded');

// 2 — tempo
await click('Continue');
await atStep('2 Tempo');
await shot('03-tempo');

// 3 — sections
await click('Confirm');
await atStep('3 Regions');
await shot('04-regions');

// 4 — timeline
await click('Analyze');
await atStep('4 Results');
await until(() => document.querySelectorAll('.slice-block').length > 0);
// make sure the scopes are showing (they are on by default — only click if not)
await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find(b => b.title?.startsWith('Per-track oscilloscopes'));
  if (!button.classList.contains('on')) button.click();
});
await wait(600);
await shot('05-timeline');

// a selected clip shows its trim handles and the detail bar
await page.evaluate(() => document.querySelectorAll('.slice-block')[8].dispatchEvent(new MouseEvent('click', { bubbles: true })));
await until(() => document.querySelectorAll('.trim-h').length === 2);
await shot('06-slice-selected');

// playing: meters, scopes and the playhead
await clickTitle('Play');
await wait(2500);
await shot('07-playing');
await clickTitle('Stop');

// pattern table
await page.evaluate(() => [...document.querySelectorAll('.seg-opt')].find(l => /Table/.test(l.textContent)).querySelector('input').click());
await wait(500);
await shot('08-table');
await page.evaluate(() => [...document.querySelectorAll('.seg-opt')].find(l => /Timeline/.test(l.textContent)).querySelector('input').click());

// 5 — export
await click('Export →');
await atStep('5 Export');
await shot('09-export');

// themes, back on the timeline
await click('4 Results');
await atStep('4 Results');
for (const theme of ['Cobalt', 'Ember', 'Paper']) {
  await page.evaluate((t) => {
    [...document.querySelectorAll('.theme-opt')].find(o => o.textContent.startsWith(t)).click();
  }, theme);
  await wait(500);
  await shot(`10-theme-${theme.toLowerCase()}`);
}

await browser.close();
console.log('done →', OUT);
