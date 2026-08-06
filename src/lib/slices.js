// Slice construction for one stem: automatic silence trimming per region, with
// manual edits layered on top. Edits are keyed by region index so they survive
// threshold changes and re-analysis.
//
// edits[regionIdx] = { del: true }            — slice removed
//                  | { a: bar, b: bar,        — manual trim (absolute bar indices)
//                      sa, sb }               — fine trim, signed sample offsets
//
// Trims are bar-quantized on purpose: a slice must start on a bar for the trig
// step math (and the Octatrack's step grid) to line up. `sa`/`sb` then move the
// two edges off that bar line by a handful of samples — enough to land the cut
// on a zero crossing so the device does not click, far too little to shift which
// step the trig fires on. They are offsets from the bar-derived edges, so bar
// trims and fine trims compose without either having to know about the other.
//
// A slice always lives entirely inside its own section — one slice per section,
// exactly as the initial import produces, and one trig per pattern. Dragging an
// edge past a section boundary does not stretch the slice across it: the part
// that lands in the neighbouring section becomes that section's own slice (see
// splitTrim), so expanding a clip creates a separate clip next door.
import { trimRegion } from './analysis.js';
import { trigStep } from './midi.js';

/**
 * Where a fine trim may put a slice's edges, and where its bars put them now.
 * A slice owns its whole section and never shares it, so the section's own
 * sample range is the only limit an edge can run into.
 *
 * @returns {{barStart: number, barEnd: number, min: number, max: number}}
 */
export function fineRange(region, aM, bM, bounds) {
  return { barStart: bounds[aM], barEnd: bounds[bM + 1], min: bounds[region.start], max: bounds[region.end] };
}

/**
 * Clamp a pair of sample offsets to that range, keeping start < end. Returns the
 * offsets that actually apply, so the UI shows what the export will contain
 * rather than what was asked for.
 */
export function clampFine(range, sa = 0, sb = 0) {
  const { barStart, barEnd, min, max } = range;
  const start = Math.max(min, Math.min(max - 1, barStart + (sa || 0)));
  const end = Math.max(start + 1, Math.min(max, barEnd + (sb || 0)));
  return { sa: start - barStart, sb: end - barEnd, start, end };
}

export function buildStemSlices(peaks, regs, bounds, thLin, edits = {}) {
  if (!regs.length) return { slices: [], ghosts: [], totalFrames: 0 };
  const slices = [], ghosts = [];
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
    aM = Math.max(r.start, Math.min(r.end - 1, aM));
    bM = Math.max(aM, Math.min(r.end - 1, bM));
    const range = fineRange(r, aM, bM, bounds);
    const { sa, sb, start, end } = clampFine(range, e?.sa, e?.sb);
    slices.push({ region: r, aM, bM, edited: edited || !!(sa || sb), fine: { ...range, sa, sb }, start, end });
  }
  // sections never overlap, so neither can their slices
  slices.sort((x, y) => x.aM - y.aM);

  let out = 0;
  const placed = slices.map((slice, i) => {
    const frames = slice.end - slice.start;
    const outStart = out;
    out += frames;
    return {
      ...slice,
      // a slice lives inside one section, so it always trigs from that pattern
      trigRegion: slice.region,
      trigRegionIdx: slice.region.idx,
      movedTrig: false,
      trig: trigStep(slice.aM - slice.region.start, slice.region.scale.steps),
      frames,
      num: i + 1,
      outStart,
      outEnd: out,
    };
  });

  return { slices: placed, ghosts, totalFrames: out };
}

// Turn a dragged span [a,b] — which may reach outside its own section — into
// per-section edits: the home section keeps the part inside itself, and every
// other section the span reaches gets (or grows) a slice of its own.
// `base` is the slice layout from before the drag started, so dragging out and
// back again does not accumulate.
export function splitTrim(regs, regionIdx, a, b, base = []) {
  if (!regs.length) return {};
  const lo = regs[0].start, hi = regs[regs.length - 1].end - 1;
  a = Math.max(lo, Math.min(hi, a));
  b = Math.max(a, Math.min(hi, b));
  const out = {};
  for (const r of regs) {
    const sa = Math.max(a, r.start), sb = Math.min(b, r.end - 1);
    const covered = sb >= sa;
    if (r.idx === regionIdx) { out[r.idx] = covered ? { a: sa, b: sb } : null; continue; }
    if (!covered) continue;
    const cur = base.find(s => s.regionIdx === r.idx);
    out[r.idx] = cur ? { a: Math.min(cur.aM, sa), b: Math.max(cur.bM, sb) } : { a: sa, b: sb };
  }
  return out;
}

// Edges may travel anywhere in the song; crossing a boundary splits rather than
// overlaps, so neighbouring slices are not a limit.
export function trimLimits(slices, regionIdx, regs) {
  if (!regs.length) return { minA: 0, maxB: 0 };
  return { minA: regs[0].start, maxB: regs[regs.length - 1].end - 1 };
}
