// AIFF / AIFC parsing. Logic and Pro Tools export these by default, so a stem
// set arriving as .aif is common enough to be worth reading natively rather than
// handing to the browser decoder: parsing it here keeps the samples in their
// original word length (a 16-bit AIFF stays 16-bit) and keeps the whole path in
// the pure, Node-testable core.
//
// Layout: FORM <size BE> AIFF|AIFC, then chunks of id(4) + size(4 BE), padded to
// an even length. COMM carries the format, SSND the samples — big-endian unless
// an AIFC compression type says otherwise.
import { SR } from './constants.js';
import { finalizeStereo } from './pcm.js';

/** 80-bit IEEE 754 extended precision — how AIFF stores the sample rate. */
function readExtended(dv, off) {
  const expo = dv.getUint16(off);
  const hi = dv.getUint32(off + 2), lo = dv.getUint32(off + 6);
  const e = (expo & 0x7FFF) - 16383;
  if (e === -16383 && !hi && !lo) return 0;
  const mag = hi * Math.pow(2, e - 31) + lo * Math.pow(2, e - 63);
  return expo & 0x8000 ? -mag : mag;
}

// AIFC compression types OSSC reads. Everything else is a real codec and is
// rejected rather than guessed at.
const CODECS = {
  NONE: { little: false, float: false },
  twos: { little: false, float: false },
  sowt: { little: true, float: false },
  fl32: { little: false, float: true },
  FL32: { little: false, float: true },
};

export function parseAiff(buf, fileName) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'FORM' || (tag(8) !== 'AIFF' && tag(8) !== 'AIFC')) {
    throw new Error(fileName + ': not an AIFF file');
  }

  let off = 12, comm = null, ssnd = -1, ssndLen = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off), len = dv.getUint32(off + 4);
    if (id === 'COMM') {
      comm = {
        channels: dv.getUint16(off + 8),
        frames: dv.getUint32(off + 10),
        bits: dv.getUint16(off + 14),
        sampleRate: Math.round(readExtended(dv, off + 16)),
        codec: len >= 22 ? tag(off + 26) : 'NONE',
      };
    } else if (id === 'SSND') {
      // offset/blockSize precede the samples; both are almost always zero
      const skip = dv.getUint32(off + 8);
      ssnd = off + 16 + skip;
      ssndLen = Math.max(0, Math.min(len - 8 - skip, buf.byteLength - ssnd));
    }
    off += 8 + len + (len & 1);
  }
  if (!comm || ssnd < 0) throw new Error(fileName + ': missing COMM/SSND chunk');

  const codec = CODECS[comm.codec];
  if (!codec) throw new Error(`${fileName}: unsupported AIFC compression “${comm.codec}”`);
  const { channels, bits, sampleRate } = comm;
  if (!(bits === 8 || bits === 16 || bits === 24 || bits === 32)) {
    throw new Error(`${fileName}: unsupported format (${bits}-bit)`);
  }
  if (!channels || !sampleRate) throw new Error(fileName + ': COMM chunk has no channels or sample rate');

  const bps = bits / 8, frameIn = bps * channels;
  const frames = Math.min(comm.frames, Math.floor(ssndLen / frameIn));
  const { little, float } = codec;

  const read = (ch, i) => {
    const p = ssnd + i * frameIn + ch * bps;
    if (float) return dv.getFloat32(p, little);
    if (bits === 8) return (dv.getInt8(p)) / 128;
    if (bits === 16) return dv.getInt16(p, little) / 32768;
    if (bits === 24) {
      const b0 = u8[little ? p : p + 2], b1 = u8[p + 1], b2 = u8[little ? p + 2 : p];
      let v = b0 | (b1 << 8) | (b2 << 16);
      if (v & 0x800000) v |= ~0xFFFFFF;
      return v / 8388608;
    }
    return dv.getInt32(p, little) / 2147483648;
  };

  const chL = new Float32Array(frames), chR = new Float32Array(frames);
  const cR = channels >= 2 ? 1 : 0;
  for (let i = 0; i < frames; i++) { chL[i] = read(0, i); chR[i] = cR ? read(1, i) : chL[i]; }

  const out = finalizeStereo({
    chL, chR, sampleRate, channels, targetRate: SR,
    srcBits: bits,
    srcBitsLabel: float ? `${bits}-bit float` : `${bits}-bit`,
  });

  return {
    fileName, frames: out.chL.length, bits: out.bits, bytesPerFrame: out.bits / 8 * 2,
    chL: out.chL, chR: out.chR, pcm: out.pcm, warnings: out.warnings,
    // AIFF is always repacked: the Octatrack reads WAV, so there is no
    // byte-for-byte path the way there is for an already-native WAV.
    converted: true,
    origSr: sampleRate, origBits: bits, origCh: channels,
  };
}
