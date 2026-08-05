import { barBands, wavePaths } from '../lib/analysis.js';

const MAX_BARS = 4000;
const MAX_SLICES = 600;

/**
 * Waveform data is cached per BAR rather than per slice. A bar always yields
 * the same buckets over the same audio, so trimming a clip re-uses every bar it
 * still covers: nothing is recomputed and the drawing does not shift under the
 * cursor while dragging.
 */
export class WaveformCache {
  constructor() {
    this.bars = new Map();    // stemId:bar:bpb        → band arrays for one bar
    this.slices = new Map();  // stemId:a:b:bpb        → bars concatenated
    this.paths = new Map();   // stemId:a:b:bpb:style  → SVG path strings
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
      if (this.bars.size > MAX_BARS) this.bars.clear();
      bands = barBands(stem.chL, stem.chR, this.bounds[index], this.bounds[index + 1], bucketsPerBar);
      this.bars.set(key, bands);
    }
    return bands;
  }

  span(stem, from, to, bucketsPerBar) {
    const key = `${stem.id}:${from}:${to}:${bucketsPerBar}`;
    let bands = this.slices.get(key);
    if (!bands) {
      if (this.slices.size > MAX_SLICES) this.slices.clear();
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
      this.slices.set(key, bands);
    }
    return bands;
  }

  pathsFor(stem, from, to, bucketsPerBar, style) {
    const key = `${stem.id}:${from}:${to}:${bucketsPerBar}:${style}`;
    let paths = this.paths.get(key);
    if (!paths) {
      if (this.paths.size > MAX_SLICES) this.paths.clear();
      paths = wavePaths(this.span(stem, from, to, bucketsPerBar), style, 32);
      this.paths.set(key, paths);
    }
    return paths;
  }
}
