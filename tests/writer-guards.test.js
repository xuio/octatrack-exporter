// The writers refuse to touch a file whose structure does not match what they
// were verified against. Those refusals are the only thing between a wrong
// assumption and a corrupted bank on someone's CF card, so they are tested as
// carefully as the happy path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeBankPatterns, writeMarkersSlots, writeStaticSlots, parseProjectText } from '../src/lib/index.js';
import { SCALE_SENTINEL, bankGeometry } from './fixtures.js';

const BANK_HEADER = [70, 79, 82, 77, 0, 0, 0, 0, 68, 80, 83, 49, 66, 65, 78, 75, 0, 0, 0, 0, 0, 23];
const MARKERS_HEADER = [0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x41, 0x4D, 0x50, 0, 0, 0, 0, 0, 4];

function bank({ version = 23, patterns = 16, badTrack = null, allTracksWrong = false, spacing = true, R = 2 } = {}) {
  const att = 2210 + 64 * R, psize = 8 + 8 * att + 500 + 12;
  const buf = new Uint8Array(22 + 16 * psize + 100 + 2);
  buf.set(BANK_HEADER, 0);
  buf[21] = version;
  for (let k = 0; k < patterns; k++) {
    const at = 22 + k * psize + (spacing || k === 0 ? 0 : 4);   // nudge later patterns off-grid
    buf.set([0x50, 0x54, 0x52, 0x4E, 0, 0, 0, 0], at);
    for (let t = 0; t < 8; t++) {
      const o = at + 8 + t * att;
      const id = allTracksWrong ? 9 : (t === badTrack ? 9 : t);
      buf.set([0x54, 0x52, 0x41, 0x43, 0, 0, 0, 0, id], o);
      buf.set(SCALE_SENTINEL, o + 89);   // stands in for the user's own per-track scale
    }
  }
  return buf;
}

const JOB = [{ patternIdx: 0, LEN: 64, mult: '1x', tracks: [{ trackIdx: 0, trigs: [{ step: 1, slice: 0 }] }] }];
const SCALE_TRACKS = [0, 1, 2, 3, 4];

test('the bank writer refuses anything it was not verified against', () => {
  assert.match(writeBankPatterns(new Uint8Array(5000), JOB, 120).error, /header mismatch/);
  assert.match(writeBankPatterns(bank({ version: 22 }), JOB, 120).error, /data version 22/);
  assert.match(writeBankPatterns(bank({ patterns: 4 }), JOB, 120).error, /pattern sections not found/);
  assert.match(writeBankPatterns(bank({ spacing: false }), JOB, 120).error, /spacing inconsistent/);
  // no TRAC carries id 1, so the section size cannot be derived at all
  assert.match(writeBankPatterns(bank({ allTracksWrong: true }), JOB, 120).error, /size not derivable/);
  // the size derives, but a later track section is not where it should be
  assert.match(writeBankPatterns(bank({ badTrack: 5 }), JOB, 120).error, /audio track section layout mismatch \(track 6\)/);
});

test('a bank that verifies is written, and only the pattern region changes', () => {
  const source = bank();
  const before = source.slice();
  const result = writeBankPatterns(source.slice(), JOB, 120, SCALE_TRACKS);
  assert.ok(!result.error, result.error);
  assert.equal(result.patternsWritten, 1);
  assert.equal(result.trigsWritten, 1);
  // parts live after every pattern; that region must come through untouched
  for (let i = result.partsStart; i < before.length - 2; i++) {
    assert.equal(result.bytes[i], before[i], `parts byte ${i} changed`);
  }
});

test('the scale of a track OSSC did not fill survives a write byte-for-byte', () => {
  // The user keeps track 7 at their own remix length and track 8 is the master
  // track. Neither is named as a scale track, so both must read back exactly as
  // they came in — everywhere in the file, not just in the programmed pattern.
  const { trackAt } = bankGeometry();
  const before = bank();
  const result = writeBankPatterns(before.slice(), JOB, 120, SCALE_TRACKS);
  assert.ok(!result.error, result.error);

  for (let idx = 0; idx < 16; idx++) {
    for (let t = 5; t < 8; t++) {
      const o = trackAt(idx, t);
      assert.deepEqual(
        [result.bytes[o + 89], result.bytes[o + 90]], [before[o + 89], before[o + 90]],
        `P${idx + 1} T${t + 1} scale changed`,
      );
    }
  }
  // the stem track it *was* told to write did change, so the test can fail
  assert.deepEqual([result.bytes[trackAt(0, 0) + 89], result.bytes[trackAt(0, 0) + 90]], [64, 2]);
});

test('an out-of-range job is skipped instead of writing a bad pattern', () => {
  const tooLong = [{ patternIdx: 0, LEN: 128, mult: '1x', tracks: [] }];
  const unknownScale = [{ patternIdx: 0, LEN: 16, mult: '3/4x', tracks: [] }];
  assert.equal(writeBankPatterns(bank(), tooLong, 120).patternsWritten, 0);
  assert.equal(writeBankPatterns(bank(), unknownScale, 120).patternsWritten, 0);
});

test('the markers writer checks header, version and exact file size', () => {
  const good = new Uint8Array(22 + 264 * 784 + 2);
  good.set(MARKERS_HEADER, 0);
  const entry = [{ slot0: 0, totalFrames: 100, slices: [{ start: 0, end: 50 }] }];

  assert.match(writeMarkersSlots(new Uint8Array(200), entry).error, /header mismatch/);
  const wrongVersion = good.slice(); wrongVersion[21] = 3;
  assert.match(writeMarkersSlots(wrongVersion, entry).error, /data version 3/);
  const wrongSize = new Uint8Array(1000); wrongSize.set(MARKERS_HEADER, 0);
  assert.match(writeMarkersSlots(wrongSize, entry).error, /unexpected markers file size/);

  assert.ok(!writeMarkersSlots(good.slice(), entry).error);
});

test('markers slots outside the static range are ignored', () => {
  const good = new Uint8Array(22 + 264 * 784 + 2);
  good.set(MARKERS_HEADER, 0);
  const result = writeMarkersSlots(good.slice(), [
    { slot0: -1, totalFrames: 1, slices: [] },
    { slot0: 999, totalFrames: 1, slices: [] },
  ]);
  assert.ok(!result.error);
  assert.deepEqual([...result.bytes.subarray(22, 40)], [...good.subarray(22, 40)], 'nothing was written');
});

test('project.work is left alone when its layout is unrecognized', () => {
  const result = writeStaticSlots('nothing familiar here', [{ slot: 1, path: 'a.wav', bpm: 120 }], 120);
  assert.match(result.error, /unrecognized project.work layout/);
});

test('parseProjectText reads the metadata the project step reports', () => {
  const text = '[META]\r\nTYPE=OCTATRACK DPS-1 PROJECT\r\nVERSION=19\r\nOS_VERSION=R0177     1.40B\r\n[/META]\r\n\r\n'
    + '[SAMPLE]\r\nTYPE=STATIC\r\nSLOT=1\r\nPATH=a.wav\r\n[/SAMPLE]\r\n'
    + '[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=129\r\nPATH=\r\n[/SAMPLE]\r\n';
  const info = parseProjectText(text);
  assert.equal(info.osVersion, '1.40B');
  assert.equal(info.projType, 'OCTATRACK DPS-1 PROJECT');
  assert.equal(info.slots.length, 2);
  assert.equal(info.slots[0].PATH, 'a.wav');
  assert.deepEqual(parseProjectText('').slots, []);
});
