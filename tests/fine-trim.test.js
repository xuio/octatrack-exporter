// Sample-accurate slice edges: the zero-crossing search, the offsets it feeds,
// and the promise that moving an edge still copies audio rather than changing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestZeroCrossing, ZC_WINDOW, buildStemSlices, clampFine,
  boundariesFor, scaleFor, parseWav, encodeWav,
} from '../src/lib/index.js';

// ---------------------------------------------------------- zero crossings

const flat = (n, v) => Float32Array.from({ length: n }, () => v);

test('nearestZeroCrossing lands on an exact sign change', () => {
  const n = 2000;
  const ch = Float32Array.from({ length: n }, (_, i) => (i < 1000 ? 0.5 : -0.5));
  const at = nearestZeroCrossing(ch, ch, 1010);
  // the step is between 999 and 1000; both sides are equally far from zero, so
  // the earlier one wins — either way the cut sits on the change itself
  assert.ok(at === 999 || at === 1000, `expected the step, got ${at}`);
});

test('a sample that is exactly zero is a crossing', () => {
  const ch = Float32Array.from({ length: 100 }, (_, i) => (i === 40 ? 0 : (i < 40 ? 0.3 : -0.3)));
  assert.equal(nearestZeroCrossing(ch, ch, 45), 40);
});

test('of several crossings it picks the one nearest the asked-for sample', () => {
  const n = 4410;
  // 100 Hz at 44.1 kHz → a crossing every 220.5 samples
  const ch = Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 100 * i / 44100));
  const target = 2000;
  const at = nearestZeroCrossing(ch, ch, target);
  assert.ok(Math.abs(at - target) <= 111, `crossing ${at} is not the nearest to ${target}`);
  assert.ok(Math.abs((ch[at] + ch[at]) / 2) < 0.02, 'and it really is near zero');
  // asking further along finds a different, equally near crossing
  const later = nearestZeroCrossing(ch, ch, target + 600);
  assert.notEqual(later, at);
  assert.ok(Math.abs(later - (target + 600)) <= 111);
});

test('with no crossing in the window it falls back to the quietest sample', () => {
  const n = 1000;
  // wholly positive: never crosses, but dips to a minimum at 600
  const ch = Float32Array.from({ length: n }, (_, i) => 0.5 + 0.4 * Math.sign(Math.abs(i - 600) - 1) * 0.5);
  const dip = new Float32Array(ch);
  dip[600] = 0.01;
  const at = nearestZeroCrossing(dip, dip, 620, 100);
  assert.equal(at, 600);
});

test('the search stays inside the array at either edge', () => {
  const n = 50;
  const ch = flat(n, 0.4);
  assert.equal(nearestZeroCrossing(ch, ch, 0), 0, 'no crossing, no reading before the start');
  assert.equal(nearestZeroCrossing(ch, ch, 10_000), n - 1, 'a target past the end clamps in');
  assert.equal(nearestZeroCrossing(new Float32Array(0), new Float32Array(0), 5), 0);
});

test('only a crossing of the stereo sum counts', () => {
  const n = 400;
  // the channels cross in opposite directions and cancel — the sum never does
  const chL = Float32Array.from({ length: n }, (_, i) => (i < 200 ? 0.5 : -0.5));
  const chR = Float32Array.from({ length: n }, (_, i) => (i < 200 ? -0.5 : 0.5));
  // sum is 0 everywhere, so every sample qualifies and the nearest one wins
  assert.equal(nearestZeroCrossing(chL, chR, 137), 137);
  assert.equal(ZC_WINDOW, 441, '~10 ms at 44.1 kHz');
});

// ------------------------------------------------------------- slice model

const BPM = 120;                                     // 2 s = 88200 samples per bar
const regs = [
  { idx: 1, start: 0, end: 4, len: 4, scale: scaleFor(4) },
  { idx: 2, start: 4, end: 8, len: 4, scale: scaleFor(4) },
];
const bounds = boundariesFor(BPM, 8);
const peaks = Float32Array.from({ length: 8 }, () => 0.5);   // every bar is loud
const TH = 0.001;

test('an {a,b}-only edit behaves exactly as it did before fine trim existed', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 1, b: 2 } });
  const s = slices.find(x => x.region.idx === 1);
  assert.equal(s.start, bounds[1]);
  assert.equal(s.end, bounds[3]);
  assert.equal(s.frames, bounds[3] - bounds[1]);
  assert.equal(s.edited, true);
  assert.deepEqual([s.fine.sa, s.fine.sb], [0, 0]);
});

test('sa/sb move the edges by samples and keep the chain consistent', () => {
  const { slices, totalFrames } = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 1, b: 2, sa: 120, sb: -300 } });
  const s = slices.find(x => x.region.idx === 1);
  assert.equal(s.start, bounds[1] + 120);
  assert.equal(s.end, bounds[3] - 300);
  assert.equal(s.frames, s.end - s.start);
  assert.equal(s.outEnd - s.outStart, s.end - s.start, 'the chain reserves exactly what it copies');
  assert.equal(s.edited, true, 'a fine trim marks the clip edited');
  assert.equal(s.trig, 17, 'the trig step still comes from the bar, not the samples');
  // the neighbour follows it in the chain, shortened by the same amount
  const next = slices.find(x => x.region.idx === 2);
  assert.equal(next.outStart, s.outEnd);
  assert.equal(totalFrames, s.frames + next.frames);
});

