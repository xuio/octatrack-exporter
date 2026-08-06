// Readouts the transport paints every frame. Kept here (pure, DOM-free) because
// the trig-step math has to agree with what the exporter writes into the
// pattern — the preview is only useful if it is the device's own arithmetic.

/**
 * The trig step a bar lands on inside its pattern, 1-based.
 * Mirrors `trigStep` in midi.js, but clamped to the pattern length: a section
 * longer than its scale can address keeps reading the last step instead of
 * running off the end.
 * @param {import('./types.js').Region} region
 * @param {number} bar absolute bar, 0-based, may be fractional
 */
export const patternStepAt = (region, bar) => {
  const inRegion = Math.max(0, Math.min(region.len - 1e-9, bar - region.start));
  return Math.max(1, Math.min(region.scale.LEN, Math.floor(inRegion * region.scale.steps) + 1));
};

/** `B2 P3 · 1/2x · step 12/32` — what the Octatrack would be showing. */
export const patternReadout = (region, bar) =>
  `${region.bp} · ${region.scale.mult} · step ${patternStepAt(region, bar)}/${region.scale.LEN}`;

/** Elapsed time as `m:ss.d` (tenths), for the clock next to the bar position. */
export const formatClock = (seconds) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${String(Math.floor(rest)).padStart(2, '0')}.${Math.floor((rest % 1) * 10)}`;
};

/** `bars 5–9` — the label a bar-range loop shows in the transport. */
export const rangeLabel = (a, b) => `bars ${a + 1}–${b}`;
