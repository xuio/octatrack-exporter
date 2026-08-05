// The demo song is the only place OSSC *writes* MIDI, so it round-trips through
// the same parser the app uses for real arrangement files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDemo, parseMidi, parseWav, regionsFromTicks } from '../src/lib/index.js';

test('the demo song round-trips through the MIDI parser', () => {
  const demo = makeDemo('shake');
  const midi = parseMidi(demo.midi.data, demo.midi.name);

  assert.equal(midi.ppq, 480);
  assert.equal(midi.bpm, 111, 'tempo event survives variable-length encoding');
  assert.equal(midi.noteCount, 8, 'seven sections plus the song end');

  const { regions, snapped, totalMeasures } = regionsFromTicks(midi.ticks, midi.ppq);
  assert.equal(snapped, 0, 'every note lands exactly on a bar line');
  assert.equal(totalMeasures, 41);
  assert.deepEqual(regions.map(r => r.len), [4, 9, 8, 8, 4, 6, 2]);
  assert.deepEqual(regions.map(r => r.bp).slice(0, 3), ['B2 P1', 'B2 P2', 'B2 P3']);
});

test('the demo stems are readable 44.1k stereo audio of equal length', () => {
  const demo = makeDemo('shake');
  assert.equal(demo.files.length, 5);
  const parsed = demo.files.map(f => parseWav(f.data, f.name));
  const [first] = parsed;
  assert.equal(first.origSr, 44100);
  assert.equal(first.origCh, 2);
  assert.ok(parsed.every(p => p.frames === first.frames), 'all stems share one length');
  assert.ok(parsed.every(p => !p.warnings.length), 'nothing needs converting');
});
