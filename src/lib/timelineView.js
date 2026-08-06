// The timeline's *view* — zoom math and the slice of it a session remembers.
// Pure and DOM-free so both the hook and the tests can use the same arithmetic.

export const MIN_PPM = 2;
export const MAX_PPM = 160;

/** Pixels per measure, held inside what the timeline can actually draw. */
export const clampPpm = (ppm) => Math.max(MIN_PPM, Math.min(MAX_PPM, ppm));

/**
 * The zoom that makes `bars` fill `fill` of a viewport `width` pixels wide.
 * Leaving a fifth of the width spare is what keeps the neighbouring sections
 * visible, so a framed section still reads as part of the song.
 */
export const ppmForRange = (bars, width, fill = 0.8) =>
  clampPpm((Math.max(1, width) * fill) / Math.max(1, bars));

// Bar numbers are only useful as landmarks, so the step jumps in musical
// powers of two rather than whatever divides evenly.
const LABEL_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

/**
 * How many bars to skip between overview labels so they stay at least `minGap`
 * pixels apart — every 8 bars on a short song, every 16 or more on a long one.
 */
export const barLabelStep = (totalBars, width, minGap = 46) => {
  const perBar = Math.max(1, width) / Math.max(1, totalBars);
  return LABEL_STEPS.find(step => step * perBar >= minGap) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
};

/**
 * @typedef {object} ViewState
 * @property {number|null} ppm
 * @property {number} scrollX
 * @property {{stemIndex: number, regionIdx: number}|null} selected
 * @property {{regionIdx?: number, a?: number, b?: number}|null} loop
 * @property {number} startBar
 */

/**
 * Check a stored view against the material that is loaded now.
 *
 * A session snapshot is tied to the stem *files*, not to the analysis, so the
 * song can come back with a different tempo and therefore a different number of
 * bars and sections. Anything that no longer points at something real is
 * dropped rather than restored onto the wrong clip.
 *
 * Returns null for a snapshot saved before view state existed — old sessions
 * must still load, they just have nothing to say about the view.
 *
 * @param {any} view
 * @param {{stemCount: number, regionIdxs: number[], totalBars: number}} material
 * @returns {ViewState|null}
 */
export function restorableView(view, { stemCount, regionIdxs, totalBars }) {
  if (!view || typeof view !== 'object') return null;

  const sel = view.selected;
  const selected = sel && Number.isInteger(sel.stemIndex) && sel.stemIndex >= 0 && sel.stemIndex < stemCount
    && regionIdxs.includes(sel.regionIdx)
    ? { stemIndex: sel.stemIndex, regionIdx: sel.regionIdx }
    : null;

  let loop = null;
  if (view.loop && regionIdxs.includes(view.loop.regionIdx)) {
    loop = { regionIdx: view.loop.regionIdx };
  } else if (view.loop && Number.isFinite(view.loop.a) && Number.isFinite(view.loop.b)) {
    const a = Math.max(0, Math.min(totalBars - 1, view.loop.a));
    const b = Math.max(a + 1, Math.min(totalBars, view.loop.b));
    loop = { a, b };
  }

  return {
    ppm: Number.isFinite(view.ppm) ? clampPpm(view.ppm) : null,
    scrollX: Number.isFinite(view.scrollX) ? Math.max(0, view.scrollX) : 0,
    selected,
    loop,
    startBar: Number.isFinite(view.startBar) ? Math.max(1, Math.min(totalBars, Math.round(view.startBar))) : 1,
  };
}
