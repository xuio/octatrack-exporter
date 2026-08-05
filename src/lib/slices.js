// Slice construction for one stem: automatic silence trimming per region, with
// manual edits layered on top. Edits are keyed by region index so they survive
// threshold changes and re-analysis.
//
// edits[regionIdx] = { del: true }            — slice removed
//                  | { a: bar, b: bar }       — manual trim (absolute bar indices)
//
// Trims are bar-quantized on purpose: a slice must start on a bar for the trig
// step math (and the Octatrack's step grid) to line up.
//
// A manually trimmed slice may extend past its own section into neighbouring
// ones (a tail ringing over a section change, or a pad that starts early). The
// trig then belongs to whichever pattern contains the slice's FIRST bar, which
// is not necessarily the section the slice was derived from — see trigRegionIdx.
import { trimRegion } from './analysis.js';
import { trigStep } from './midi.js';

export function buildStemSlices(peaks, regs, bounds, thLin, edits = {}) {
  if (!regs.length) return { slices: [], ghosts: [], totalFrames: 0 };
  const lo = regs[0].start, hi = regs[regs.length - 1].end - 1;
  const raw = [], ghosts = [];
  for (const r of regs) {
    const e = edits[r.idx];
    if (e && e.del) { ghosts.push({ region: r, deleted: true }); continue; }
    let aM, bM, edited = false;
    if (e && e.a != null) { aM = e.a; bM = e.b != null ? e.b : e.a; edited = true; }
    else {
      const t = trimRegion(peaks, r.start, r.end, thLin);
      if (!t) { ghosts.push({ region: r, deleted: false }); continue; }
      aM = t.a; bM = t.b;
    }
    aM = Math.max(lo, Math.min(hi, aM));
    bM = Math.max(aM, Math.min(hi, bM));
    raw.push({ region: r, aM, bM, edited });
  }
  raw.sort((x, y) => x.aM - y.aM || x.region.idx - y.region.idx);
  // The chain is a concatenation, so slices must not overlap. An edit that runs
  // into the previous slice pushes that one's end back; anything squeezed to
  // nothing is dropped (its region keeps a placeholder).
  const slices = [];
  for (const s of raw) {
    const prev = slices[slices.length - 1];
    if (prev && s.aM <= prev.bM) {
      prev.bM = s.aM - 1;
      if (prev.bM < prev.aM) { slices.pop(); ghosts.push({ region: prev.region, deleted: false, squeezed: true }); }
    }
    slices.push(s);
  }
  let out = 0;
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const tr = regs.find(r => s.aM >= r.start && s.aM < r.end) || s.region;
    s.trigRegion = tr;
    s.trigRegionIdx = tr.idx;
    s.movedTrig = tr.idx !== s.region.idx;
    s.trig = trigStep(s.aM - tr.start, tr.scale.steps);
    s.start = bounds[s.aM]; s.end = bounds[s.bM + 1]; s.frames = s.end - s.start;
    s.num = i + 1; s.outStart = out; out += s.frames; s.outEnd = out;
  }
  return { slices, ghosts, totalFrames: out };
}

// How far a slice edge may travel before it would collide with its neighbours
// or leave the song. Used to constrain dragging in the UI.
export function trimLimits(slices, regionIdx, regs) {
  if (!regs.length) return { minA: 0, maxB: 0 };
  const i = slices.findIndex(s => s.region.idx === regionIdx);
  const lo = regs[0].start, hi = regs[regs.length - 1].end - 1;
  if (i < 0) return { minA: lo, maxB: hi };
  return {
    minA: i > 0 ? slices[i - 1].bM + 1 : lo,
    maxB: i < slices.length - 1 ? slices[i + 1].aM - 1 : hi,
  };
}
