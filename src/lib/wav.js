// WAV parsing/encoding. Input WAVs are normalized to the Octatrack's native
// format (44.1 kHz stereo 16/24-bit); anything else is converted with warnings.
// A file that is already in that format is passed through byte-for-byte.
import { SR } from './constants.js';
import { finalizeStereo } from './pcm.js';

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
  const chL = new Float32Array(framesIn), chR = new Float32Array(framesIn);
  const cR = channels >= 2 ? 1 : 0;
  for (let i = 0; i < framesIn; i++) { chL[i] = read(0, i); chR[i] = cR ? read(1, i) : chL[i]; }

  const native = format === 1 && channels === 2 && sampleRate === SR && (bits === 16 || bits === 24);
  const out = native
    ? { chL, chR, bits, warnings: [], converted: false, pcm: u8.slice(dataOff, dataOff + framesIn * frameIn) }
    : finalizeStereo({
      chL, chR, sampleRate, channels, targetRate: SR,
      srcBits: bits,
      srcBitsLabel: format === 3 ? `${bits}-bit float` : `${bits}-bit int`,
    });

  return {
    fileName, frames: out.chL.length, bits: out.bits, bytesPerFrame: out.bits / 8 * 2,
    chL: out.chL, chR: out.chR, pcm: out.pcm, warnings: out.warnings, converted: out.converted,
    origSr: sampleRate, origBits: bits, origCh: channels,
  };
}

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
