import { meterPos, dbPos, RED_DB, METER_TICKS, CLIP_AMP } from '../lib/meters.js';

export const CLIP_RED = '#e0483c';

/**
 * Per-canvas measurements, kept between frames.
 *
 * `clientWidth` is a layout read: taking it every frame made the eight track
 * scopes and their eight meters force sixteen synchronous layouts of the whole
 * timeline per frame. At 8 stems × 64 sections that measured as the single
 * largest JS cost while scrolling (4.4% of all samples) and cost about a third
 * of the frame rate. A canvas only changes size when something resizes it, so
 * the observer says when to look again.
 */
const FITS = new WeakMap();

/** Sizes the backing store for the device pixel ratio and returns a CSS-pixel context. */
export function fitCanvas(el) {
  let fit = FITS.get(el);
  if (!fit) {
    fit = { w: 0, h: 0, stale: true, ctx: el.getContext('2d') };
    FITS.set(el, fit);
    new ResizeObserver(() => { fit.stale = true; }).observe(el);
  }
  if (fit.stale) {
    fit.stale = false;
    fit.w = el.clientWidth;
    fit.h = el.clientHeight;
  }
  const { ctx, w, h } = fit;
  // Not laid out yet — measure again next frame rather than caching the zero.
  if (!w || !h) { fit.stale = true; return null; }
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (el.width !== bw || el.height !== bh) { el.width = bw; el.height = bh; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function readPeak(analyser, buffer) {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) { const v = Math.abs(buffer[i]); if (v > peak) peak = v; }
  return peak;
}

/** Fast attack / slow release, with a peak that holds then decays. */
export function advanceEnvelope(env, peak) {
  env.level = Math.max(peak, env.level * 0.86);
  if (peak >= CLIP_AMP) env.clipped = true;
  if (peak >= env.hold) { env.hold = peak; env.holdFrames = 40; }
  else if (--env.holdFrames <= 0) env.hold *= 0.94;
  return env;
}

export const newEnvelope = () => ({ level: 0, hold: 0, holdFrames: 0, clipped: false });

/**
 * dBFS-scaled level meter: accent below −3 dBFS, red above, a hard 0 dBFS line
 * and unlabelled tick marks down the scale.
 */
export function drawMeter(canvas, env, { horizontal = false, colors }) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  ctx.clearRect(0, 0, w, h);
  const span = horizontal ? w : h;
  const level = meterPos(env.level), hold = meterPos(env.hold), red = dbPos(RED_DB);

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (const db of METER_TICKS) {
    const p = span * dbPos(db);
    if (horizontal) ctx.fillRect(p, h - 2, 1, 2); else ctx.fillRect(0, h - p, 2, 1);
  }

  const segment = (from, to, color) => {
    if (to <= from) return;
    ctx.fillStyle = color;
    if (horizontal) ctx.fillRect(span * from, 0, span * (to - from), h - 2);
    else ctx.fillRect(2, h - span * to, w - 2, span * (to - from));
  };
  segment(0, Math.min(level, red), colors.accent500);
  segment(red, level, CLIP_RED);

  if (hold > 0.01) {
    ctx.fillStyle = hold >= red ? CLIP_RED : colors.neutral100;
    if (horizontal) ctx.fillRect(Math.min(w - 1.5, span * hold), 0, 1.5, h - 2);
    else ctx.fillRect(2, Math.max(0, h - span * hold - 1.5), w - 2, 1.5);
  }

  ctx.fillStyle = env.clipped ? CLIP_RED : 'rgba(224,72,60,0.45)';
  if (horizontal) ctx.fillRect(w - 1.5, 0, 1.5, h); else ctx.fillRect(0, 0, w, 1.5);
}

/**
 * Oscilloscope over a fixed ~16 ms window, aligned to the steepest rising zero
 * crossing (with sub-sample interpolation) so the trace stands still rather
 * than swimming, drawn as a filled min/max envelope with a soft glow.
 */
