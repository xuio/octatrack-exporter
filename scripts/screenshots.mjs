// Regenerates the README screenshots by driving the real app in headless Chrome.
//   npm run build && npm run preview &   # serve dist/ on :4173
//   npm run screenshots
// Everything is driven through the UI — no reaching into component internals —
// so this doubles as an end-to-end smoke test of the whole flow.
//
// Material: by default the shots use a real song's stems + MIDI loaded from
// STEMS_DIR (a folder of "1 NAME.wav" … files plus the arrangement .mid) so the
// README shows real music rather than the synthesized demo. When the folder is
// absent — CI, another machine — it falls back to the built-in demo.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://localhost:4173/octatrack-exporter/';
const OUT = 'docs/img';
const STEMS_DIR = process.env.STEMS_DIR || '/Users/moritz/Downloads/Turn The Night Electric';
const wait = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  // A narrow viewport rendered at 2x: the UI fills the frame (so it reads large
  // in the README) and stays sharp on high-density screens.
  defaultViewport: { width: 1120, height: 560, deviceScaleFactor: 2 },
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

const setHeight = async (height) => {
  await page.setViewport({ width: 1120, height, deviceScaleFactor: 2 });
  await wait(350);
};

/**
 * Frame a step to its own content. Measured rather than hardcoded so the shots
 * stay tight as the UI changes. Only leaves count — layout containers stretch to
 * fill the viewport and would always measure as "full height".
 */
const fitToContent = async (min = 320) => {
  await setHeight(900);
  const height = await page.evaluate(() => {
    const isLeaf = el => !el.children.length || /^(BUTTON|INPUT|CANVAS|SVG)$/.test(el.tagName);
    let bottom = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (!isLeaf(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      bottom = Math.max(bottom, r.bottom);
    }
    return Math.ceil(bottom);
  });
  await setHeight(Math.max(min, height + 20));
};

/** The results step fills the viewport by design, so it is framed to its lanes. */
const fitToTimeline = async () => {
  await setHeight(900);
  const height = await page.evaluate(() => {
    const lanes = [...document.querySelectorAll('div')].filter(d => d.style.backgroundImage && d.style.height);
    const last = lanes[lanes.length - 1];
    return last ? Math.ceil(last.getBoundingClientRect().bottom) : 0;
  });
  await setHeight(height + 46);          // room for the selection bar underneath
};

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await wait(500);

// 1 — intake
await fitToContent();
await shot('01-files-empty');
const files = existsSync(STEMS_DIR)
  ? readdirSync(STEMS_DIR).filter(f => /\.(wav|aiff?|flac|mid|midi)$/i.test(f) && !f.startsWith('.')).map(f => join(STEMS_DIR, f))
  : null;
if (files) {
  console.log(`· loading ${files.length} files from ${STEMS_DIR}`);
  const input = await page.$('input[type=file]');
  await input.uploadFile(...files);
  // real stems are minutes long — decoding takes a while
  await until(() => /STEMS · \d+ loaded/.test(document.body.innerText), null, 180000);
} else {
  console.log('· STEMS_DIR not found — using the built-in demo');
  await click('Shake');
  await until(() => /STEMS · 5 loaded/.test(document.body.innerText));
}
await wait(400);
await fitToContent();
await shot('02-files-loaded');

// 2 — tempo
await click('Continue');
await atStep('2 Tempo');
await fitToContent();
await shot('03-tempo');

// 3 — sections
await click('Confirm');
await atStep('3 Regions');
await fitToContent();
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
await fitToTimeline();
await shot('05-timeline');

// a selected clip shows its trim handles and the detail bar
await page.evaluate(() => {
  const blocks = document.querySelectorAll('.slice-block');
  blocks[Math.min(8, blocks.length - 1)].dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await until(() => document.querySelectorAll('.trim-h').length === 2);
await fitToTimeline();
await shot('06-slice-selected');

// playing: meters, scopes and the playhead
await clickTitle('Play');
await wait(2500);
await fitToTimeline();
await shot('07-playing');
await clickTitle('Stop');

// pattern table
await page.evaluate(() => [...document.querySelectorAll('.seg-opt')].find(l => /Table/.test(l.textContent)).querySelector('input').click());
await wait(500);
await fitToContent();
await shot('08-table');
await page.evaluate(() => [...document.querySelectorAll('.seg-opt')].find(l => /Timeline/.test(l.textContent)).querySelector('input').click());

// 5 — export
await click('Export →');
await atStep('5 Export');
await fitToContent();
await shot('09-export');

// themes, back on the timeline
await click('4 Results');
await atStep('4 Results');
for (const theme of ['Cobalt', 'Ember', 'Paper']) {
  await page.evaluate((t) => {
    [...document.querySelectorAll('.theme-opt')].find(o => o.textContent.startsWith(t)).click();
  }, theme);
  await wait(500);
  await fitToTimeline();
  await shot(`10-theme-${theme.toLowerCase()}`);
}

await browser.close();
console.log('done →', OUT);
