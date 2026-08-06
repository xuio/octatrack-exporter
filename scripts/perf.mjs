// Measures OSSC at its ceiling — 8 stems × 64 sections — by driving the real
// production build in headless Chrome. Nothing here reaches into component
// internals: every number is a wall-clock measurement around a real interaction.
//
//   npm run build && npm run preview &   # serve dist/ on :4173
//   node scripts/perf.mjs
//   THROTTLE=4 node scripts/perf.mjs     # same table on a slow machine
//
// THROTTLE applies CDP CPU throttling. A development Mac finishes everything
// here inside a frame, which says nothing about the laptops OSSC actually runs
// on — 4× is where the ordering of the costs becomes visible.
//
// Prints one table. Metrics are milliseconds unless the name says otherwise;
// frame times come from rAF deltas and long tasks from a PerformanceObserver.
// Re-run it before and after a change and compare — that is the whole point.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://localhost:4173/octatrack-exporter/';
const THROTTLE = Number(process.env.THROTTLE || 1);
const wait = ms => new Promise(r => setTimeout(r, ms));

const rows = [];
const record = (metric, value, note = '') => {
  rows.push({ metric, value, note });
  console.log(`  ${metric.padEnd(34)} ${String(value).padStart(9)}  ${note}`);
};

const stats = (samples) => {
  if (!samples.length) return { mean: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: sorted[sorted.length - 1],
  };
};
const r1 = n => Math.round(n * 10) / 10;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: { width: 1600, height: 900 },
  args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
if (THROTTLE > 1) {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}

// Instrumentation, installed before any app code runs.
await page.evaluateOnNewDocument(() => {
  window.__lt = [];
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* no longtask support */ }

  window.__frames = [];
  window.__sampling = false;
  window.__startFrames = () => {
    window.__frames = [];
    window.__sampling = true;
    let last = performance.now();
    const tick = (t) => {
      if (!window.__sampling) return;
      window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
  };
  window.__stopFrames = () => { window.__sampling = false; return window.__frames; };

  // One interaction, measured to the paint that follows it. React commits
  // synchronously inside a discrete event, so the second rAF is past the paint.
  window.__timed = (fn) => new Promise((resolve) => {
    const t0 = performance.now();
    fn();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
  });

  // The "reading"/"synthesizing" indicator must actually appear during the
  // multi-second synth, or the app looks hung at this scale.
  window.__sawReading = false;
  setInterval(() => {
    if (/Synthesizing demo song|Reading /.test(document.body.innerText)) window.__sawReading = true;
  }, 100);

  // The session snapshot is written straight to localStorage, which is
  // synchronous — worth knowing how often that happens while scrolling.
  window.__writes = { n: 0, ms: 0, bytes: 0 };
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const t = performance.now();
    setItem.call(this, key, value);
    window.__writes.n++;
    window.__writes.ms += performance.now() - t;
    window.__writes.bytes = String(value).length;
  };

  window.__scroller = () => [...document.querySelectorAll('div')].find(d => d.style.overflowX === 'auto');
  window.__button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(text));
  window.__titled = (title) => [...document.querySelectorAll('button')].find(b => b.title?.startsWith(title));
});

const until = (fn, arg, timeout = 180000) => page.waitForFunction(fn, { timeout, polling: 'raf' }, arg);
const atStep = (label) => until(l => document.querySelector('.stp.on')?.textContent === l, label);
const timed = (fnBody) => page.evaluate(body => window.__timed(new Function(body)), fnBody);
const longTasks = () => page.evaluate(() => { const l = window.__lt; window.__lt = []; return l; });

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await wait(400);

console.log(`\nOSSC perf — 8 stems × 64 sections  (${BASE}, CPU ${THROTTLE}×)\n`);

// ---------- intake ----------
await longTasks();
let t0 = Date.now();
await page.evaluate(() => window.__button('Stress').click());
await until(() => /STEMS · 8 loaded/.test(document.body.innerText));
record('demo synth + decode → 8 stems', Date.now() - t0);
// The reading indicator has to be visible while that runs, or the app looks hung.
const sawReading = await page.evaluate(() => window.__sawReading === true);

await page.evaluate(() => window.__button('Continue').click());
await atStep('2 Tempo');
await page.evaluate(() => window.__button('Confirm').click());
await atStep('3 Regions');

// ---------- analyze + first render ----------
await longTasks();
t0 = Date.now();
await page.evaluate(() => window.__button('Analyze').click());
await atStep('4 Results');
const analyzeMs = Date.now() - t0;
await until(() => document.querySelectorAll('.slice-block').length > 0);
const tasks = await longTasks();
const worst = tasks.reduce((m, t) => Math.max(m, t.dur), 0);
const counts = await page.evaluate(() => ({
  slices: document.querySelectorAll('.slice-block').length,
  ghosts: document.querySelectorAll('.slice-ghost').length,
  paths: document.querySelectorAll('.slice-block path').length,
}));
record('analyze → results step', analyzeMs, `${counts.slices} clips, ${counts.ghosts} ghosts`);
record('results first render (long task)', r1(worst), `${tasks.length} long tasks in the window`);
record('slice <path> nodes in the DOM', counts.paths, `at the default zoom, ${sawReading ? 'reading indicator shown' : 'reading indicator NOT shown'}`);

// ---------- zoom ----------
await wait(300);
for (const [label, title] of [['zoom in', '+'], ['zoom out', '−']]) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    // The zoom pair is the untitled one — the threshold ±3 dB buttons look the
    // same but carry a title.
    samples.push(await timed(`[...document.querySelectorAll('button.tb')].find(b => b.textContent.trim() === ${JSON.stringify(title)} && !b.title).click()`));
    await wait(120);
  }
  record(`${label} step → paint`, r1(stats(samples).mean), `mean of 5, max ${r1(stats(samples).max)}`);
}

