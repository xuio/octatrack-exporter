// Finding a quiet place to cut.
//
// The Octatrack plays slices raw — no fade in, no fade out — so a slice point
// that lands mid-waveform steps the DAC from whatever the sample was straight to
// the next slice's first sample, and that step is the click. Moving the cut to a
// sample where the signal already passes through zero removes the step without
// touching a single sample value.
//
// The signal considered is the stereo sum: both channels leave the same output
// pair on the device, so a crossing that only exists in one of them is not one.

/** ~10 ms at 44.1 kHz — far enough to find a crossing, near enough to stay musical. */
export const ZC_WINDOW = 441;

/**
 * The sample nearest `at` where the stereo signal changes sign, searching both
 * directions within `windowSamples`. Falls back to the quietest sample in the
 * window when the signal never crosses there (a DC-offset or fully rectified
 * passage), which is still the least audible cut available.
 *
 * @param {Float32Array} chL
 * @param {Float32Array} chR
 * @param {number} at            sample index to search around
 * @param {number} [windowSamples]
 * @returns {number} a sample index inside the array
 */
export function nearestZeroCrossing(chL, chR, at, windowSamples = ZC_WINDOW) {
  const n = Math.min(chL.length, chR ? chR.length : chL.length);
  if (!n) return 0;
  const target = Math.max(0, Math.min(n - 1, Math.round(at)));
  const w = Math.max(1, Math.round(windowSamples));
  const lo = Math.max(0, target - w), hi = Math.min(n - 1, target + w);
  const mono = chR ? (i => (chL[i] + chR[i]) / 2) : (i => chL[i]);

  let best = -1, bestDist = Infinity;      // nearest true crossing
  let quiet = lo, quietest = Infinity;     // fallback: minimum |signal|
  let prev = mono(lo);

  const offer = (i) => {
    const d = Math.abs(i - target);
    if (d < bestDist) { bestDist = d; best = i; }
  };
  if (prev === 0) offer(lo);
  quietest = Math.abs(prev);

  for (let i = lo + 1; i <= hi; i++) {
    const v = mono(i);
    const a = Math.abs(v);
    // ties go to the sample nearest `at` — on a flat passage that is the edge
    // the user pointed at rather than the left end of the window
    if (a < quietest || (a === quietest && Math.abs(i - target) < Math.abs(quiet - target))) { quietest = a; quiet = i; }
    // A crossing lives between two samples; cut at whichever side is closer to
    // zero, since that is the sample the device actually plays or stops at.
    if (v === 0) offer(i);
    else if ((prev < 0 && v > 0) || (prev > 0 && v < 0)) offer(Math.abs(prev) <= a ? i - 1 : i);
    prev = v;
  }

  return best >= 0 ? best : quiet;
}
