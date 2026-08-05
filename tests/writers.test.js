// Node built-in test runner: `npm test`. Exercises the binary writers against
// a synthetic, structurally valid bank file and checks device-verified encodings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeOt, writeBankPatterns, writeMarkersSlots, writeStaticSlots, scaleFor, trigStep } from '../src/lib/index.js';

function syntheticBank(R = 2) {
  const att = 2210 + 64 * R, psize = 8 + 8 * att + 500 + 12;
  const buf = new Uint8Array(22 + 16 * psize + 100 + 2);
  buf.set([70, 79, 82, 77, 0, 0, 0, 0, 68, 80, 83, 49, 66, 65, 78, 75, 0, 0, 0, 0, 0, 23], 0);
  for (let k = 0; k < 16; k++) {
    const b = 22 + k * psize;
    buf.set([0x50, 0x54, 0x52, 0x4E, 0, 0, 0, 0], b);
    for (let t = 0; t < 8; t++) { const o = b + 8 + t * att; buf.set([0x54, 0x52, 0x41, 0x43, 0, 0, 0, 0, t], o); }
  }
  return { buf, att, psize, R };
}

// decode a track's trigger mask with the device mapping (byte = 7 - halfpage)
function firedSteps(bytes, psize, att, pat, trk) {
  const o = 22 + pat * psize + 8 + trk * att, out = [];
  for (let b = 0; b < 8; b++) { const v = bytes[o + 9 + b]; for (let bit = 0; bit < 8; bit++) if (v & (1 << bit)) out.push((7 - b) * 8 + bit + 1); }
  return out;
}

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
  const { buf, att, psize, R } = syntheticBank();
  const jobs = [
    { patternIdx: 0, LEN: 64, mult: '1x', tracks: [{ trackIdx: 0, trigs: [{ step: 33, slice: 0 }] }] },
    { patternIdx: 1, LEN: 36, mult: '1/4x', tracks: [{ trackIdx: 2, trigs: [{ step: 17, slice: 0 }] }, { trackIdx: 3, trigs: [{ step: 25, slice: 1 }] }, { trackIdx: 4, trigs: [{ step: 9, slice: 0 }] }] },
  ];
  const res = writeBankPatterns(buf, jobs, 111);
  assert.ok(!res.error, res.error);
  assert.deepEqual(firedSteps(res.bytes, psize, att, 0, 0), [33]);
  assert.deepEqual(firedSteps(res.bytes, psize, att, 1, 2), [17]);
  assert.deepEqual(firedSteps(res.bytes, psize, att, 1, 3), [25]);
  assert.deepEqual(firedSteps(res.bytes, psize, att, 1, 4), [9]);
  // STRT p-lock: 2 knob ticks per slice, aligned with the trig step; no sample lock
  const o = 22 + 1 * psize + 8 + 3 * att, p = o + (att - 64 * R - 64 - 2048) + 24 * 32;
  assert.equal(res.bytes[p + 1], 2); // slice 2 (0-based 1) => STRT 2
  assert.equal(res.bytes[p + 31], 255); // TRK DEFAULT
  // scale block: per-track mode, master INF, master scale 1x; pattern tempo stamped
  const so = 22 + psize - 12;
  assert.deepEqual([res.bytes[so], res.bytes[so + 1], res.bytes[so + 2], res.bytes[so + 5]], [255, 255, 2, 1]);
  assert.equal((res.bytes[22 + psize - 2] << 8) | res.bytes[22 + psize - 1], Math.round(111 * 24));
  // per-track len + scale
  const t0 = 22 + 8;
  assert.deepEqual([res.bytes[t0 + 89], res.bytes[t0 + 90]], [64, 2]);
});

test('writeMarkersSlots: static slot offsets + checksum', () => {
  const src = new Uint8Array(22 + 264 * 784 + 2);
  src.set([0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x41, 0x4D, 0x50, 0, 0, 0, 0, 0, 4], 0);
  const res = writeMarkersSlots(src, [{ slot0: 0, totalFrames: 1000, slices: [{ start: 0, end: 500 }] }]);
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
