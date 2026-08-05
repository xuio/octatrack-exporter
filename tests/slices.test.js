import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStemSlices, boundariesFor, scaleFor, makeZip, readZip, audioEntries, bucketTier } from '../src/lib/index.js';

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

test('manual trim overrides the threshold result and is clamped to the region', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 2, b: 5 } });
  assert.deepEqual([slices[0].aM, slices[0].bM], [2, 5]);
  assert.equal(slices[0].trig, 9);                   // bar 3 → step 9 at 1/4x
  assert.equal(slices[0].edited, true);
  const over = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: -5, b: 99 } });
  assert.deepEqual([over.slices[0].aM, over.slices[0].bM], [0, 8]); // clamped inside region 1
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

test('bucketTier grows waveform detail with zoom and stays bounded', () => {
  assert.equal(bucketTier(10), 64);
  assert.ok(bucketTier(500) > bucketTier(120));
  assert.equal(bucketTier(100000), 2048);
});
