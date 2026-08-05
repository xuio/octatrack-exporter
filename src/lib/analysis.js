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

// Buckets per bar for the current zoom — a power of two so the grid only changes
// on large zoom steps and cached bars stay valid across small ones.
export function bucketsPerBarFor(pxPerBar) {
  const want = Math.max(4, Math.min(512, pxPerBar / 1.5));
  return Math.pow(2, Math.round(Math.log2(want)));
}

// One bar of waveform data: true signed min/max (so the drawing is asymmetric
// like a real waveform), RMS for the body, plus rough low/high band energy.
export function barBands(chL, chR, s0, s1, buckets) {
  const min = new Float32Array(buckets), max = new Float32Array(buckets);
  const rms = new Float32Array(buckets), low = new Float32Array(buckets), high = new Float32Array(buckets);
  const len = Math.max(1, s1 - s0), per = len / buckets;
  const stride = Math.max(1, Math.floor(per / 256));
  const lpC = Math.min(0.9, 0.055 * stride); // one-pole LP ≈ 400 Hz, compensated for striding
  let lp = 0, prev = 0, primed = false;
  for (let k = 0; k < buckets; k++) {
    const a = s0 + Math.floor(k * per), b = Math.max(a + 1, s0 + Math.floor((k + 1) * per));
    let mn = 1, mx = -1, sq = 0, lo = 0, hi = 0, n = 0;
    for (let i = a; i < b && i < chL.length; i += stride) {
      const v = (chL[i] + chR[i]) * 0.5;
      if (!primed) { lp = v; prev = v; primed = true; }
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sq += v * v;
      lp += lpC * (v - lp);
      lo += Math.abs(lp); hi += Math.abs(v - prev); prev = v;
      n++;
    }
    if (!n) { min[k] = 0; max[k] = 0; continue; }
    min[k] = Math.min(0, mn); max[k] = Math.max(0, mx);
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

function envelopePath(top, bot, n, H) {
  const mid = H / 2, amp = H / 2 - 0.5;
  let up = '', down = '';
  for (let k = 0; k < n; k++) {
    up += ' ' + k + ',' + P(mid - lift(top[k]) * amp);
    down = ' ' + k + ',' + P(mid + lift(bot[k]) * amp) + down;
  }
  return 'M0,' + mid + ' L' + up + ' L' + (n - 1) + ',' + mid + ' L' + down + ' Z';
}

function symPath(vals, n, H, gain) {
  const mid = H / 2, amp = H / 2 - 0.5;
  let up = '', down = '';
  for (let k = 0; k < n; k++) {
    const v = Math.min(1, vals[k] * gain) * amp;
    up += ' ' + k + ',' + P(mid - v);
    down = ' ' + k + ',' + P(mid + v) + down;
  }
  return 'M0,' + mid + ' L' + up + ' L' + (n - 1) + ',' + mid + ' L' + down + ' Z';
}

function barsPath(min, max, n, H) {
  const mid = H / 2, amp = H / 2 - 0.5;
  let d = '';
  for (let k = 0; k < n; k++) {
    const t = mid - Math.min(1, lift(max[k])) * amp, b = mid + Math.min(1, lift(min[k])) * amp;
    const h = Math.max(0.8, b - t);
    d += 'M' + k + ',' + P(t) + 'h0.6v' + P(h) + 'h-0.6Z';
  }
  return d;
}

// p1 = peak envelope (outer shape), p2 = body, p3 = highlight
export function wavePaths(bands, style, H) {
  const { min, max, rms, low, high, n } = bands;
  if (style === 'bars') return { p1: barsPath(min, max, n, H), p2: '', p3: symPath(rms, n, H, 1.5) };
  if (style === 'band') return { p1: envelopePath(max, min, n, H), p2: symPath(rms, n, H, 1.5), p3: '' };
  // spectral: peak outline, low-band core, high-frequency sheen
  return { p1: envelopePath(max, min, n, H), p2: symPath(low, n, H, 1.7), p3: symPath(high, n, H, 1.4) };
}
