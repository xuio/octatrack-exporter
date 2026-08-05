import { useCallback, useMemo, useState } from 'react';
import {
  regionsFromTicks, boundariesFor, spmFor, dbToLin, scaleFor, bankPattern,
  measurePeaks, buildStemSlices,
} from '../lib/index.js';

/**
 * Splits the arrangement MIDI into sections. Returns an error string instead of
 * throwing so the tempo screen can show it inline.
 */
export function useRegions({ midi, bpm, demoNames }) {
  const [regions, setRegions] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');

  const confirm = useCallback(() => {
    const tempo = parseFloat(bpm);
    if (!(tempo >= 30 && tempo <= 300)) { setError('BPM must be between 30 and 300.'); return false; }
    const result = regionsFromTicks(midi.ticks, midi.ppq);
    if (result.error) { setError(result.error); return false; }
    if (demoNames) result.regions.forEach((r, i) => { r.name = demoNames[i] || ''; });
    setError('');
    setRegions(result.regions);
    setMeta({ snapped: result.snapped, totalMeasures: result.totalMeasures });
    return true;
  }, [midi, bpm, demoNames]);

  const rename = useCallback((idx, name) => {
    setRegions(list => list && list.map(r => r.idx === idx ? { ...r, name } : r));
  }, []);

  return { regions, meta, error, confirm, rename, reset: () => { setRegions(null); setMeta(null); } };
}

/**
 * The expensive, one-off part of analysis: the measure grid and each stem's
 * per-measure peaks. Slice positions are *not* part of this — they are derived
 * from it, so changing the threshold or editing a clip never re-analyses audio.
 */
export function useAnalysisBase() {
  const [base, setBase] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');

  const run = useCallback(async ({ stems, regions, meta, bpm }) => {
    setAnalyzing(true);
    setProgress('Computing measure grid…');
    await new Promise(r => setTimeout(r, 20));

    const warnings = [];
    let total = meta.totalMeasures;
    let bounds = boundariesFor(bpm, total);
    const frames = stems[0].frames;

    if (bounds[total] > frames) {
      let n = total;
      while (n > 0 && bounds[n] > frames) n--;
      warnings.push(`MIDI song end (bar ${total + 1}) lies beyond the audio — analysis clamped to bar ${n + 1}. Check the BPM.`);
      total = n;
      bounds = boundariesFor(bpm, total);
    } else if (frames - bounds[total] > spmFor(bpm)) {
      warnings.push(`Audio continues ${Math.floor((frames - bounds[total]) / spmFor(bpm))} bars past the MIDI song end — the excess is ignored.`);
    }

    const regs = regions
      .filter(r => r.start < total)
      .map(r => r.end > total
        ? { ...r, end: total, len: total - r.start, scale: scaleFor(total - r.start) }
        : r);

    const peaks = new Map();
    for (let i = 0; i < stems.length; i++) {
      setProgress(`Analyzing ${stems[i].name} (${i + 1}/${stems.length})…`);
      await new Promise(r => setTimeout(r, 20));
      peaks.set(stems[i].id, measurePeaks(stems[i].chL, stems[i].chR, bounds));
    }

    if (regs.some(r => !r.scale.ok)) warnings.push('Regions over 32 bars cannot be represented as a single pattern — split them in the arrangement MIDI.');
    if (meta.snapped > 0) warnings.push(`${meta.snapped} MIDI note(s) were not exactly on a bar line — snapped to the nearest measure.`);
    if (regs.length > 32) warnings.push(`${regs.length} regions — patterns roll on past Bank 3 (${bankPattern(regs.length).bp} last).`);

    setBase({ bounds, total, regs, peaks, warnings, bpm });
    setAnalyzing(false);
    return { bounds, total, regs, peaks, warnings, bpm };
  }, []);

  const renameRegion = useCallback((idx, name) => {
    setBase(prev => prev && { ...prev, regs: prev.regs.map(r => r.idx === idx ? { ...r, name } : r) });
  }, []);

  return { base, analyzing, progress, run, renameRegion, reset: () => setBase(null) };
}

/**
 * Slices for every stem, derived from the analysis, the loudness threshold and
 * the manual edits. Pure and memoized: any of those changing re-derives, which
 * is what keeps the timeline, the exports and the audio engine in step.
 */
export function useTracks({ base, stems, threshold, edits }) {
  return useMemo(() => {
    const tracks = new Map();
    if (!base) return { tracks, warnings: [] };
    const thLin = dbToLin(threshold);
    const warnings = [...base.warnings];
    for (const stem of stems) {
      const peaks = base.peaks.get(stem.id);
      if (!peaks) continue;
      const built = buildStemSlices(peaks, base.regs, base.bounds, thLin, edits[stem.id] || {});
      tracks.set(stem.id, built);
      if (!built.slices.length) warnings.push(`${stem.name} has no slices at this threshold — no files will be exported for it.`);
      if (built.slices.length > 64) warnings.push(`${stem.name}: ${built.slices.length} slices exceeds the Octatrack limit of 64 — the .ot file keeps the first 64.`);
    }
    return { tracks, warnings };
  }, [base, stems, threshold, edits]);
}
