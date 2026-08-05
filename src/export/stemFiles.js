import { encodeWav, writeOt } from '../lib/index.js';
import { stemFileBase } from './naming.js';

/** The sliced chain for one stem: its slices concatenated, nothing else. */
export function stemChainBytes(stem, slices, totalFrames) {
  const bpf = stem.bytesPerFrame;
  const out = new Uint8Array(totalFrames * bpf);
  let at = 0;
  for (const slice of slices) {
    out.set(stem.pcm.subarray(slice.start * bpf, slice.end * bpf), at);
    at += slice.frames * bpf;
  }
  return encodeWav(out, stem.bits);
}

export const otBytes = (bpm, totalFrames, slices) =>
  writeOt(bpm, totalFrames, slices.map(s => ({ start: s.outStart, end: s.outEnd })));

/** `[{ name, data }]` for every stem that has slices, ready for the ZIP writer. */
export function stemEntries({ stems, tracks, bpm, abbrev, prefix = '' }) {
  const entries = [];
  stems.forEach((stem, i) => {
    const track = tracks.get(stem.id);
    if (!track || !track.slices.length) return;
    const base = prefix + stemFileBase(stem, i, abbrev);
    entries.push({ name: `${base}.wav`, data: stemChainBytes(stem, track.slices, track.totalFrames) });
    entries.push({ name: `${base}.ot`, data: otBytes(bpm, track.totalFrames, track.slices) });
  });
  return entries;
}

export function estimateSize(stem, track) {
  const bytes = 44 + (track ? track.totalFrames : 0) * stem.bytesPerFrame;
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024) | 0} KB`;
}