export function drawScope(canvas, analyser, buffer, { colors, sampleRate }) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  const mid = h / 2, amp = h / 2 - 1.5;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = colors.neutral800;
  ctx.globalAlpha = 0.55; ctx.fillRect(0, mid - 0.5, w, 1);
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, mid - amp * 0.5, w, 0.5);
  ctx.fillRect(0, mid + amp * 0.5, w, 0.5);
  ctx.globalAlpha = 1;
  if (!analyser) return;

  analyser.getFloatTimeDomainData(buffer);
  const n = buffer.length;
  const window = Math.max(64, Math.min(n >> 1, Math.round(0.016 * sampleRate)));

  let trigger = 0, steepest = 0;
  for (let i = 1; i < n - window; i++) {
    if (buffer[i - 1] <= 0 && buffer[i] > 0) {
      const slope = buffer[i] - buffer[i - 1];
      if (slope > steepest) { steepest = slope; trigger = i; }
    }
  }
  const frac = steepest > 0 ? buffer[trigger - 1] / (buffer[trigger - 1] - buffer[trigger] || 1) : 0;
  const sampleAt = (x) => {
    const p = trigger - 1 + frac + (x / w) * window;
    const i = Math.floor(p), f = p - i;
    const a = buffer[Math.max(0, Math.min(n - 1, i))];
    const b = buffer[Math.max(0, Math.min(n - 1, i + 1))];
    return a + (b - a) * f;
  };

  const step = Math.max(1, Math.round(window / w));
  const top = [], bottom = [];
  for (let x = 0; x <= w; x++) {
    let lo = 1, hi = -1;
    for (let s = 0; s < step; s++) { const v = sampleAt(x + s / step); if (v < lo) lo = v; if (v > hi) hi = v; }
    top.push(mid - Math.max(-1, Math.min(1, hi)) * amp);
    bottom.push(mid - Math.max(-1, Math.min(1, lo)) * amp);
  }

  const path = new Path2D();
  path.moveTo(0, top[0]);
  for (let x = 1; x <= w; x++) path.lineTo(x, top[x]);
  for (let x = w; x >= 0; x--) path.lineTo(x, bottom[x]);
  path.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, colors.accent400);
  grad.addColorStop(0.5, colors.accent500);
  grad.addColorStop(1, colors.accent400);
  ctx.globalAlpha = 0.32; ctx.fillStyle = grad; ctx.fill(path); ctx.globalAlpha = 1;

  ctx.save();
  ctx.shadowColor = colors.accent500;
  ctx.shadowBlur = 4;
  ctx.strokeStyle = colors.accent300;
  ctx.lineWidth = 1.1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** Log-spaced spectrum from real dB values, with decaying peak caps. */
export function drawSpectrum(canvas, analyser, buffer, peaks, { colors, sampleRate }) {
  const fit = fitCanvas(canvas);
  if (!fit) return null;
  const { ctx, w, h } = fit;
  ctx.clearRect(0, 0, w, h);
  if (!analyser) return null;

  analyser.getFloatFrequencyData(buffer);
  const bins = buffer.length, nyquist = sampleRate / 2;
  const fMin = 30, fMax = Math.min(16000, nyquist);
  const bars = Math.max(10, Math.min(56, Math.floor(w / 2.5)));
  const barW = w / bars;
  const caps = peaks && peaks.length === bars ? peaks : new Float32Array(bars);

  for (let i = 0; i < bars; i++) {
    const fa = fMin * Math.pow(fMax / fMin, i / bars);
    const fb = fMin * Math.pow(fMax / fMin, (i + 1) / bars);
    const b0 = Math.max(1, Math.floor(fa / nyquist * bins));
    const b1 = Math.max(b0 + 1, Math.ceil(fb / nyquist * bins));
    let db = -Infinity;
    for (let b = b0; b < b1 && b < bins; b++) if (buffer[b] > db) db = buffer[b];
    const v = Math.max(0, Math.min(1, (db + 92) / 78));   // −92…−14 dBFS → 0…1
    caps[i] = v >= caps[i] ? v : caps[i] * 0.93;

    const barH = v * (h - 2);
    if (barH > 0.4) {
      const g = ctx.createLinearGradient(0, h, 0, h - barH);
      g.addColorStop(0, colors.accent800);
      g.addColorStop(0.55, colors.accent500);
      g.addColorStop(1, v > 0.78 ? colors.accent200 : colors.accent400);
      ctx.fillStyle = g;
      ctx.fillRect(i * barW + 0.5, h - barH, Math.max(1, barW - 1.2), barH);
    }
    if (caps[i] > 0.02) {
      ctx.fillStyle = colors.accent300;
      ctx.fillRect(i * barW + 0.5, Math.max(0, h - caps[i] * (h - 2) - 1), Math.max(1, barW - 1.2), 1);
    }
  }
  return caps;
}
