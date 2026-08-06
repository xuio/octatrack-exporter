// The readback verifier exists to catch writer bugs without a device, so these
// tests check both halves of that claim: that a correct export verifies clean,
// and that each kind of corruption the writers have historically produced is
// actually caught rather than quietly passing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeOt, writeBankPatterns, writeMarkersSlots,
  readOt, readBankPattern, readMarkersSlot, verifyExport, bankChecksumOk, markersChecksumOk,
} from '../src/lib/index.js';
import { bankGeometry, makeBank, makeMarkers } from './fixtures.js';

const GEOM = bankGeometry();

const SLICES = [
  { start: 0, end: 176400 },
  { start: 176400, end: 352800 },
  { start: 352800, end: 705600 },
];

const JOBS = [{
  patternIdx: 0,
  LEN: 32,
  mult: '1/2x',
  tracks: [
    { trackIdx: 0, trigs: [{ step: 1, slice: 0 }, { step: 17, slice: 2 }] },
    { trackIdx: 3, trigs: [{ step: 9, slice: 1 }, { step: 33, slice: 4 }, { step: 57, slice: 63 }] },
  ],
}];

/** A complete, correct export — the baseline every corruption test starts from. */
function build() {
  const bank = writeBankPatterns(makeBank(), JOBS, 124);
  const markers = writeMarkersSlots(makeMarkers(), [{ slot0: 0, totalFrames: 705600, slices: SLICES }]);
  const bytesPerFrame = 6;
  return {
    entries: [
      { name: 'SONG/AA_DRUMS.wav', data: new Uint8Array(44 + 705600 * bytesPerFrame) },
      { name: 'SONG/AA_DRUMS.ot', data: writeOt(124, 705600, SLICES) },
      { name: 'SONG/markers.work', data: markers.bytes },
      { name: 'SONG/bank02.work', data: bank.bytes },
    ],
    folder: 'SONG',
    bpm: 124,
    banks: { 2: JOBS },
    stems: [{
      slot0: 0, wav: 'AA_DRUMS.wav', ot: 'AA_DRUMS.ot',
      totalFrames: 705600, bytesPerFrame, slices: SLICES,
    }],
  };
}

const dataOf = (input, name) => input.entries.find(e => e.name === name).data;

test('a correct export reads back as exactly what was asked for', () => {
  const result = verifyExport(build());
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.counts.patterns, 1);
  assert.equal(result.counts.trigs, 5);
  assert.equal(result.counts.slices, 3);
  assert.equal(result.counts.slots, 1);
});

test('the bank reader decodes trigs back to the steps and slices they were written from', () => {
  const bank = writeBankPatterns(makeBank(), JOBS, 124);
  const read = readBankPattern(bank.bytes, 0);

  assert.equal(read.masterLen, 255, 'master length INF');
  assert.equal(read.masterLenMult, 255);
  assert.equal(read.masterScale, 2, 'master scale 1x');
  assert.ok(Math.abs(read.tempo - 124) < 0.05);

  for (const track of read.tracks) {
    assert.equal(track.LEN, 32);
    assert.equal(track.mult, '1/2x', `track ${track.trackIdx + 1} tempo multiplier`);
  }
  assert.deepEqual(
    read.tracks[0].trigs.map(t => [t.step, t.slice]),
    [[1, 0], [17, 2]],
  );
  assert.deepEqual(
    read.tracks[3].trigs.map(t => [t.step, t.slice]),
    [[9, 1], [33, 4], [57, 63]],
  );
  assert.ok(read.tracks[3].trigs.every(t => t.trkDefault), 'every trig plays TRK DEFAULT');
  assert.deepEqual(read.tracks[1].trigs, [], 'a track with no job gets no trigs');
});