test('a fine trim alone marks a clip edited without any bar trim', () => {
  const { slices } = buildStemSlices(peaks, regs, bounds, TH, { 1: { sa: 64 } });
  const s = slices.find(x => x.region.idx === 1);
  assert.equal(s.edited, true);
  assert.equal(s.start, bounds[0] + 64);
  assert.equal(s.end, bounds[4], 'the untouched edge stays on its bar');
});

test('edges are clamped to the clip’s own section and can never cross', () => {
  const huge = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 1, b: 1, sa: -10_000_000, sb: 10_000_000 } });
  const s = huge.slices.find(x => x.region.idx === 1);
  assert.equal(s.start, bounds[0], 'clamped to the first sample of its section');
  assert.equal(s.end, bounds[4], 'clamped to the last');
  assert.equal(s.fine.sa, bounds[0] - bounds[1], 'the reported offset is the one that applied');

  const crossed = buildStemSlices(peaks, regs, bounds, TH, { 1: { a: 1, b: 1, sa: 999_999, sb: -999_999 } });
  const c = crossed.slices.find(x => x.region.idx === 1);
  assert.ok(c.start < c.end, 'start stays before end');
  assert.equal(c.end, c.start + 1);
  assert.ok(c.start >= bounds[0] && c.end <= bounds[4], 'and both stay inside the section');
});

test('clampFine reports the offsets that actually apply', () => {
  const range = { barStart: 1000, barEnd: 2000, min: 900, max: 2100 };
  assert.deepEqual(clampFine(range, 50, -50), { sa: 50, sb: -50, start: 1050, end: 1950 });
  assert.deepEqual(clampFine(range, -500, 0), { sa: -100, sb: 0, start: 900, end: 2000 });
  assert.deepEqual(clampFine(range, 0, 500), { sa: 0, sb: 100, start: 1000, end: 2100 });
});

test('the automatic (unedited) path is untouched by all of this', () => {
  const quiet = Float32Array.from({ length: 8 }, (_, i) => (i >= 5 ? 0.5 : 0.0001));
  const { slices, ghosts } = buildStemSlices(quiet, regs, bounds, TH);
  assert.equal(ghosts.length, 1);
  const s = slices[0];
  assert.deepEqual([s.aM, s.bM], [5, 7]);
  assert.equal(s.start, bounds[5]);
  assert.equal(s.end, bounds[8]);
  assert.equal(s.edited, false);
});

// --------------------------------------------------------------- integrity

test('a fine-trimmed chain is still a pure copy of [start..end)', () => {
  // build an 8-bar stem whose every frame is identifiable
  const frames = 44100 * 16;
  const pcm = new Uint8Array(frames * 4), dv = new DataView(pcm.buffer);
  for (let i = 0; i < frames; i++) {
    dv.setInt16(i * 4, ((i * 7) % 30000) - 15000, true);
    dv.setInt16(i * 4 + 2, 15000 - ((i * 13) % 30000), true);
  }
  const wav = new Uint8Array(44 + pcm.length), wv = new DataView(wav.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) wav[o + i] = s.charCodeAt(i); };
  S(0, 'RIFF'); wv.setUint32(4, 36 + pcm.length, true); S(8, 'WAVEfmt '); wv.setUint32(16, 16, true);
  wv.setUint16(20, 1, true); wv.setUint16(22, 2, true); wv.setUint32(24, 44100, true);
  wv.setUint32(28, 44100 * 4, true); wv.setUint16(32, 4, true); wv.setUint16(34, 16, true);
  S(36, 'data'); wv.setUint32(40, pcm.length, true); wav.set(pcm, 44);
  const stem = parseWav(wav.buffer, 'x.wav');

  const edits = { 1: { a: 0, b: 1, sa: 733, sb: -1291 }, 2: { a: 4, b: 5, sa: -55, sb: 400 } };
  const { slices, totalFrames } = buildStemSlices(peaks, regs, bounds, TH, edits);
  assert.equal(slices.length, 2);
  assert.ok(slices.some(s => s.fine.sa !== 0), 'the fixture really is fine-trimmed');

  // exactly what src/export/stemFiles.js does
  const bpf = stem.bytesPerFrame;
  const chain = new Uint8Array(totalFrames * bpf);
  let at = 0;
  for (const s of slices) { chain.set(stem.pcm.subarray(s.start * bpf, s.end * bpf), at); at += s.frames * bpf; }
  const body = encodeWav(chain, stem.bits).subarray(44);

  let p = 0;
  for (const s of slices) {
    assert.equal(s.outStart, p / bpf, 'the .ot slice grid points at where the bytes landed');
    for (let i = s.start * bpf; i < s.end * bpf; i++, p++) {
      assert.equal(body[p], stem.pcm[i]);
    }
    assert.equal(s.outEnd, p / bpf);
  }
  assert.equal(p, body.length, 'and nothing else was written');
});
