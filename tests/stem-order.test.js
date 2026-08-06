// Stems arrive in whatever order the drop, the file picker or the zip hands
// them over, but their leading number is the Octatrack track they belong to —
// so the batch is sorted by it on the way in, and the number then comes off the
// display name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackNumber, stripTrackNumber, sortByTrackNumber } from '../src/lib/index.js';
import { stemName } from '../src/state/useStems.js';

const order = (names) => sortByTrackNumber(names, n => n);

// ------------------------------------------------------------------ numbers

test('reads the leading track number, whatever the separator', () => {
  assert.equal(trackNumber('1 DRUMS.wav'), 1);
  assert.equal(trackNumber('02_BASS.wav'), 2);
  assert.equal(trackNumber('3-RHY.wav'), 3);
  assert.equal(trackNumber('4.PAD.wav'), 4);
  assert.equal(trackNumber('  5 VOX.wav'), 5);
});

test('a name without a leading number has none', () => {
  assert.equal(trackNumber('DRUMS.wav'), null);
  assert.equal(trackNumber('DRUMS 2.wav'), null);      // trailing, not leading
  assert.equal(trackNumber('1234 THING.wav'), null);   // more than three digits
  assert.equal(trackNumber('1DRUMS.wav'), null);       // no separator
});

// ------------------------------------------------------------------ sorting

test('the batch follows the track number, not the drop order', () => {
  assert.deepEqual(
    order(['3 RHY.wav', '5 VOX.wav', '1 DRUMS.wav', '4 PAD.wav', '2 BASS.wav']),
    ['1 DRUMS.wav', '2 BASS.wav', '3 RHY.wav', '4 PAD.wav', '5 VOX.wav'],
  );
});

test('numbers sort numerically, not as text', () => {
  assert.deepEqual(
    order(['10 TEN.wav', '2 TWO.wav', '1 ONE.wav']),
    ['1 ONE.wav', '2 TWO.wav', '10 TEN.wav'],
  );
});

test('unnumbered files follow the numbered ones, in the order they came', () => {
  assert.deepEqual(
    order(['PAD.wav', '2 BASS.wav', 'VOX.wav', '1 DRUMS.wav']),
    ['1 DRUMS.wav', '2 BASS.wav', 'PAD.wav', 'VOX.wav'],
  );
});

test('a set with no numbers at all is left exactly as it arrived', () => {
  const names = ['PAD.wav', 'Drums.wav', 'bass.wav'];
  assert.deepEqual(order(names), names);
});

test('files sharing a number keep their relative order', () => {
  assert.deepEqual(
    order(['1 A.wav', '1 B.wav', '1 C.wav']),
    ['1 A.wav', '1 B.wav', '1 C.wav'],
  );
});

test('sorting is by name, not by identity — objects work too', () => {
  const files = [{ name: '2 B.wav' }, { name: '1 A.wav' }];
  assert.deepEqual(sortByTrackNumber(files, f => f.name).map(f => f.name), ['1 A.wav', '2 B.wav']);
});

test('the input is not mutated', () => {
  const names = ['2 B.wav', '1 A.wav'];
  order(names);
  assert.deepEqual(names, ['2 B.wav', '1 A.wav']);
});

// ------------------------------------------------------------------ naming

test('stripping leaves the name, and never leaves nothing', () => {
  assert.equal(stripTrackNumber('1 DRUMS'), 'DRUMS');
  assert.equal(stripTrackNumber('02_BASS'), 'BASS');
  assert.equal(stripTrackNumber('DRUMS'), 'DRUMS');
  assert.equal(stripTrackNumber('7 '), '7 ');
  assert.equal(stripTrackNumber('7'), '7');
});

test('the track number comes off the display name', () => {
  assert.equal(stemName('1 DRUMS.wav'), 'DRUMS');
  assert.equal(stemName('2_BASS.aif'), 'BASS');
  assert.equal(stemName('05 lead synth.flac'), 'LEAD SYNTH');
});

test('the trailing take number still comes off', () => {
  assert.equal(stemName('DRUMS_2.wav'), 'DRUMS');
  assert.equal(stemName('3 PAD-01.wav'), 'PAD');
});

test('degenerate names still name something', () => {
  assert.equal(stemName('1.wav'), 'STEM');
  assert.equal(stemName('.wav'), 'STEM');
  assert.equal(stemName('1 2.wav'), 'STEM');
});

test('names stay uppercase and within the device limit', () => {
  assert.equal(stemName('1 a very long stem name indeed.wav'), 'A VERY LONG STEM NAM');
});