// ---------- scroll while playing ----------
// At the default zoom the whole 120-bar song nearly fits the window, so a scroll
// sweep there measures nothing. Four zoom steps (ppm 16 → ~61) make the
// arrangement about four screens wide — the zoom people actually trim at.
const zoomIn = n => page.evaluate((count) => {
  const b = [...document.querySelectorAll('button.tb')].find(x => x.textContent.trim() === '+' && !x.title);
  for (let i = 0; i < count; i++) b.click();
}, n);
await zoomIn(4);
await wait(600);
record('scroll span at working zoom (px)', await page.evaluate(() => {
  const el = window.__scroller();
  return Math.round(el.scrollWidth - el.clientWidth);
}));
await page.evaluate(() => window.__titled('Play').click());
await wait(800);
await longTasks();
await page.evaluate(() => { window.__writes = { n: 0, ms: 0, bytes: 0 }; });
await page.evaluate(() => window.__startFrames());
// A 3-second sweep across the whole arrangement, one step per frame — what a
// long trackpad scroll produces, without the input noise.
await page.evaluate(() => new Promise((resolve) => {
  const el = window.__scroller();
  const span = el.scrollWidth - el.clientWidth;
  const t0 = performance.now();
  const step = () => {
    const p = (performance.now() - t0) / 3000;
    el.scrollLeft = Math.min(span, span * p);
    if (p >= 1) return resolve();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}));
let frames = await page.evaluate(() => window.__stopFrames());
let scrollTasks = await longTasks();
let s = stats(frames);
record('scroll+play frame time mean', r1(s.mean), `${frames.length} frames`);
record('scroll+play frame time p95', r1(s.p95));
record('scroll+play frame time max', r1(s.max), `${scrollTasks.length} long tasks`);
const writes = await page.evaluate(() => window.__writes);
record('session writes during that scroll', writes.n, `${r1(writes.ms)} ms total, ${writes.bytes} B a snapshot`);

// scopes off — is the per-track visualiser what costs, or the lanes?
await page.evaluate(() => { const b = window.__titled('Per-track oscilloscopes'); if (b.classList.contains('on')) b.click(); });
await wait(500);
await page.evaluate(() => window.__startFrames());
await wait(2500);
frames = await page.evaluate(() => window.__stopFrames());
record('playing FPS, scopes off', r1(1000 / stats(frames).mean));
await page.evaluate(() => { const b = window.__titled('Per-track oscilloscopes'); if (!b.classList.contains('on')) b.click(); });
await wait(500);
await page.evaluate(() => window.__startFrames());
await wait(2500);
frames = await page.evaluate(() => window.__stopFrames());
record('playing FPS, scopes on', r1(1000 / stats(frames).mean));
await page.evaluate(() => window.__titled('Stop').click());
await wait(300);

// ---------- playback start ----------
{
  const samples = [];
  for (let i = 0; i < 3; i++) {
    samples.push(await timed("window.__titled('Play').click()"));
    await wait(600);
    await page.evaluate(() => window.__titled('Stop').click());
    await wait(400);
  }
  record('playback start → paint', r1(stats(samples).mean), 'mean of 3');
}

// Back to the full-song zoom for the edit metrics: every clip on screen is the
// widest a re-render can be, which is the case worth reporting.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button.tb')].find(x => x.textContent.trim() === '−' && !x.title);
  for (let i = 0; i < 4; i++) b.click();
  window.__scroller().scrollLeft = 0;
});
await wait(600);

// ---------- threshold ----------
{
  const samples = [];
  for (const value of [-40, -34, -28, -46, -40]) {
    samples.push(await timed(`
      const el = document.querySelector('input[type=range][aria-label^="Silence threshold"]');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(el, ${value});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `));
    await wait(200);
  }
  const t = stats(samples);
  record('threshold change → settle', r1(t.mean), `mean of 5, max ${r1(t.max)}`);
}

// ---------- edit + undo ----------
await page.evaluate(() => document.querySelectorAll('.slice-block')[40].dispatchEvent(new MouseEvent('click', { bubbles: true })));
await until(() => document.querySelectorAll('.trim-h').length === 2);
{
  const samples = [], undos = [];
  for (let i = 0; i < 4; i++) {
    const t = Date.now();
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    samples.push(Date.now() - t);
    await wait(150);
  }
  for (let i = 0; i < 4; i++) {
    const t = Date.now();
    await page.keyboard.down('Meta'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Meta');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    undos.push(Date.now() - t);
    await wait(150);
  }
  record('trim nudge → paint', r1(stats(samples).mean), `mean of 4, max ${stats(samples).max}`);
  record('undo → paint', r1(stats(undos).mean), `mean of 4, max ${stats(undos).max}`);
}

// ---------- pattern table ----------
{
  const toTable = await timed("[...document.querySelectorAll('.seg-opt')].find(l => /Table/.test(l.textContent)).querySelector('input').click()");
  await until(() => !document.querySelector('.slice-block'));
  const toTimeline = await timed("[...document.querySelectorAll('.seg-opt')].find(l => /Timeline/.test(l.textContent)).querySelector('input').click()");
  await until(() => document.querySelectorAll('.slice-block').length > 0);
  record('view switch → pattern table', r1(toTable));
  record('view switch → timeline', r1(toTimeline));
}

console.log('');
await browser.close();
