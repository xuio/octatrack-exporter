import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine.js';
import { spmFor } from '../lib/index.js';
import { isAudible } from './useStems.js';

/**
 * Musical transport on top of the sample-domain AudioEngine: bars in, bars out.
 * The engine instance lives for the lifetime of the app; React only tells it
 * what to play and when.
 */
export function useTransport({ stems, mixer, tracks, base, volume }) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startBar, setStartBar] = useState(1);
  const [loopRegionIdx, setLoopRegionIdx] = useState(null);
  const [loopBars, setLoopBars] = useState(null);   // { a, b } bar range loop, 0-based, b exclusive

  // Where a pause froze the playhead. A ref rather than state because the
  // per-frame paint reads it and must not re-render to see it.
  const pausedSampleRef = useRef(null);

  const spm = base ? spmFor(base.bpm) : 0;
  const barToSample = useCallback(bar => (base ? base.bounds[Math.max(0, Math.min(base.total, bar))] : 0), [base]);

  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => { engine.setVolume(volume); }, [engine, volume]);

  // What each track plays. Rebuilt whenever the slices change; the engine
  // re-cues in place if it is running, which is what makes edits audible at once.
  const program = useMemo(() => {
    const mixed = stems.map(s => ({ ...s, ...(mixer[s.id] || {}) }));
    return mixed.map(stem => ({
      id: stem.id,
      chL: stem.chL,
      chR: stem.chR,
      frames: stem.frames,
      audible: isAudible(stem, mixed),
      slices: tracks.get(stem.id)?.slices || [],
    }));
  }, [stems, mixer, tracks]);

  const programRef = useRef(program);
  programRef.current = program;

  useEffect(() => { engine.setProgram(programRef.current); }, [engine, tracks]);
  useEffect(() => { engine.setAudible(programRef.current); }, [engine, mixer, stems]);
  useEffect(() => { engine.releaseBuffers(); }, [engine, base]);

  const clearPause = useCallback(() => { pausedSampleRef.current = null; setPaused(false); }, []);

  const stop = useCallback(() => { engine.stop(); setPlaying(false); clearPause(); }, [engine, clearPause]);

  /** The span the transport is currently set to loop, in samples, if any. */
  const loopSpan = useCallback(() => {
    const region = loopRegionIdx != null ? base?.regs.find(r => r.idx === loopRegionIdx) : null;
    if (region) return { start: barToSample(region.start), end: barToSample(region.end) };
    if (loopBars) return { start: barToSample(loopBars.a), end: barToSample(loopBars.b) };
    return null;
  }, [base, loopRegionIdx, loopBars, barToSample]);

  /** Play from a bar — or, called bare after a pause, resume where it froze. */
  const play = useCallback((fromBar) => {
    if (!base) return;
    const frozen = fromBar == null ? pausedSampleRef.current : null;
    // an edit may have shortened the song while it was paused
    const resume = frozen == null ? null : Math.max(0, Math.min(base.bounds[base.total] - 1, frozen));
    const from = resume ?? barToSample((fromBar ?? startBar) - 1);
    const loop = loopSpan();
    engine.play(loop ? { loop, from } : { from });
    setPlaying(true);
    clearPause();
  }, [engine, base, startBar, loopSpan, barToSample, clearPause]);

  /** Freeze where it is; `play()` picks up from exactly there. */
  const pause = useCallback(() => {
    const pos = engine.pause();
    if (pos == null) return;
    pausedSampleRef.current = pos;
    setPaused(true);
    setPlaying(false);
  }, [engine]);

  const toggle = useCallback(() => { playing ? pause() : play(); }, [playing, pause, play]);

  const positionSamples = useCallback(
    () => engine.position(pausedSampleRef.current ?? barToSample(startBar - 1)),
    [engine, barToSample, startBar],
  );

  /** Stop at the end of the song (loops keep going). */
  const checkEnd = useCallback(() => {
    if (!playing || engine.loop || !base) return;
    if (engine.position() >= base.bounds[base.total]) stop();
  }, [playing, engine, base, stop]);

  const seekToBar = useCallback((bar, { keepLoop = false } = {}) => {
    const clamped = Math.max(0, Math.min((base?.total ?? 1) - 1, bar));
    setStartBar(clamped + 1);
    if (playing) engine.seek(barToSample(clamped));
    if (!keepLoop && !engine.loop) { setLoopRegionIdx(null); setLoopBars(null); }
  }, [engine, base, playing, barToSample]);

  /** Leave the loop but keep playing from where it is. */
  const releaseLoop = useCallback(() => {
    const pos = engine.releaseLoop();
    setLoopRegionIdx(null);
    setLoopBars(null);
    if (pos != null && spm) setStartBar(Math.min(base.total, Math.floor(pos / spm) + 1));
  }, [engine, base, spm]);

  /**
   * Start looping a span of samples: joined in place when the playhead is
   * already inside it, swapped straight over when another loop is running
   * (like selecting a new pattern on the device), cued otherwise.
   */
  const cueLoop = useCallback((start, end, fromBar) => {
    if (engine.moveLoop(start, end)) return;
    if (engine.joinLoop(start, end)) return;
    engine.stop();
    engine.play({ loop: { start, end } });
    setStartBar(fromBar + 1);
    setPlaying(true);
    clearPause();
  }, [engine, clearPause]);

  /** Loop a section. Sections and bar ranges are mutually exclusive. */
  const loopRegion = useCallback((region) => {
    if (loopRegionIdx === region.idx) { releaseLoop(); return; }
    cueLoop(barToSample(region.start), barToSample(region.end), region.start);
    setLoopRegionIdx(region.idx);
    setLoopBars(null);
  }, [loopRegionIdx, releaseLoop, cueLoop, barToSample]);

  /** Loop an arbitrary bar range (0-based, at least one bar long). */
  const loopRange = useCallback((barA, barB) => {
    if (!base) return;
    const a = Math.max(0, Math.min(base.total - 1, Math.min(barA, barB)));
    const b = Math.max(a + 1, Math.min(base.total, Math.max(barA, barB)));
    cueLoop(barToSample(a), barToSample(b), a);
    setLoopBars({ a, b });
    setLoopRegionIdx(null);
  }, [base, cueLoop, barToSample]);

  /** Step the section loop to the previous / next pattern, still playing. */
  const stepLoopSection = useCallback((delta) => {
    if (!base?.regs.length) return;
    const at = base.regs.findIndex(r => r.idx === loopRegionIdx);
    const next = base.regs[Math.max(0, Math.min(base.regs.length - 1, (at < 0 ? 0 : at) + delta))];
    if (!next || next.idx === loopRegionIdx) return;
    cueLoop(barToSample(next.start), barToSample(next.end), next.start);
    setLoopRegionIdx(next.idx);
    setLoopBars(null);
  }, [base, loopRegionIdx, cueLoop, barToSample]);

  const audition = useCallback((stemId, slice) => {
    engine.auditionSlice(stemId, slice);
    setPlaying(false);
    clearPause();
  }, [engine, clearPause]);

  return {
    engine, playing, paused, startBar, setStartBar, loopRegionIdx, loopBars,
    play, pause, stop, toggle, seekToBar, loopRegion, loopRange, stepLoopSection, releaseLoop, audition,
    positionSamples, checkEnd, spm,
    barToSample,
  };
}
