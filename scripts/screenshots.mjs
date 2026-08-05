// Regenerates the README screenshots by driving the real app in headless Chrome.
//   npm run build && npm run preview &   # serve dist/ on :4173
//   node scripts/screenshots.mjs
// Chrome path can be overridden with CHROME=/path/to/chrome
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

const clickText = async (text) => page.evaluate(t => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(t));
  if (!b) throw new Error('no button starting with ' + t);
  b.click();
}, text);

const app = async () => page.evaluateHandle(() => {
  const el = document.querySelector('.stp');
  const k = Object.keys(el).find(x => x.startsWith('__reactFiber'));
  let f = el[k];
  while (f) { if (f.stateNode && f.stateNode.state && 'step' in f.stateNode.state) return f.stateNode; f = f.return; }
  return null;
});

const setState = async (patch) => {
  const inst = await app();
  await page.evaluate((i, p) => i.setState(p), inst, patch);
  await wait(500);
};

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('✓', name); };

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await wait(600);

// 1 — intake
await shot('01-files-empty');

await clickText('Shake');
await wait(5000);
await shot('02-files-loaded');

// 2 — tempo
await clickText('Continue');
await wait(700);
await shot('03-tempo');

// 3 — regions
await clickText('Confirm');
await wait(700);
await shot('04-regions');

// 4 — timeline
await clickText('Analyze');
await wait(6000);
await setState({ railW: 250, laneH: 62, scopeMode: 'scope', ppm: 26 });
await shot('05-timeline');

// selection + trim handles
const inst = await app();
await page.evaluate(i => {
  const sd = i.state.analysis.stemData.find(x => x.id === i.state.stems[3].id);
  i.setState({ sel: { stemId: sd.id, regionIdx: sd.slices[1].region.idx }, ppm: 34 });
}, inst);
await wait(700);
await shot('06-slice-selected');

// meters + scopes while playing
await page.evaluate(i => { i.setState({ startMeasure: 12, vol: 1 }); setTimeout(() => i.play(), 200); }, inst);
await wait(2500);
await shot('07-playing');
await page.evaluate(i => i.stop(), inst);

// table view
await setState({ view: 'table' });
await shot('08-table');
await setState({ view: 'tl' });

// 5 — export
await clickText('Export →');
await wait(700);
await shot('09-export');

// themes (timeline in each scheme)
await setState({ step: 'results' });
for (const theme of ['cobalt', 'ember', 'paper']) {
  await setState({ theme });
  await shot(`10-theme-${theme}`);
}
await setState({ theme: 'nocturne' });

await browser.close();
console.log('done →', OUT);
