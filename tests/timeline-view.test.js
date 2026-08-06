import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PPM, MAX_PPM, clampPpm, ppmForRange, barLabelStep, restorableView,
  barAtViewportX, anchoredScrollLeft,
} from '../src/lib/index.js';

const material = { stemCount: 5, regionIdxs: [1, 2, 3], totalBars: 64 };

test('zoom is held between the limits the timeline can draw', () => {
  assert.equal(clampPpm(0.1), MIN_PPM);
  assert.equal(clampPpm(1e6), MAX_PPM);
  assert.equal(clampPpm(16), 16);
});

test('framing a range fills most of the viewport with it', () => {
  // 8 bars in a 1000px viewport at 80% → 100px per bar, so the range takes 800px
  assert.equal(ppmForRange(8, 1000), 100);
  assert.equal(ppmForRange(8, 1000) * 8, 800);
  // a whole long song cannot be zoomed below the minimum
  assert.equal(ppmForRange(2000, 1000), MIN_PPM);
  // a single bar cannot be zoomed past the maximum
  assert.equal(ppmForRange(1, 100000), MAX_PPM);
  // a zero-length range is treated as one bar rather than dividing by zero
  assert.ok(Number.isFinite(ppmForRange(0, 1000)));
});

test('overview bar numbers thin out as the song gets longer or the strip narrower', () => {
  assert.equal(barLabelStep(16, 1200), 1);     // 75px a bar — every bar fits
  assert.equal(barLabelStep(128, 1200), 8);    // 9.4px a bar → every 8th
  assert.equal(barLabelStep(128, 400), 16);    // same song, third of the width
  assert.equal(barLabelStep(2000, 1200), 128);
});

test('the bar under the cursor stays under the cursor across a zoom step', () => {
  const scrollLeft = 800, x = 300, ppm = 16;
  const bar = barAtViewportX(scrollLeft, x, ppm);   // (800 + 300) / 16 = 68.75
  assert.equal(bar, 68.75);
  for (const next of [16 * 1.1, 16 * 1.4, 16 / 1.1, 40, 160]) {
    const scrolled = anchoredScrollLeft(scrollLeft, x, ppm, next);
    assert.ok(Math.abs(barAtViewportX(scrolled, x, next) - bar) < 1e-9);
  }
});

test('a stream of zoom steps does not let the anchored bar drift', () => {
  // What a pinch actually does: many small steps, each anchored on the last.
  const x = 420;
  let scrollLeft = 1500, ppm = 24;
  const bar = barAtViewportX(scrollLeft, x, ppm);
  for (let i = 0; i < 200; i++) {
    const next = clampPpm(ppm * (i % 2 ? 1.03 : 1.07));
    scrollLeft = anchoredScrollLeft(scrollLeft, x, ppm, next);
    ppm = next;
  }
  assert.equal(ppm, MAX_PPM);   // it climbed to the ceiling
  assert.ok(Math.abs(barAtViewportX(scrollLeft, x, ppm) - bar) < 1e-6);
});

test('zooming out past the left edge lands on 0 rather than a negative scroll', () => {
  // Bar 5 under a cursor 100px in; zoom out hard and bar 5 would need the view
  // to start left of bar 0.
  const scrollLeft = 5 * 40 - 100, ppm = 40;
  assert.equal(barAtViewportX(scrollLeft, 100, ppm), 5);
  assert.equal(anchoredScrollLeft(scrollLeft, 100, ppm, 4), 0);      // 20 - 100 < 0
  assert.equal(anchoredScrollLeft(scrollLeft, 100, ppm, MIN_PPM), 0);
  // already at the left edge: staying there is the fixed point, no drift out
  assert.equal(anchoredScrollLeft(0, 100, ppm, MIN_PPM), 0);
  let s = 0;
  for (let i = 0; i < 50; i++) s = anchoredScrollLeft(s, 100, ppm, ppm);
  assert.equal(s, 0);
});

test('a snapshot from before view state existed restores nothing at all', () => {
  assert.equal(restorableView(undefined, material), null);
  assert.equal(restorableView(null, material), null);
  assert.equal(restorableView('nonsense', material), null);
});

test('a full view snapshot round-trips', () => {
  const saved = {
    ppm: 42, scrollX: 1234,
    selected: { stemIndex: 2, regionIdx: 3 },
    loop: { regionIdx: 2 },
    startBar: 17,
  };
  assert.deepEqual(restorableView(JSON.parse(JSON.stringify(saved)), material), saved);
});

test('a selection is dropped when its stem or its section is gone', () => {
  const of = (selected) => restorableView({ selected }, material).selected;
  assert.equal(of({ stemIndex: 9, regionIdx: 3 }), null);      // fewer stems now
  assert.equal(of({ stemIndex: 2, regionIdx: 99 }), null);     // section gone
  assert.equal(of({ stemIndex: -1, regionIdx: 3 }), null);
  assert.deepEqual(of({ stemIndex: 0, regionIdx: 1 }), { stemIndex: 0, regionIdx: 1 });
});

test('a loop is kept only if it still points somewhere real', () => {
  assert.deepEqual(restorableView({ loop: { regionIdx: 1 } }, material).loop, { regionIdx: 1 });
  assert.deepEqual(restorableView({ loop: { a: 8, b: 16 } }, material).loop, { a: 8, b: 16 });
  // a bar range past the (possibly re-analysed) end is pulled back inside it
  assert.deepEqual(restorableView({ loop: { a: 900, b: 999 } }, material).loop, { a: 63, b: 64 });
  assert.equal(restorableView({ loop: { regionIdx: 42 } }, material).loop, null);
  assert.equal(restorableView({ loop: null }, material).loop, null);
});

test('zoom, scroll and the start bar fall back to something sane', () => {
  const bare = restorableView({}, material);
  assert.equal(bare.ppm, null);        // null means "leave the zoom alone"
  assert.equal(bare.scrollX, 0);
  assert.equal(bare.startBar, 1);
  assert.equal(restorableView({ ppm: 1e9, scrollX: -5, startBar: 999 }, material).ppm, MAX_PPM);
  assert.equal(restorableView({ scrollX: -5 }, material).scrollX, 0);
  assert.equal(restorableView({ startBar: 999 }, material).startBar, 64);
  assert.equal(restorableView({ startBar: 0 }, material).startBar, 1);
});
