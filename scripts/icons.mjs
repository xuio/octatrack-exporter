// Regenerates the PWA icon PNGs from public/icon.svg.
//   node scripts/icons.mjs
// There is no raster toolchain in this project (and no new dependencies), so the
// SVG is rendered by the browser we already drive for screenshots and captured
// with a screenshot — the same rasteriser that will draw the favicon.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}public/icon.svg`, 'utf8');

// The maskable variant is the odd one out: platforms crop it to their own shape
// (Android circles it), so it drops the artwork's rounded-square ground, bleeds
// the flat ground colour to every edge, and shrinks the glyph into the 80% safe
// zone. The "any" variants keep their own corners and transparent surround.
const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
];

const page = (size, maskable) => `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; background:${maskable ? '#161826' : 'transparent'}; }
  #box { width:${size}px; height:${size}px; display:grid; place-items:center; }
  svg { width:${maskable ? Math.round(size * 0.8) : size}px; height:auto; display:block; }
  ${maskable ? '.ground { display:none }' : ''}
</style>
<div id="box">${svg}</div>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  for (const { file, size, maskable } of TARGETS) {
    const tab = await browser.newPage();
    await tab.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await tab.setContent(page(size, maskable), { waitUntil: 'load' });
    const png = await tab.screenshot({ omitBackground: !maskable, type: 'png' });
    writeFileSync(`${root}public/${file}`, png);
    await tab.close();
    console.log('✓', file, `${size}×${size}`);
  }
} finally {
  await browser.close();
}
