// Stems arrive as whatever the user's DAW exports, and everything that is not
// already 44.1 kHz stereo gets rewritten on the way in. These tests pin the two
// things that must survive that: the samples themselves, and their level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAiff, resample, SR } from '../src/lib/index.js';
import { flacStreamInfo } from '../src/audio/decodeFlac.js';

const peak = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const db = v => 20 * Math.log10(v);

// ------------------------------------------------------------------ AIFF

/** Minimal AIFF/AIFC writer covering the variants parseAiff accepts. */
function aiff({ channels = 2, bits = 16, rate = 44100, frames, sample, codec = null }) {
  const bytes = bits / 8, frameSize = bytes * channels;
  const data = new Uint8Array(frames * frameSize);
  const dv = new DataView(data.buffer);
  const little = codec === 'sowt';
  const float = codec === 'fl32';
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = sample(i, c), at = i * frameSize + c * bytes;
      if (float) dv.setFloat32(at, v, little);
      else if (bits === 16) dv.setInt16(at, Math.round(v * 32767), little);
      else if (bits === 24) {
        const x = Math.round(v * 8388607) & 0xFFFFFF;
        const b = [x & 255, (x >> 8) & 255, (x >> 16) & 255];
        if (!little) b.reverse();
        data.set(b, at);
      } else dv.setInt32(at, Math.round(v * 2147483647), little);
    }
  }

  // 80-bit extended sample rate
  const ext = new Uint8Array(10);
  const exponent = Math.floor(Math.log2(rate));
  const mantissa = Math.round(rate / Math.pow(2, exponent) * Math.pow(2, 31));
  new DataView(ext.buffer).setUint16(0, 16383 + exponent);
  new DataView(ext.buffer).setUint32(2, mantissa);

  const comm = [];
  const cd = new DataView(new ArrayBuffer(18));
  cd.setUint16(0, channels); cd.setUint32(2, frames); cd.setUint16(6, bits);
  comm.push(...new Uint8Array(cd.buffer).subarray(0, 8), ...ext);
  if (codec) comm.push(...[...codec].map(c => c.charCodeAt(0)), 0);

  const ssnd = [0, 0, 0, 0, 0, 0, 0, 0, ...data];
  const chunk = (id, body) => [
    ...[...id].map(c => c.charCodeAt(0)),
    (body.length >> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255,
    ...body, ...(body.length & 1 ? [0] : []),
  ];
  const form = [...[...(codec ? 'AIFC' : 'AIFF')].map(c => c.charCodeAt(0)), ...chunk('COMM', comm), ...chunk('SSND', ssnd)];
  return new Uint8Array([
    0x46, 0x4F, 0x52, 0x4D,
    (form.length >> 24) & 255, (form.length >> 16) & 255, (form.length >> 8) & 255, form.length & 255,
    ...form,
  ]).buffer;
}

test('big-endian AIFF is read at the right level and polarity', () => {
  const tone = i => 0.75 * Math.sin(i / 11);
  const parsed = parseAiff(aiff({ bits: 24, frames: 2000, sample: tone }), 'x.aif');
  assert.equal(parsed.origBits, 24);
  assert.equal(parsed.frames, 2000);
  assert.ok(Math.abs(peak(parsed.chL) - 0.75) < 0.001, 'peak preserved');
  for (const i of [1, 40, 700, 1999]) {
    assert.ok(Math.abs(parsed.chL[i] - tone(i)) < 0.001, `sample ${i} matches (byte order)`);
  }
});

test('AIFC little-endian and float variants decode identically to the big-endian one', () => {
  const tone = i => 0.6 * Math.sin(i / 7);
  const reference = parseAiff(aiff({ bits: 16, frames: 800, sample: tone }), 'be.aif');
  for (const codec of ['sowt', 'fl32']) {
    const bits = codec === 'fl32' ? 32 : 16;
    const parsed = parseAiff(aiff({ bits, frames: 800, sample: tone, codec }), `${codec}.aif`);
    for (const i of [0, 5, 400, 799]) {
      assert.ok(Math.abs(parsed.chL[i] - reference.chL[i]) < 0.002, `${codec} sample ${i}`);
    }
  }
});

test('a mono AIFF is duplicated to both channels', () => {
  const parsed = parseAiff(aiff({ channels: 1, frames: 400, sample: i => 0.3 * Math.sin(i / 5) }), 'm.aif');
  assert.match(parsed.warnings.join(), /mono/);
  assert.deepEqual([...parsed.chL], [...parsed.chR]);
});

