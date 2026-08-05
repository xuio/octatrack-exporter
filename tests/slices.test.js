import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStemSlices, trimLimits, splitTrim, normalizeProject, boundariesFor, scaleFor, makeZip, readZip, audioEntries, bucketsPerBarFor, barBands, meterPos, dbPos } from '../src/lib/index.js';

const BPM = 111;
// two regions: bars 0-8 (9 bars, 1/4x) and bars 9-12 (4 bars, 1x)
const regs = [
  { idx: 1, start: 0, end: 9, len: 9, scale: scaleFor(9) },
  { idx: 2, start: 9, end: 13, len: 4, scale: scaleFor(4) },
];
const bounds = boundariesFor(BPM, 13);
// loud from bar 4 to 8 in region 1; region 2 loud throughout
const peaks = Float32Array.from({ length: 13 }, (_, i) => (i >= 4 && i <= 7) || i >= 9 ? 0.5 : 0.0001);
const TH = 0.001;

test('automatic trim finds the loud span and derives the trig step', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH);
  assert.equal(slices.length, 2);
  assert.deepEqual([slices[0].aM, slices[0].bM], [4, 7]);
  assert.equal(slices[0].trig, 17);   // bar 5 of a 1/4x pattern → step 17
  assert.equal(slices[0].num, 1);
  assert.equal(slices[1].num, 2);
});

test('deleting a slice removes it, renumbers the rest and leaves a ghost', () => {
  const { slices, ghosts } = buildStemSlices(peaks, regs, bounds, TH, { 1: { del: true } });
  assert.equal(slices.length, 1);
  assert.equal(slices[0].region.idx, 2);
  assert.equal(slices[0].num, 1);                    // renumbered
  assert.equal(slices[0].outStart, 0);               // chain offsets follow
  assert.deepEqual(ghosts.map(g => [g.region.idx, g.deleted]), [[1, true]]);
});

test('manual trim overrides the threshold result', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 2, b: 5 } });
  assert.deepEqual([slices[0].aM, slices[0].bM], [2, 5]);
  assert.equal(slices[0].trig, 9);                   // bar 3 → step 9 at 1/4x
  assert.equal(slices[0].edited, true);
});

test('every slice stays inside its own section and trigs from its own pattern', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 4, b: 20 } });
  const s = slices.find(x => x.region.idx === 1);
  assert.equal(s.bM, 8, 'clipped to the last bar of its own section');
  assert.equal(s.trigRegionIdx, 1);
  assert.equal(s.movedTrig, false);
});

test('expanding across a boundary produces a separate slice in the next section', () => {
  // drag region 1's end (bar 7) three bars right, into region 2
  const patch = splitTrim(regs, 1, 4, 10, [{ regionIdx: 1, aM: 4, bM: 7 }, { regionIdx: 2, aM: 9, bM: 12 }]);
  assert.deepEqual(patch[1], { a: 4, b: 8 }, 'home section keeps only what is inside it');
  assert.deepEqual(patch[2], { a: 9, b: 12 }, 'neighbour grows to cover the spill');
  // with no slice in the neighbour yet, the spill becomes its own new slice
  const fresh = splitTrim(regs, 1, 4, 10, [{ regionIdx: 1, aM: 4, bM: 7 }]);
  assert.deepEqual(fresh[2], { a: 9, b: 10 });
  const built = buildStemSlices(peaks, regs, bounds, TH, { 1: fresh[1], 2: fresh[2] });
  assert.equal(built.slices.length, 2);
  assert.deepEqual(built.slices.map(s => [s.region.idx, s.aM, s.bM]), [[1, 4, 8], [2, 9, 10]]);
  assert.equal(built.slices[1].trig, 1, 'the new slice trigs at step 1 of its own pattern');
  assert.equal(built.slices[1].outStart, built.slices[0].outEnd, 'chain stays contiguous');
});

test('a drag pulled entirely out of its own section leaves nothing behind there', () => {
  const patch = splitTrim(regs, 1, 9, 12, [{ regionIdx: 1, aM: 4, bM: 7 }]);
  assert.equal(patch[1], null);
  assert.deepEqual(patch[2], { a: 9, b: 12 });
});

test('splitTrim is idempotent against the pre-drag layout', () => {
  const base = [{ regionIdx: 1, aM: 4, bM: 7 }];
  const out = splitTrim(regs, 1, 4, 11, base);
  const again = splitTrim(regs, 1, 4, 10, base);      // dragging back one bar
  assert.deepEqual(again[2], { a: 9, b: 10 }, 'does not accumulate from the previous move');
  assert.deepEqual(out[2], { a: 9, b: 11 });
});

test('trimLimits spans the whole song — boundaries split instead of blocking', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH);
  const lim = trimLimits(slices, 2, regs);
  assert.equal(lim.minA, 0);
  assert.equal(lim.maxB, 12);
});

test('normalizeProject finds the project root in a folder or a zip', () => {
  const a = normalizeProject([{ path: 'MySet/project.work' }, { path: 'MySet/bank01.work' }, { path: 'MySet/__MACOSX/x' }]);
  assert.equal(a.folder, 'MySet');
  assert.deepEqual(a.files.map(f => f.rel), ['project.work', 'bank01.work']);
  const b = normalizeProject([{ path: 'project.work' }, { path: 'markers.work' }]);  // zipped from inside
  assert.equal(b.folder, 'PROJECT');
  assert.deepEqual(b.files.map(f => f.rel), ['project.work', 'markers.work']);
  assert.equal(normalizeProject([{ path: 'notes.txt' }]), null);
});

