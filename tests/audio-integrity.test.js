// Guards the promise that OSSC never alters level: the exported chain must be a
// byte-exact copy of the source PCM, and every gain field written to the device
// must be unity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWav, encodeWav, writeOt, writeStaticSlots, boundariesFor } from '../src/lib/index.js';

function makeWav16(frames, gen) {
  const pcm = new Uint8Array(frames * 4), dv = new DataView(pcm.buffer);
  for (let i = 0; i < frames; i++) { const [l, r] = gen(i); dv.setInt16(i * 4, l, true); dv.setInt16(i * 4 + 2, r, true); }
  const out = new Uint8Array(44 + pcm.length), ov = new DataView(out.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  S(0, 'RIFF'); ov.setUint32(4, 36 + pcm.length, true); S(8, 'WAVEfmt '); ov.setUint32(16, 16, true);
  ov.setUint16(20, 1, true); ov.setUint16(22, 2, true); ov.setUint32(24, 44100, true);
  ov.setUint32(28, 44100 * 4, true); ov.setUint16(32, 4, true); ov.setUint16(34, 16, true);
  S(36, 'data'); ov.setUint32(40, pcm.length, true); out.set(pcm, 44);
  return { wav: out.buffer, pcm };
}

test('a 44.1k/16-bit stereo stem passes through untouched', () => {
  const { wav, pcm } = makeWav16(5000, i => [Math.round(30000 * Math.sin(i / 20)), Math.round(-28000 * Math.sin(i / 33))]);
  const p = parseWav(wav, 'x.wav');
  assert.equal(p.converted, false, 'no conversion should be applied');
  assert.deepEqual([...p.pcm], [...pcm], 'PCM must be byte-identical to the source');
  assert.deepEqual(p.warnings, []);
});

test('the exported slice chain is a byte-exact copy of the source samples', () => {
  const { wav } = makeWav16(44100 * 8, i => [(i % 30000) - 15000, 15000 - (i % 30000)]);
  const stem = parseWav(wav, 'x.wav');
  const bounds = boundariesFor(120, 4);            // 120 BPM → 2 s per bar, so 4 bars = 8 s
  const slices = [{ start: bounds[1], end: bounds[2] }, { start: bounds[3], end: bounds[4] }];
  const bpf = stem.bytesPerFrame;
  const chain = new Uint8Array(slices.reduce((n, s) => n + (s.end - s.start) * bpf, 0));
  let o = 0;
  for (const s of slices) { chain.set(stem.pcm.subarray(s.start * bpf, s.end * bpf), o); o += (s.end - s.start) * bpf; }
  const out = encodeWav(chain, stem.bits);
  const body = out.subarray(44);
  // every exported sample must equal the source sample it came from
  let p = 0;
  for (const s of slices) {
    for (let i = s.start * bpf; i < s.end * bpf; i++, p++) assert.equal(body[p], stem.pcm[i]);
  }
  assert.equal(p, body.length);
  assert.equal(new DataView(out.buffer, out.byteOffset).getUint16(34, true), 16); // bit depth preserved
});

test('every gain the device reads is unity', () => {
  const ot = writeOt(120, 44100, [{ start: 0, end: 44100 }]);
  // .ot layout: header[21] + version + unknown + tempo u32 + trim_bar_len u32
  // + loop_bar_len u32 + stretch u32 + loop_mode u32 → gain is a u16 at 43.
  // Pinned byte-wise because a wrong width here shifts the gain by one byte and
  // would silently export at −24 dB.
  const dv = new DataView(ot.buffer);
  assert.equal(dv.getUint16(43), 48, '.ot gain must be 48 = +0.0 dB');
  assert.equal(ot[43], 0, 'gain high byte');
  assert.equal(ot[44], 48, 'gain low byte');
  assert.equal(ot[45], 0xFF, 'quantization byte must follow the u16 gain');
  assert.equal(dv.getUint32(35), 0, 'timestretch off — the device must not resample');
  const text = '[META]\r\nTYPE=OCTATRACK DPS-1 PROJECT\r\n[/META]\r\n\r\n[SETTINGS]\r\nTEMPOx24=2880\r\n[/SETTINGS]\r\n\r\n############################\r\n\r\n';
  const res = writeStaticSlots(text, [{ slot: 1, path: 'a.wav', bpm: 120 }], 120);
  assert.match(res.text, /GAIN=48/, 'slot gain must be 48 = 0 dB (72 is the recorder default = +12 dB)');
  assert.doesNotMatch(res.text, /GAIN=72/);
  assert.match(res.text, /TSMODE=0/, 'timestretch off — no resampling on the device');
});
