// The arrangement MIDI comes from whatever DAW the user works in, so the parser
// meets encodings the demo file never produces — running status above all, which
// every mainstream DAW emits and which decides where every section boundary lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, regionsFromTicks } from '../src/lib/index.js';

const PPQ = 96;

/** Variable-length quantity, as MIDI stores delta times. */
function varLen(value) {
  const out = [value & 127];
  let v = value >> 7;
  while (v > 0) { out.unshift((v & 127) | 128); v >>= 7; }
  return out;
}

/** Assemble a single-track MIDI file from raw track-event bytes. */
function midiFile(events, { ppq = PPQ } = {}) {
  const track = [...events, ...varLen(0), 0xFF, 0x2F, 0x00];
  const out = [
    0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ppq >> 8, ppq & 255,
    0x4D, 0x54, 0x72, 0x6B,
    (track.length >> 24) & 255, (track.length >> 16) & 255, (track.length >> 8) & 255, track.length & 255,
    ...track,
  ];
  return new Uint8Array(out).buffer;
}

const noteOn = (delta, note, velocity = 100) => [...varLen(delta), 0x90, note, velocity];
const running = (delta, note, velocity = 100) => [...varLen(delta), note, velocity];   // inherits the last status
const meta = (delta, type, data) => [...varLen(delta), 0xFF, type, data.length, ...data];

test('running status is followed across a whole track', () => {
  // One explicit note-on, then four more riding the same status byte — the shape
  // every DAW writes, and the one the demo file never exercises.
  const bars = [0, 4, 8, 16, 24];
  const events = [...noteOn(0, 60)];
  for (let i = 1; i < bars.length; i++) events.push(...running((bars[i] - bars[i - 1]) * PPQ * 4, 60));

  const midi = parseMidi(midiFile(events), 'running.mid');
  assert.equal(midi.ranStatus, true, 'the running-status path was actually taken');
  assert.deepEqual(midi.ticks, bars.map(b => b * PPQ * 4));

  const { regions } = regionsFromTicks(midi.ticks, midi.ppq);
  assert.deepEqual(regions.map(r => [r.start, r.len]), [[0, 4], [4, 4], [8, 8], [16, 8]]);
});

test('a meta event between notes does not swallow the notes after it', () => {
  const midi = parseMidi(midiFile([
    ...noteOn(0, 60),
    ...running(PPQ * 4, 60),
    ...meta(0, 0x06, [0x41]),                 // marker, as DAWs write at section starts
    ...noteOn(PPQ * 4, 60),
    ...running(PPQ * 4, 60),
  ]), 'meta.mid');
  assert.deepEqual(midi.ticks, [0, PPQ * 4, PPQ * 8, PPQ * 12]);
});

test('a tempo event is read and does not become the running status', () => {
  const midi = parseMidi(midiFile([
    ...meta(0, 0x51, [0x07, 0xA1, 0x20]),     // 500000 µs/quarter = 120 BPM
    ...noteOn(0, 60),
    ...running(PPQ * 4, 60),
  ]), 'tempo.mid');
  assert.equal(midi.bpm, 120);
  assert.deepEqual(midi.ticks, [0, PPQ * 4]);
});

test('sysex and real-time bytes are skipped by their own lengths', () => {
  // 0xF8 (clock) carries no data at all. Reading it as a channel message and
  // skipping two bytes is what loses every note that follows.
  const midi = parseMidi(midiFile([
    ...noteOn(0, 60),
    ...varLen(0), 0xF0, 0x04, 0x7E, 0x7F, 0x09, 0x01,   // sysex, 4 data bytes
    ...varLen(0), 0xF8,                                  // MIDI clock
    ...varLen(0), 0xF3, 0x02,                            // song select, 1 data byte
    ...noteOn(PPQ * 4, 60),
    ...running(PPQ * 4, 60),
  ]), 'sysex.mid');
  assert.deepEqual(midi.ticks, [0, PPQ * 4, PPQ * 8]);
});

test('note-offs written as velocity-zero note-ons are not section starts', () => {
  const midi = parseMidi(midiFile([
    ...noteOn(0, 60),
    ...running(PPQ, 60, 0),        // the note-off, same status
    ...running(PPQ * 3, 60),
    ...running(PPQ, 60, 0),
  ]), 'velocity.mid');
  assert.deepEqual(midi.ticks, [0, PPQ * 4]);
});

test('a truncated track stops cleanly instead of reading into the next chunk', () => {
  const full = new Uint8Array(midiFile([...noteOn(0, 60), ...running(PPQ * 4, 60)]));
  for (const cut of [3, 6, 9]) {
    const short = full.slice(0, full.length - cut);
    const midi = parseMidi(short.buffer, 'short.mid');
    assert.ok(midi.ticks.length <= 2, `no phantom notes with ${cut} bytes missing`);
    assert.ok(midi.ticks.every(t => t >= 0 && t <= PPQ * 4), 'and no impossible positions');
  }
});

test('files OSSC cannot use are rejected by name, not misread', () => {
  assert.throws(() => parseMidi(new Uint8Array(32).buffer, 'x.mid'), /not a MIDI file/);
  const smpte = new Uint8Array(midiFile([...noteOn(0, 60)]));
  smpte[12] = 0xE8;   // negative frames-per-second → SMPTE division
  assert.throws(() => parseMidi(smpte.buffer, 'x.mid'), /SMPTE/);
});
