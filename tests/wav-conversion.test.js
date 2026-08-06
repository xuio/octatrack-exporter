// The conversion paths in parseWav are the ones that *rewrite* the user's
// audio, so they are the ones worth pinning: everything the Octatrack cannot
// load has to come out as 44.1 kHz stereo at the same level it went in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWav, encodeWav } from '../src/lib/index.js';

/** Minimal WAV writer covering the input formats parseWav accepts. */
function wav({ channels = 2, bits = 16, rate = 44100, float = false, frames, sample }) {
  const bytes = bits / 8, blockAlign = bytes * channels;
  const data = new Uint8Array(frames * blockAlign);
  const dv = new DataView(data.buffer);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = sample(i, c), at = i * blockAlign + c * bytes;
      if (float) dv.setFloat32(at, v, true);
      else if (bits === 16) dv.setInt16(at, Math.round(v * 32767), true);
      else if (bits === 24) {
        const x = Math.round(v * 8388607) & 0xFFFFFF;
        data[at] = x & 255; data[at + 1] = (x >> 8) & 255; data[at + 2] = (x >> 16) & 255;
      } else dv.setInt32(at, Math.round(v * 2147483647), true);
    }
  }
  const out = new Uint8Array(44 + data.length), ov = new DataView(out.buffer);
  const tag = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); ov.setUint32(4, 36 + data.length, true); tag(8, 'WAVEfmt ');
  ov.setUint32(16, 16, true); ov.setUint16(20, float ? 3 : 1, true); ov.setUint16(22, channels, true);
  ov.setUint32(24, rate, true); ov.setUint32(28, rate * blockAlign, true);
  ov.setUint16(32, blockAlign, true); ov.setUint16(34, bits, true);
  tag(36, 'data'); ov.setUint32(40, data.length, true); out.set(data, 44);
  return out.buffer;
}

const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('mono is duplicated to stereo without touching the level', () => {
  const tone = (i) => 0.5 * Math.sin(i / 12);
  const parsed = parseWav(wav({ channels: 1, frames: 2000, sample: tone }), 'mono.wav');
  assert.match(parsed.warnings.join(), /mono/);
  assert.deepEqual([...parsed.chL], [...parsed.chR], 'both channels carry the same signal');
  assert.ok(Math.abs(peak(parsed.chL) - 0.5) < 0.001, 'peak is unchanged');
  // Only the channel count needed changing, so the word length is left alone:
  // re-encoding 16-bit material at 24-bit would double the file for no gain.
  assert.equal(parsed.bytesPerFrame, 4, 'written back as 16-bit stereo');
});

test('16-bit mono is duplicated sample-for-sample, not requantized', () => {
  const frames = 500;
  const buffer = wav({ channels: 1, bits: 16, frames, sample: i => Math.sin(i / 3) * (i % 97) / 97 });
  const source = new Int16Array(buffer, 44, frames);   // what the file actually holds
  const parsed = parseWav(buffer, 'mono16.wav');
  const out = new Int16Array(parsed.pcm.buffer, parsed.pcm.byteOffset, frames * 2);
  for (let i = 0; i < frames; i++) {
    assert.equal(out[i * 2], source[i], `left sample ${i}`);
    assert.equal(out[i * 2 + 1], source[i], `right sample ${i}`);
  }
});

test('more than two channels keeps the first two, in order', () => {
  const parsed = parseWav(
    wav({ channels: 4, frames: 500, sample: (i, c) => (c + 1) * 0.2 }),
    'quad.wav',
  );
  assert.match(parsed.warnings.join(), /4 channels/);
  assert.ok(Math.abs(peak(parsed.chL) - 0.2) < 0.002, 'channel 1 → left');
  assert.ok(Math.abs(peak(parsed.chR) - 0.4) < 0.002, 'channel 2 → right');
});

test('24-bit stereo at 44.1k is passed through byte-for-byte', () => {
  const buffer = wav({ bits: 24, frames: 1000, sample: (i) => 0.7 * Math.sin(i / 9) });
  const parsed = parseWav(buffer, 'x.wav');
  assert.equal(parsed.converted, false);
  assert.equal(parsed.bits, 24);
  assert.deepEqual([...parsed.pcm], [...new Uint8Array(buffer).subarray(44)]);
});

test('32-bit float and 32-bit int are converted to 24-bit at the same level', () => {
  for (const opts of [{ bits: 32, float: true }, { bits: 32 }]) {
    const parsed = parseWav(wav({ ...opts, frames: 1000, sample: (i) => 0.8 * Math.sin(i / 7) }), 'x.wav');
    assert.equal(parsed.bits, 24);
    assert.match(parsed.warnings.join(), /32-bit/);
    assert.ok(Math.abs(peak(parsed.chL) - 0.8) < 0.001, `peak preserved for ${JSON.stringify(opts)}`);
  }
});

test('a 48 kHz file is resampled to 44.1 kHz without gaining level', () => {
  const seconds = 0.5, rate = 48000;
  const parsed = parseWav(
    wav({ rate, frames: rate * seconds, sample: (i) => 0.6 * Math.sin(2 * Math.PI * 440 * i / rate) }),
    '48k.wav',
  );
  assert.match(parsed.warnings.join(), /48000 Hz/);
  assert.ok(Math.abs(parsed.frames - 44100 * seconds) <= 2, 'duration is preserved');
  assert.ok(peak(parsed.chL) <= 0.62, 'interpolation must not overshoot the source peak');
  assert.ok(peak(parsed.chL) > 0.55, 'and must not lose it either');
});

test('unsupported formats are rejected rather than silently mangled', () => {
  assert.throws(() => parseWav(new ArrayBuffer(64), 'empty.wav'), /not a RIFF/);

  // a valid file whose header claims 8-bit — the depth OSSC will not touch
  const eightBit = wav({ frames: 32, sample: () => 0 });
  new DataView(eightBit).setUint16(34, 8, true);
  assert.throws(() => parseWav(eightBit, 'x.wav'), /unsupported format/);

  // ...and one claiming an unknown codec
  const alaw = wav({ frames: 32, sample: () => 0 });
  new DataView(alaw).setUint16(20, 6, true);
  assert.throws(() => parseWav(alaw, 'x.wav'), /unsupported format/);

  // a header with no data chunk at all
  const headerOnly = new Uint8Array(new Uint8Array(wav({ frames: 4, sample: () => 0 })).subarray(0, 36));
  assert.throws(() => parseWav(headerOnly.buffer, 'x.wav'), /missing fmt\/data/);
});

test('encodeWav round-trips its own output', () => {
  const parsed = parseWav(wav({ frames: 800, sample: (i) => 0.4 * Math.sin(i / 5) }), 'x.wav');
  const again = parseWav(encodeWav(parsed.pcm, parsed.bits).buffer, 'again.wav');
  assert.equal(again.frames, parsed.frames);
  assert.deepEqual([...again.pcm], [...parsed.pcm]);
});
