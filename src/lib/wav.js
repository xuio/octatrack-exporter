// WAV parsing/encoding. Input WAVs are normalized to the Octatrack's native
// format (44.1 kHz stereo 16/24-bit); anything else is converted with warnings.
import { SR } from './constants.js';

export function parseWav(buf, fileName) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error(fileName + ': not a RIFF/WAVE file');
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off), len = dv.getUint32(off + 4, true);
    if (id === 'fmt ') {
      fmt = { format: dv.getUint16(off + 8, true), channels: dv.getUint16(off + 10, true), sampleRate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
      if (fmt.format === 0xFFFE && len >= 40) fmt.format = dv.getUint16(off + 32, true);
    } else if (id === 'data') { dataOff = off + 8; dataLen = Math.min(len, buf.byteLength - dataOff); }
    off += 8 + len + (len & 1);
  }
  if (!fmt || dataOff < 0) throw new Error(fileName + ': missing fmt/data chunk');
  const { format, channels, sampleRate, bits } = fmt;
  if (!((format === 1 && (bits === 16 || bits === 24 || bits === 32)) || (format === 3 && bits === 32))) throw new Error(fileName + ': unsupported format (' + format + '/' + bits + '-bit)');
  const bpsIn = bits / 8, frameIn = bpsIn * channels, framesIn = Math.floor(dataLen / frameIn);
  const read = (ch, i) => {
    const p = dataOff + i * frameIn + ch * bpsIn;
    if (format === 3) return dv.getFloat32(p, true);
    if (bits === 16) return dv.getInt16(p, true) / 32768;
    if (bits === 24) { let v = u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16); if (v & 0x800000) v |= ~0xFFFFFF; return v / 8388608; }
    return dv.getInt32(p, true) / 2147483648;
  };
  let chL = new Float32Array(framesIn), chR = new Float32Array(framesIn);
  const cR = channels >= 2 ? 1 : 0;
  for (let i = 0; i < framesIn; i++) { chL[i] = read(0, i); chR[i] = cR ? read(1, i) : chL[i]; }
  const warnings = []; let converted = false;
  if (channels === 1) { warnings.push('mono — duplicated to stereo'); converted = true; }
  if (channels > 2) { warnings.push(channels + ' channels — using first two'); converted = true; }
  if (sampleRate !== SR) {
    warnings.push(sampleRate + ' Hz — converted to 44.1 kHz');
    const ratio = sampleRate / SR, n = Math.floor(framesIn / ratio), L = new Float32Array(n), R = new Float32Array(n);
    const cub = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    for (let i = 0; i < n; i++) {
      const x = i * ratio, i1 = Math.floor(x), f = x - i1;
      const i0 = Math.max(0, i1 - 1), i2 = Math.min(framesIn - 1, i1 + 1), i3 = Math.min(framesIn - 1, i1 + 2);
      L[i] = cub(chL[i0], chL[i1], chL[i2], chL[i3], f); R[i] = cub(chR[i0], chR[i1], chR[i2], chR[i3], f);
    }
    chL = L; chR = R; converted = true;
  }
  let outBits = bits === 16 || bits === 24 ? bits : 24;
  if (format === 3 || bits === 32) { warnings.push(bits + '-bit ' + (format === 3 ? 'float' : 'int') + ' — converted to 24-bit'); converted = true; outBits = 24; }
  const frames = chL.length;
  let pcm;
  if (!converted) pcm = u8.slice(dataOff, dataOff + frames * frameIn);
  else { // re-encode stereo 24-bit
    outBits = 24; pcm = new Uint8Array(frames * 6);
    for (let i = 0; i < frames; i++) { w24(pcm, i * 6, chL[i]); w24(pcm, i * 6 + 3, chR[i]); }
  }
  return { fileName, frames, bits: outBits, bytesPerFrame: outBits / 8 * 2, chL, chR, pcm, warnings, converted, origSr: sampleRate, origBits: bits, origCh: channels };
}
function w24(u8, p, v) { let x = Math.max(-1, Math.min(1, v)); x = Math.round(x * 8388607); if (x < 0) x += 16777216; u8[p] = x & 255; u8[p + 1] = (x >> 8) & 255; u8[p + 2] = (x >> 16) & 255; }

export function encodeWav(pcm, bits) {
  const bpf = bits / 8 * 2, out = new Uint8Array(44 + pcm.length), dv = new DataView(out.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  S(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); S(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * bpf, true); dv.setUint16(32, bpf, true); dv.setUint16(34, bits, true);
  S(36, 'data'); dv.setUint32(40, pcm.length, true); out.set(pcm, 44); return out;
}

export function encodeWav16(pcm) {
  const out = new Uint8Array(44 + pcm.length), dv = new DataView(out.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  S(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); S(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  S(36, 'data'); dv.setUint32(40, pcm.length, true); out.set(pcm, 44); return out.buffer;
}
