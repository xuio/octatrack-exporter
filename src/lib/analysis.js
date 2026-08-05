// Per-measure peak analysis (for silence trimming) and waveform rendering
// (Pioneer-style band/spectral/bars paths for the timeline slice blocks).

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

// Waveform detail follows zoom: pick a power-of-two bucket count near the slice's
// on-screen width, so paths stay cacheable across small zoom steps.
export function bucketTier(px) {
  const want = Math.max(32, Math.min(2048, px));
  return Math.max(64, Math.min(2048, Math.pow(2, Math.round(Math.log2(want)))));
}

export function waveBands(chL, chR, s0, s1, buckets) {
  const n = Math.max(2, buckets), len = s1 - s0;
  const peak = new Float32Array(n), low = new Float32Array(n), high = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = s0 + Math.floor(k * len / n), b = Math.max(a + 1, s0 + Math.floor((k + 1) * len / n));
    // peak over the bucket (strided is fine for a max)
    const step = Math.max(1, Math.floor((b - a) / 48));
    let pk = 0;
    for (let i = a; i < b; i += step) { const ax = Math.abs((chL[i] + chR[i]) * 0.5); if (ax > pk) pk = ax; }
    // band metrics over a short CONTIGUOUS run so lp/prev see adjacent samples
    const runLen = Math.min(192, b - a), r0 = a + ((b - a - runLen) >> 1);
    let lp = (chL[r0] + chR[r0]) * 0.5, prev = lp, lo = 0, hi = 0;
    for (let i = r0; i < r0 + runLen; i++) {
      const x = (chL[i] + chR[i]) * 0.5;
      lp += 0.055 * (x - lp); // one-pole LP ≈ 400 Hz at 44.1k
      lo += Math.abs(lp); hi += Math.abs(x - prev); prev = x;
    }
    const pkN = Math.min(1, Math.pow(pk, 0.7));
    peak[k] = pkN;
    low[k] = Math.min(pkN, Math.pow(lo / runLen * 2.2, 0.7));
    high[k] = Math.min(pkN, Math.pow(hi / runLen * 3.5, 0.7));
  }
  return { peak, low, high, n };
}

function envPath(vals, n, H, scale) {
  const mid = H / 2, amp = H / 2;
  let top = '', bot = '';
  for (let k = 0; k < n; k++) { const v = Math.min(1, vals[k] * scale) * amp; top += ' ' + k + ',' + (mid - v).toFixed(1); bot = ' ' + k + ',' + (mid + v).toFixed(1) + bot; }
  return 'M0,' + mid + ' L' + top + ' L' + (n - 1) + ',' + mid + ' L' + bot + ' Z';
}

function barsPath(vals, n, H, scale) {
  const mid = H / 2, amp = H / 2;
  let d = '';
  for (let k = 0; k < n; k++) { const v = Math.max(0.02, Math.min(1, vals[k] * scale)) * amp; d += 'M' + k + ',' + (mid - v).toFixed(1) + 'h0.62v' + (2 * v).toFixed(1) + 'h-0.62Z'; }
  return d;
}

export function wavePaths(bands, style, H) {
  const { peak, low, high, n } = bands;
  if (style === 'bars') return { p1: barsPath(peak, n, H, 1), p2: '', p3: barsPath(high, n, H, 0.55) };
  if (style === 'band') return { p1: envPath(peak, n, H, 1), p2: '', p3: '' };
  return { p1: envPath(peak, n, H, 1), p2: envPath(low, n, H, 0.95), p3: envPath(high, n, H, 0.65) }; // spectral
}
