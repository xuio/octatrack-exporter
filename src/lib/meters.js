// Meter scaling. Levels are shown on a dBFS scale (linear amplitude reads
// almost everything as "near the bottom"), with an Ableton-style red zone at
// the top and a hard 0 dBFS line.
export const METER_MIN_DB = -60;
export const RED_DB = -3;                                  // red zone starts here
export const METER_TICKS = [-6, -12, -18, -24, -36, -48];  // unlabelled marks on track meters
export const MASTER_TICKS = [0, -6, -12, -24, -36, -48];   // labelled on the master meter

// linear amplitude → 0..1 position on the meter (0 = −60 dBFS, 1 = 0 dBFS)
export function meterPos(amp) {
  if (!(amp > 0)) return 0;
  const db = 20 * Math.log10(amp);
  return Math.max(0, Math.min(1, (db - METER_MIN_DB) / -METER_MIN_DB));
}
export const dbPos = db => Math.max(0, Math.min(1, (db - METER_MIN_DB) / -METER_MIN_DB));
export const CLIP_AMP = 0.999;                             // ≥ this counts as clipped
export const fmtDb = amp => !(amp > 0) ? '−∞' : (20 * Math.log10(amp)).toFixed(1);