test('the .ot and markers readers agree with what the writers put there', () => {
  const ot = readOt(writeOt(124, 705600, SLICES));
  assert.equal(ot.checksumOk, true);
  assert.equal(ot.gain, 48, 'unity gain, not the recorder default');
  assert.equal(ot.stretch, 0);
  assert.equal(ot.trimEnd, 705600);
  assert.equal(ot.sliceCount, 3);
  assert.deepEqual(ot.slices.map(s => [s.start, s.end]), SLICES.map(s => [s.start, s.end]));

  const written = writeMarkersSlots(makeMarkers(), [{ slot0: 5, totalFrames: 705600, slices: SLICES }]);
  assert.equal(markersChecksumOk(written.bytes), true);
  const slot = readMarkersSlot(written.bytes, 5);
  assert.equal(slot.trimEnd, 705600);
  assert.equal(slot.sliceCount, 3);
  assert.deepEqual(slot.slices.map(s => [s.start, s.end]), SLICES.map(s => [s.start, s.end]));
});

// Each case below is a bug this project has actually shipped, or the byte-level
// shape of one. The point of the verifier is that none of them get through.
test('the exact corruptions that reached the device are all caught', () => {
  const cases = [
    ['slice numbers stored at the wrong scale', input => {
      // the shipped bug: the STRT knob written as the slice index, not index × 2.
      // Track 4 step 33 plays slice 4, so its knob must read 8.
      const bank = dataOf(input, 'SONG/bank02.work');
      bank[GEOM.plockAt(0, 3, 33) + 1] = 4;
    }, /trigs read/],

    ['a trig mask bit written to the un-reversed half-page', input => {
      // Track 1 step 1 lives in half-page 0, which the device stores in byte 7.
      // Writing it to byte 0 instead is exactly the mapping that fired the wrong bars.
      const bank = dataOf(input, 'SONG/bank02.work');
      const mask = GEOM.maskAt(0, 0);
      bank[mask + 7] &= ~1;
      bank[mask] |= 1;
    }, /trigs read/],

    ['a sample lock left on a trig', input => {
      dataOf(input, 'SONG/bank02.work')[GEOM.plockAt(0, 0, 1) + 31] = 3;
    }, /sample lock/],

    ['the +12 dB recorder gain default in the .ot', input => {
      new DataView(dataOf(input, 'SONG/AA_DRUMS.ot').buffer).setUint16(43, 72);
    }, /gain reads 72/],

    ['a slice boundary off by one sample', input => {
      new DataView(dataOf(input, 'SONG/AA_DRUMS.ot').buffer).setUint32(58 + 4, 176399);
    }, /slice 1 reads/],

    ['master length left at something other than INF', input => {
      dataOf(input, 'SONG/bank02.work')[GEOM.scaleAt(0) + 1] = 16;
    }, /master length is not INF/],

    ['a per-track tempo multiplier that does not match the section', input => {
      dataOf(input, 'SONG/bank02.work')[GEOM.trackAt(0, 0) + 90] = 2;   // 1x, not the 1/2x asked for
    }, /scale reads/],

    ['a WAV that does not match its declared frame count', input => {
      const entry = input.entries.find(e => e.name === 'SONG/AA_DRUMS.wav');
      entry.data = new Uint8Array(entry.data.length - 6);
    }, /does not match/],

    ['a markers grid that disagrees with the .ot', input => {
      new DataView(dataOf(input, 'SONG/markers.work').buffer).setUint32(22 + 136 * 784 + 780, 2);
    }, /markers.work slot 1/],
  ];

  for (const [name, corrupt, expected] of cases) {
    const input = build();
    corrupt(input);
    const result = verifyExport(input);
    assert.equal(result.ok, false, `${name} must not verify clean`);
    assert.match(result.problems.join(' | '), expected, name);
  }
});

test('a bank whose checksum was not updated is reported', () => {
  const input = build();
  const bank = dataOf(input, 'SONG/bank02.work');
  bank[bank.length - 1] ^= 0xFF;
  assert.equal(bankChecksumOk(bank), false);
  assert.match(verifyExport(input).problems.join(' | '), /checksum/);
});

test('the readers reject files that are not the size they claim to be', () => {
  assert.match(readOt(new Uint8Array(800)).error, /expected 832/);
  assert.match(readMarkersSlot(new Uint8Array(100), 0).error, /expected/);
  assert.match(readMarkersSlot(makeMarkers(), 200).error, /out of range/);
  assert.ok(readBankPattern(new Uint8Array(4096), 0).error);
});
