import { barBands, wavePaths } from '../lib/analysis.js';

// Budgets in bytes, not entry counts. One cached bar is 160 bytes at the lowest
// zoom and 10 KB at the highest, so a fixed count is wrong at both ends — and at
// 8 stems × 64 sections it was wrong in the way that costs: 457 clips is most of
// the old 600-entry limit, so a single zoom step overflowed and threw the whole
// cache away, twice per step (measured). Every zoom level then had to be
// recomputed from scratch each time it was revisited.
const BAR_BUDGET = 48 << 20;
const SPAN_BUDGET = 24 << 20;
const PATH_BUDGET = 16 << 20;

/**
 * A Map with a byte budget. Insertion order is eviction order and a hit moves
 * its entry to the back, so what falls out is what has not been looked at —
 * which is the zoom level, or the part of the song, the user has left behind.
 */
class Budgeted {
  constructor(limit) {
    this.limit = limit;
    this.entries = new Map();
    this.bytes = 0;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, bytes) {
    const previous = this.entries.get(key);
    if (previous) { this.bytes -= previous.bytes; this.entries.delete(key); }
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.bytes > this.limit && this.entries.size > 1) {
      const [oldest, entry] = this.entries.entries().next().value;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }

  clear() { this.entries.clear(); this.bytes = 0; }

  get size() { return this.entries.size; }
}

// five Float32Arrays per band set
const bandBytes = bands => bands.n * 5 * 4;
// strings are two bytes a character
const pathBytes = paths => (paths.p1.length + paths.p2.length + paths.p3.length) * 2;

/**
 * Waveform data is cached per BAR rather than per slice. A bar always yields
 * the same buckets over the same audio, so trimming a clip re-uses every bar it
 * still covers: nothing is recomputed and the drawing does not shift under the
 * cursor while dragging.
 */
export class WaveformCache {
  constructor() {
    this.bars = new Budgeted(BAR_BUDGET);    // stemId:bar:bpb        → band arrays for one bar
    this.slices = new Budgeted(SPAN_BUDGET); // stemId:a:b:bpb        → bars concatenated
    this.paths = new Budgeted(PATH_BUDGET);  // stemId:a:b:bpb:style  → SVG path strings
    this.bounds = null;
  }

  reset(bounds) {
    this.bars.clear();
    this.slices.clear();
    this.paths.clear();
    this.bounds = bounds;
  }

  bar(stem, index, bucketsPerBar) {
    const key = `${stem.id}:${index}:${bucketsPerBar}`;
    let bands = this.bars.get(key);
    if (!bands) {
      bands = barBands(stem.chL, stem.chR, this.bounds[index], this.bounds[index + 1], bucketsPerBar);
      this.bars.set(key, bands, bandBytes(bands));
    }
    return bands;
  }

  span(stem, from, to, bucketsPerBar) {
    const key = `${stem.id}:${from}:${to}:${bucketsPerBar}`;
    let bands = this.slices.get(key);
    if (!bands) {
      const barCount = to - from + 1, n = barCount * bucketsPerBar;
      bands = {
        min: new Float32Array(n), max: new Float32Array(n), rms: new Float32Array(n),
        low: new Float32Array(n), high: new Float32Array(n), n,
      };
      for (let i = 0; i < barCount; i++) {
        const src = this.bar(stem, from + i, bucketsPerBar), at = i * bucketsPerBar;
        bands.min.set(src.min, at); bands.max.set(src.max, at); bands.rms.set(src.rms, at);
        bands.low.set(src.low, at); bands.high.set(src.high, at);
      }
      this.slices.set(key, bands, bandBytes(bands));
    }
    return bands;
  }

  pathsFor(stem, from, to, bucketsPerBar, style) {
    const key = `${stem.id}:${from}:${to}:${bucketsPerBar}:${style}`;
    let paths = this.paths.get(key);
    if (!paths) {
      paths = wavePaths(this.span(stem, from, to, bucketsPerBar), style, 32);
      this.paths.set(key, paths, pathBytes(paths));
    }
    return paths;
  }
}
