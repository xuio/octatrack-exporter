// .ot sidecar writer (format per docs/notes-formats.md, verified vs OctaChainer)
import { SR } from './constants.js';

export function writeOt(bpm, totalFrames, slices) {
  const buf = new ArrayBuffer(832), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8.set([0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x4D, 0x50, 0x41], 0);
  u8.set([0, 0, 0, 0, 0, 2, 0], 16);
  dv.setUint32(23, Math.round(bpm * 24));
  const beats = Math.round(totalFrames / (SR * 60 / bpm));
  dv.setUint32(27, beats * 25); dv.setUint32(31, beats * 25);
  dv.setUint32(35, 0); dv.setUint32(39, 0); // stretch off, loop off
  dv.setUint16(43, 48); // gain 0 dB
  dv.setUint8(45, 0xFF); // trig quantize: direct
  dv.setUint32(46, 0); dv.setUint32(50, totalFrames); dv.setUint32(54, 0);
  slices.slice(0, 64).forEach((s, i) => { const o = 58 + i * 12; dv.setUint32(o, s.start); dv.setUint32(o + 4, s.end); dv.setUint32(o + 8, 0xFFFFFFFF); });
  dv.setUint32(826, Math.min(slices.length, 64));
  let sum = 0; for (let i = 16; i < 830; i++) sum += u8[i];
  dv.setUint16(830, sum & 0xFFFF);
  return u8;
}