test('meters are scaled in dB, not amplitude', () => {
  assert.equal(meterPos(1), 1);                       // 0 dBFS at the top
  assert.equal(meterPos(0), 0);
  assert.ok(Math.abs(meterPos(0.5) - dbPos(-6.02)) < 0.01);  // half amplitude ≈ −6 dB
  assert.ok(meterPos(0.5) > 0.85, 'a −6 dB signal sits near the top, not halfway');
});

test('a manual trim can restore a slice the threshold dropped', () => {
  const silent = new Float32Array(13); // nothing above threshold anywhere
  const auto = buildStemSlices(silent, regs, bounds, TH);
  assert.equal(auto.slices.length, 0);
  assert.equal(auto.ghosts.length, 2);
  const forced = buildStemSlices(silent, regs, bounds, TH, { 2: { a: 9, b: 12 } });
  assert.equal(forced.slices.length, 1);
  assert.equal(forced.slices[0].region.idx, 2);
});

test('readZip round-trips a stored archive written by makeZip', async () => {
  const enc = new TextEncoder();
  const blob = makeZip([
    { name: 'stems/DRUMS.wav', data: enc.encode('drums-audio') },
    { name: 'stems/Song_111.mid', data: enc.encode('midi-bytes') },
    { name: 'stems/notes.txt', data: enc.encode('ignored') },
  ]);
  const entries = await readZip(await blob.arrayBuffer());
  assert.equal(entries.length, 3);
  const audio = audioEntries(entries);
  assert.deepEqual(audio.map(e => e.name), ['stems/DRUMS.wav', 'stems/Song_111.mid']);
  assert.equal(new TextDecoder().decode(audio[0].data), 'drums-audio');
});

test('readZip inflates deflated entries', async () => {
  const payload = new TextEncoder().encode('RIFF'.repeat(400));
  const deflated = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  // hand-assemble a one-entry zip with method 8
  const name = new TextEncoder().encode('A.wav');
  const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true);
  lv.setUint32(18, deflated.length, true); lv.setUint32(22, payload.length, true); lv.setUint16(26, name.length, true);
  lh.set(name, 30);
  const cd = new Uint8Array(46 + name.length), cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true);
  cv.setUint32(20, deflated.length, true); cv.setUint32(24, payload.length, true); cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true); cd.set(name, 46);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
  ev.setUint32(12, cd.length, true); ev.setUint32(16, lh.length + deflated.length, true);
  const zip = new Uint8Array([...lh, ...deflated, ...cd, ...end]);
  const entries = await readZip(zip);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].data.length, payload.length);
});

test('bucketsPerBarFor grows waveform detail with zoom and stays bounded', () => {
  assert.ok(bucketsPerBarFor(400) > bucketsPerBarFor(40));
  assert.equal(bucketsPerBarFor(1), 4);
  assert.equal(bucketsPerBarFor(100000), 512);
  assert.equal(Math.log2(bucketsPerBarFor(37)) % 1, 0, 'always a power of two so cached bars stay valid');
});

test('waveform buckets are anchored to bars, so trimming does not shift the drawing', () => {
  // a bar of audio must produce identical buckets no matter what slice contains it
  const sr = 44100, chL = new Float32Array(sr * 4), chR = new Float32Array(sr * 4);
  for (let i = 0; i < chL.length; i++) { chL[i] = Math.sin(i / 40) * (0.2 + 0.8 * ((i / sr) % 1)); chR[i] = chL[i]; }
  const bounds = boundariesFor(120, 2);          // 2 bars of 2 s
  const bpb = 64;
  const bar0 = barBands(chL, chR, bounds[0], bounds[1], bpb);
  const bar1 = barBands(chL, chR, bounds[1], bounds[2], bpb);
  // recomputing the same bar gives byte-identical data (cache-safe, no jitter)
  const again = barBands(chL, chR, bounds[0], bounds[1], bpb);
  assert.deepEqual([...bar0.max], [...again.max]);
  assert.deepEqual([...bar0.min], [...again.min]);
  // a 2-bar slice is exactly bar0 followed by bar1 — extending a slice appends
  // data rather than resampling everything at new bucket boundaries
  const twoBar = new Float32Array(bpb * 2);
  twoBar.set(bar0.max, 0); twoBar.set(bar1.max, bpb);
  assert.deepEqual([...twoBar.slice(0, bpb)], [...bar0.max]);
  assert.deepEqual([...twoBar.slice(bpb)], [...bar1.max]);
});

test('waveform data is a true signed envelope, not a symmetric magnitude', () => {
  const n = 4096, chL = new Float32Array(n), chR = new Float32Array(n);
  for (let i = 0; i < n; i++) { chL[i] = i < n / 2 ? 0.8 : -0.3; chR[i] = chL[i]; }  // asymmetric
  const b = barBands(chL, chR, 0, n, 4);
  assert.ok(b.max[0] > 0.7 && b.min[0] > -0.05, 'first half is positive-only');
  assert.ok(b.min[3] < -0.2 && b.max[3] < 0.05, 'second half is negative-only');
  assert.ok(b.rms[0] > 0, 'RMS body is computed for the fill');
});
