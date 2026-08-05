// Slice construction for one stem: automatic silence trimming per region, with
// manual edits layered on top. Edits are keyed by region index so they survive
// threshold changes and re-analysis.
//
// edits[regionIdx] = { del: true }            — slice removed
//                  | { a: bar, b: bar }       — manual trim (absolute bar indices)
//
// Trims are bar-quantized on purpose: a slice must start on a bar for the trig
// step math (and the Octatrack's step grid) to line up.
import { trimRegion } from './analysis.js';
import { trigStep } from './midi.js';

export function buildStemSlices(peaks, regs, bounds, thLin, edits = {}) {
  const slices = [], ghosts = [];
  for (const r of regs) {
    const e = edits[r.idx];
    if (e && e.del) { ghosts.push({ region: r, deleted: true }); continue; }
    let aM, bM;
    if (e && e.a != null) { aM = e.a; bM = e.b != null ? e.b : e.a; }
    else {
      const t = trimRegion(peaks, r.start, r.end, thLin);
      if (!t) { ghosts.push({ region: r, deleted: false }); continue; }
      aM = t.a; bM = t.b;
    }
    aM = Math.max(r.start, Math.min(r.end - 1, aM));
    bM = Math.max(aM, Math.min(r.end - 1, bM));
    slices.push({
      region: r, aM, bM,
      start: bounds[aM], end: bounds[bM + 1], frames: bounds[bM + 1] - bounds[aM],
      trig: trigStep(aM - r.start, r.scale.steps),
      edited: !!(e && e.a != null),
    });
  }
  let out = 0;
  slices.forEach((sl, i) => { sl.num = i + 1; sl.outStart = out; out += sl.frames; sl.outEnd = out; });
  return { slices, ghosts, totalFrames: out };
}