test('AIFF files OSSC cannot use are rejected rather than guessed at', () => {
  assert.throws(() => parseAiff(new ArrayBuffer(64), 'x.aif'), /not an AIFF/);
  assert.throws(
    () => parseAiff(aiff({ frames: 32, sample: () => 0, codec: 'ima4' }), 'x.aif'),
    /unsupported AIFC compression/,
  );
});

// ------------------------------------------------------------------ FLAC

test('FLAC STREAMINFO is read without decoding the stream', () => {
  // fLaC + a STREAMINFO block header, then the fields packed at their bit offsets
  const u8 = new Uint8Array(64);
  u8.set([0x66, 0x4C, 0x61, 0x43, 0x00, 0, 0, 34]);
  const rate = 48000, channels = 2, bits = 24;
  u8[18] = (rate >> 12) & 255;
  u8[19] = (rate >> 4) & 255;
  u8[20] = ((rate & 0x0F) << 4) | ((channels - 1) << 1) | (((bits - 1) >> 4) & 1);
  u8[21] = ((bits - 1) & 0x0F) << 4;
  assert.deepEqual(flacStreamInfo(u8.buffer), { sampleRate: 48000, channels: 2, bits: 24 });

  assert.equal(flacStreamInfo(new Uint8Array(64).buffer), null, 'a non-FLAC file returns null');
  assert.equal(flacStreamInfo(new Uint8Array(8).buffer), null, 'and so does a truncated one');
});

// ------------------------------------------------------------- resampling

test('resampling leaves the rate alone when there is nothing to do', () => {
  const input = new Float32Array([1, 2, 3]);
  assert.equal(resample(input, SR, SR), input, 'the same array, not a copy');
});

test('a constant signal comes through at exactly its own level', () => {
  // Unity DC gain is what makes conversion safe to apply without touching level.
  const input = new Float32Array(4000).fill(0.5);
  for (const rate of [48000, 96000, 22050]) {
    const out = resample(input, rate, SR);
    const interior = out.subarray(64, out.length - 64);
    for (const v of interior) assert.ok(Math.abs(v - 0.5) < 1e-4, `${rate} Hz → constant preserved`);
  }
});

test('48 kHz → 44.1 kHz keeps an audible tone at its own amplitude and length', () => {
  const rate = 48000, seconds = 0.5, frames = rate * seconds;
  const input = new Float32Array(frames);
  for (let i = 0; i < frames; i++) input[i] = 0.8 * Math.sin(2 * Math.PI * 1000 * i / rate);
  const out = resample(input, rate, SR);

  assert.equal(out.length, Math.floor(frames / (rate / SR)));
  const interior = out.subarray(200, out.length - 200);
  assert.ok(Math.abs(peak(interior) - 0.8) < 0.005, 'peak within 0.05 dB');
  assert.ok(Math.abs(rms(interior) - 0.8 / Math.SQRT2) < 0.005, 'and so is the RMS');
});

test('content above the new Nyquist is filtered out, not folded back into the band', () => {
  // This is the whole reason for a windowed sinc instead of interpolation: at
  // 44.1 kHz a 23 kHz tone has nowhere legal to go, and plain interpolation
  // would mirror it down to 21.1 kHz as an audible artefact.
  const rate = 48000, frames = rate / 2;
  const input = new Float32Array(frames);
  for (let i = 0; i < frames; i++) input[i] = Math.sin(2 * Math.PI * 23000 * i / rate);
  const out = resample(input, rate, SR);
  const interior = out.subarray(200, out.length - 200);
  assert.ok(db(rms(interior) / rms(input)) < -40, `alias energy is ${db(rms(interior) / rms(input)).toFixed(1)} dB, expected below -40`);
});

test('the audible band is not dulled on the way through', () => {
  // The band-limiting must sit above the top of hearing, not inside it.
  const rate = 48000, frames = rate / 2;
  for (const freq of [100, 1000, 8000, 15000]) {
    const input = new Float32Array(frames);
    for (let i = 0; i < frames; i++) input[i] = Math.sin(2 * Math.PI * freq * i / rate);
    const out = resample(input, rate, SR);
    const loss = db(rms(out.subarray(200, out.length - 200)) / rms(input));
    assert.ok(Math.abs(loss) < 0.5, `${freq} Hz loses ${loss.toFixed(2)} dB, expected under 0.5`);
  }
});

test('upsampling preserves level too', () => {
  const rate = 22050, frames = rate / 2;
  const input = new Float32Array(frames);
  for (let i = 0; i < frames; i++) input[i] = 0.7 * Math.sin(2 * Math.PI * 440 * i / rate);
  const out = resample(input, rate, SR);
  assert.equal(out.length, frames * 2);
  assert.ok(Math.abs(peak(out.subarray(200, out.length - 200)) - 0.7) < 0.005);
});
