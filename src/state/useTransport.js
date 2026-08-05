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
  const [startBar, setStartBar] = useState(1);
  const [loopRegionIdx, setLoopRegionIdx] = useState(null);

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

  const stop = useCallback(() => { engine.stop(); setPlaying(false); }, [engine]);

  const play = useCallback((fromBar = startBar) => {
    if (!base) return;
    const region = loopRegionIdx != null ? base.regs.find(r => r.idx === loopRegionIdx) : null;
    engine.play(region
      ? { loop: { start: barToSample(region.start), end: barToSample(region.end) } }
      : { from: barToSample(fromBar - 1) });
    setPlaying(true);
  }, [engine, base, startBar, loopRegionIdx, barToSample]);

  const toggle = useCallback(() => { playing ? stop() : play(); }, [playing, stop, play]);

  const positionSamples = useCallback(
    () => engine.position(barToSample(startBar - 1)),
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
    if (!keepLoop && !engine.loop) setLoopRegionIdx(null);
  }, [engine, base, playing, barToSample]);

  /** Leave the loop but keep playing from where it is. */
  const releaseLoop = useCallback(() => {
    const pos = engine.releaseLoop();
    setLoopRegionIdx(null);
    if (pos != null && spm) setStartBar(Math.min(base.total, Math.floor(pos / spm) + 1));
  }, [engine, base, spm]);

  /** Loop a section, joining it seamlessly if the playhead is already inside. */
  const loopRegion = useCallback((region) => {
    if (loopRegionIdx === region.idx) { releaseLoop(); return; }
    const start = barToSample(region.start), end = barToSample(region.end);
    if (engine.joinLoop(start, end)) { setLoopRegionIdx(region.idx); return; }
    engine.stop();
    engine.play({ loop: { start, end } });
    setLoopRegionIdx(region.idx);
    setStartBar(region.start + 1);
    setPlaying(true);
  }, [engine, loopRegionIdx, releaseLoop, barToSample]);

  const audition = useCallback((stemId, slice) => {
    engine.auditionSlice(stemId, slice);
    setPlaying(false);
  }, [engine]);

  return {
    engine, playing, startBar, setStartBar, loopRegionIdx,
    play, stop, toggle, seekToBar, loopRegion, releaseLoop, audition,
    positionSamples, checkEnd, spm,
    barToSample,
  };
}
