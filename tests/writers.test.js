// Node built-in test runner: `npm test`. Exercises the binary writers against
// a synthetic, structurally valid bank file and checks device-verified encodings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeOt, writeBankPatterns, writeMarkersSlots, writeStaticSlots, scaleFor, trigStep } from '../src/lib/index.js';
import { bankGeometry, makeBank, makeMarkers, firedSteps, SCALE_SENTINEL } from './fixtures.js';

test('writeOt: size, tempo, checksum coverage', () => {
  const ot = writeOt(111, 441000, [{ start: 0, end: 100 }]);
  assert.equal(ot.length, 832);
  const dv = new DataView(ot.buffer);
  assert.equal(dv.getUint32(23), Math.round(111 * 24));
  assert.equal(dv.getUint32(826), 1); // slice count
});

test('scaleFor: trig keys per bar follow the tempo multiplier rule', () => {
  assert.deepEqual([scaleFor(4).steps, scaleFor(8).steps, scaleFor(16).steps, scaleFor(32).steps], [16, 8, 4, 2]);
  assert.equal(trigStep(4, 4), 17); // bar 5 of a 1/4x region
});

test('writeBankPatterns: trig mask bytes land on the device steps', () => {
  const geom = bankGeometry();
  const jobs = [
    { patternIdx: 0, LEN: 64, mult: '1x', tracks: [{ trackIdx: 0, trigs: [{ step: 33, slice: 0 }] }] },
    { patternIdx: 1, LEN: 36, mult: '1/4x', tracks: [{ trackIdx: 2, trigs: [{ step: 17, slice: 0 }] }, { trackIdx: 3, trigs: [{ step: 25, slice: 1 }] }, { trackIdx: 4, trigs: [{ step: 9, slice: 0 }] }] },
  ];
  const res = writeBankPatterns(makeBank(), jobs, 111, [0, 1, 2, 3, 4]);
  assert.ok(!res.error, res.error);
  assert.deepEqual(firedSteps(res.bytes, geom, 0, 0), [33]);
  assert.deepEqual(firedSteps(res.bytes, geom, 1, 2), [17]);
  assert.deepEqual(firedSteps(res.bytes, geom, 1, 3), [25]);
  assert.deepEqual(firedSteps(res.bytes, geom, 1, 4), [9]);
  // STRT p-lock: 2 knob ticks per slice, aligned with the trig step; no sample lock
  const p = geom.plockAt(1, 3, 25);
  assert.equal(res.bytes[p + 1], 2); // slice 2 (0-based 1) => STRT 2
  assert.equal(res.bytes[p + 31], 255); // TRK DEFAULT
  // scale block: per-track mode, master INF, master scale 1x; pattern tempo stamped
  const so = geom.scaleAt(0);
  assert.deepEqual([res.bytes[so], res.bytes[so + 1], res.bytes[so + 2], res.bytes[so + 5]], [255, 255, 2, 1]);
  assert.equal((res.bytes[geom.tempoAt(0)] << 8) | res.bytes[geom.tempoAt(0) + 1], Math.round(111 * 24));
  // per-track len + scale
  const t0 = geom.trackAt(0, 0);
  assert.deepEqual([res.bytes[t0 + 89], res.bytes[t0 + 90]], [64, 2]);
});

test('writeBankPatterns: only the named tracks have their scale touched', () => {
  const geom = bankGeometry();
  const source = makeBank();
  const jobs = [
    // pattern 0 trigs stem tracks 0 and 4; pattern 1 is programmed but silent on
    // most of them — either way, all five stem tracks must get the section scale.
    { patternIdx: 0, LEN: 64, mult: '1x', tracks: [{ trackIdx: 0, trigs: [{ step: 1, slice: 0 }] }, { trackIdx: 4, trigs: [{ step: 9, slice: 1 }] }] },
    { patternIdx: 1, LEN: 32, mult: '1/2x', tracks: [] },
  ];
  const res = writeBankPatterns(source.slice(), jobs, 111, [0, 1, 2, 3, 4]);
  assert.ok(!res.error, res.error);

  for (const [patternIdx, LEN, multCode] of [[0, 64, 2], [1, 32, 4]]) {
    for (let t = 0; t <= 4; t++) {
      const o = geom.trackAt(patternIdx, t);
      assert.deepEqual([res.bytes[o + 89], res.bytes[o + 90]], [LEN, multCode], `P${patternIdx + 1} T${t + 1} scale`);
    }
    // tracks 6, 7 and the master track 8: the user's own bytes, to the byte
    for (let t = 5; t < 8; t++) {
      const o = geom.trackAt(patternIdx, t);
      assert.deepEqual([res.bytes[o + 89], res.bytes[o + 90]], SCALE_SENTINEL, `P${patternIdx + 1} T${t + 1} scale must be untouched`);
    }
  }
  // and the patterns this build never programmed keep every track's scale
  for (let patternIdx = 2; patternIdx < 16; patternIdx++) {
    for (let t = 0; t < 8; t++) {
      const o = geom.trackAt(patternIdx, t);
      assert.deepEqual([res.bytes[o + 89], res.bytes[o + 90]], SCALE_SENTINEL, `P${patternIdx + 1} T${t + 1} scale must be untouched`);
    }
  }
});

test('writeBankPatterns: with no scale tracks named, no scale byte moves at all', () => {
  const source = makeBank();
  const jobs = [{ patternIdx: 0, LEN: 64, mult: '1x', tracks: [{ trackIdx: 0, trigs: [{ step: 1, slice: 0 }] }] }];
  const res = writeBankPatterns(source.slice(), jobs, 111);
  assert.ok(!res.error, res.error);
  const geom = bankGeometry();
  for (let t = 0; t < 8; t++) {
    const o = geom.trackAt(0, t);
    assert.deepEqual([res.bytes[o + 89], res.bytes[o + 90]], SCALE_SENTINEL, `T${t + 1} scale`);
  }
  assert.equal(res.trigsWritten, 1, 'trigs are still written');
});

test('writeMarkersSlots: static slot offsets + checksum', () => {
  const res = writeMarkersSlots(makeMarkers(), [{ slot0: 0, totalFrames: 1000, slices: [{ start: 0, end: 500 }] }]);
  assert.ok(!res.error, res.error);
  const dv = new DataView(res.bytes.buffer);
  const off = 22 + 136 * 784;
  assert.equal(dv.getUint32(off + 4), 1000);
  assert.equal(dv.getUint32(off + 12 + 8), 0xFFFFFFFF); // slice loop off
  assert.equal(dv.getUint32(off + 780), 1);
});

test('writeStaticSlots: project tempo + slot blocks + plain project-local paths', () => {
  const text = '[META]\r\nTYPE=OCTATRACK DPS-1 PROJECT\r\n[/META]\r\n\r\n[SETTINGS]\r\nTEMPOx24=2880\r\n[/SETTINGS]\r\n\r\n############################\r\n\r\n';
  const res = writeStaticSlots(text, [{ slot: 1, path: '1 DRUMS Shake.wav', bpm: 111 }], 111);
  assert.ok(!res.error, res.error);
  assert.ok(res.tempoSet);
  assert.match(res.text, /TEMPOx24=2664/);
  assert.match(res.text, /PATH=1 DRUMS Shake\.wav/);
  assert.match(res.text, /TSMODE=0/);
});
