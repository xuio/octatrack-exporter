// Per-measure peak analysis (for silence trimming) and waveform rendering.
//
// Waveform buckets are anchored to BARS, not to a slice's current extent: a bar
// always produces the same buckets covering the same audio, so trimming a slice
// just adds or drops whole bars of already-computed data. That keeps the drawing
// perfectly still while a clip is dragged, and makes every bar cacheable.

export function measurePeaks(chL, chR, bounds) {
  const n = bounds.length - 1, peaks = new Float32Array(n);
  for (let m = 0; m < n; m++) {
    const a = bounds[m], b = Math.min(bounds[m + 1], chL.length); let p = 0;
    for (let i = a; i < b; i++) { const l = Math.abs(chL[i]), r = Math.abs(chR[i]); if (l > p) p = l; if (r > p) p = r; }
    peaks[m] = p;
  }
  return peaks;
}

// peaks: linear per global measure; region measures [start,end); returns null or {a,b} global 0-based inclusive
export function trimRegion(peaks, start, end, thLin) {
  let a = -1, b = -1;
  for (let m = start; m < end; m++) if (peaks[m] >= thLin) { a = m; break; }
  if (a < 0) return null;
  for (let m = end - 1; m >= start; m--) if (peaks[m] >= thLin) { b = m; break; }
  return { a, b };
}

// Vertical resolution of the waveform coordinate space. Path y values are
// rounded to a tenth of a unit, so 64 units puts the quantum at 0.08 % of full
// scale — invisible even on a 220 px lane on a 2× display. 64 rather than 32
// because it costs nothing: "63.4" is the same four characters as "31.4".
export const WAVE_H = 64;

// A bucket wants to land on about one CSS pixel. Half of that would be wasted —
// even a 2× display only resolves half a CSS pixel — and the 1.5 px this used to
// target left the outline visibly faceted at the top zooms, where a bucket
// spanned two and a half device pixels.
//
// "bars" is the exception: its picket needs room around it, so at one bucket per
// pixel the bars fuse into a haze. Three pixels a bucket keeps them read as bars.
const PX_PER_BUCKET = { bars: 3 };

// Buckets per bar for the current zoom — a power of two so the grid only changes
// on large zoom steps and cached bars stay valid across small ones.
export function bucketsPerBarFor(pxPerBar, style) {
  const want = Math.max(4, Math.min(512, pxPerBar / (PX_PER_BUCKET[style] || 0.75)));
  return Math.pow(2, Math.round(Math.log2(want)));
}

// Sample step for the peak scan. Striding costs little on average — measured
// against the Shake stems, a stride of 2 draws peaks 0.04 dB short on average
// and a stride of 10 draws them 0.2 dB short — but the worst case is the case
// that shows: an isolated drum transient came out 2 dB low at stride 2 and 4 dB
// low at stride 10, and it moves as you zoom, because the stride does.
//
// So once a bucket is short enough for one sample to be visible in it — about
// 23 ms, where a bucket stops being an energy blob and starts being a waveshape
// — every sample is read. Above that the peak scan shares the band scan's loop
// and its stride, so the zoom levels that hold the whole song on screen cost
// exactly what they always did. Confining it this way is worth about 3 ms of
// the zoom-step latency at 8 stems × 64 sections, against 70 ms if the full-rate
// scan ran at every zoom.
const PEAK_FULL_RATE = 1024;   // samples in a bucket, ≈ 23 ms at 44.1 kHz

// One bar of waveform data: true signed min/max (so the drawing is asymmetric
// like a real waveform), RMS for the body, plus rough low/high band energy.
export function barBands(chL, chR, s0, s1, buckets) {
  const min = new Float32Array(buckets), max = new Float32Array(buckets);
  const rms = new Float32Array(buckets), low = new Float32Array(buckets), high = new Float32Array(buckets);
  const len = Math.max(1, s1 - s0), per = len / buckets;
  const stride = Math.max(1, Math.floor(per / 256));
  const truePeaks = per <= PEAK_FULL_RATE && stride > 1;
  const lpC = Math.min(0.9, 0.055 * stride); // one-pole LP ≈ 400 Hz, compensated for striding
  const end = chL.length;
  let lp = 0, prev = 0, primed = false;
  for (let k = 0; k < buckets; k++) {
    const a = s0 + Math.floor(k * per);
    const b = Math.min(end, Math.max(a + 1, s0 + Math.floor((k + 1) * per)));
    let mn = 0, mx = 0;
    if (truePeaks) {
      // A loop with nothing in it but two compares — that is what makes reading
      // every sample affordable where it shows.
      for (let i = a; i < b; i++) {
        const v = (chL[i] + chR[i]) * 0.5;
        if (v < mn) mn = v; else if (v > mx) mx = v;
      }
    }
    let sq = 0, lo = 0, hi = 0, n = 0;
    for (let i = a; i < b; i += stride) {
      const v = (chL[i] + chR[i]) * 0.5;
      if (!primed) { lp = v; prev = v; primed = true; }
      if (!truePeaks) { if (v < mn) mn = v; else if (v > mx) mx = v; }
      sq += v * v;
      lp += lpC * (v - lp);
      lo += Math.abs(lp); hi += Math.abs(v - prev); prev = v;
      n++;
    }
    min[k] = mn; max[k] = mx;
    if (!n) continue;
    rms[k] = Math.sqrt(sq / n);
    low[k] = lo / n; high[k] = hi / n;
  }
  return { min, max, rms, low, high, n: buckets };
}

// Perceptual lift for true sample peaks only. Averaged values (RMS, band
// energies) are already much smaller than peaks and are scaled linearly —
// running them through the same curve is what turns sustained material into a
// solid block.
const lift = v => Math.min(1, Math.pow(Math.abs(v), 0.72));
const P = (v) => (Math.round(v * 10) / 10);

// Bucket k covers the audio in [k, k+1) but is drawn as a single vertex, which
// belongs at the middle of that span, not its left edge. Keeping the vertices on
// integers and sliding the viewBox half a bucket left is the same correction for
// no extra characters in the path — and it lets the outline run from the clip's
// true left edge to its true right edge instead of stopping a bucket short.
export const waveViewBox = n => '-0.5 0 ' + n + ' ' + WAVE_H;
const LEFT = -0.5;

/**
 * Outline through per-bucket top/bottom magnitudes, closed across both ends.
 * `gain` of 0 means "these are sample peaks" and applies the perceptual lift;
 * anything else is an averaged value scaled linearly.
 */
function outline(top, bot, n, gain) {
  if (!n) return '';
  const mid = WAVE_H / 2, amp = WAVE_H / 2 - 0.5, right = n - 0.5;
  // The bottom edge is walked back from the far end, so its y values are parked
  // in an array rather than prepended onto a growing string.
  const lows = new Float64Array(n);
  let up = '', firstTop = 0, lastTop = 0;
  for (let k = 0; k < n; k++) {
    const t = P(mid - (gain ? Math.min(1, top[k] * gain) : lift(top[k])) * amp);
    lows[k] = P(mid + (gain ? Math.min(1, bot[k] * gain) : lift(bot[k])) * amp);
    up += ' ' + k + ',' + t;
    if (!k) firstTop = t;
    lastTop = t;
  }
  let down = '';
  for (let k = n - 1; k >= 0; k--) down += ' ' + k + ',' + lows[k];
  return 'M' + LEFT + ',' + firstTop + ' L' + up
    + ' ' + right + ',' + lastTop + ' ' + right + ',' + lows[n - 1]
    + down + ' ' + LEFT + ',' + lows[0] + ' Z';
}

const envelopePath = (max, min, n) => outline(max, min, n, 0);
const symPath = (vals, n, gain) => outline(vals, vals, n, gain);

function barsPath(min, max, n) {
  const mid = WAVE_H / 2, amp = WAVE_H / 2 - 0.5, minH = WAVE_H / 40;
  let d = '';
  for (let k = 0; k < n; k++) {
    const t = mid - Math.min(1, lift(max[k])) * amp, b = mid + Math.min(1, lift(min[k])) * amp;
    const h = Math.max(minH, b - t);
    d += 'M' + P(k - 0.3) + ',' + P(t) + 'h0.6v' + P(h) + 'h-0.6Z';
  }
  return d;
}

// p1 = peak envelope (outer shape), p2 = body, p3 = highlight
export function wavePaths(bands, style) {
  const { min, max, rms, low, high, n } = bands;
  if (style === 'bars') return { p1: barsPath(min, max, n), p2: '', p3: symPath(rms, n, 1.5) };
  if (style === 'band') return { p1: envelopePath(max, min, n), p2: symPath(rms, n, 1.5), p3: '' };
  // spectral: peak outline, low-band core, high-frequency sheen
  return { p1: envelopePath(max, min, n), p2: symPath(low, n, 1.7), p3: symPath(high, n, 1.4) };
}
