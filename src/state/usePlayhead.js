import { useCallback, useEffect, useRef } from 'react';
import { useAnimationFrame } from './useAnimationFrame.js';
import { formatClock, patternReadout, SR } from '../lib/index.js';

// Bar boundaries are rounded to whole samples, so a position sitting exactly on
// a bar can land a hair below it; the epsilon (a fifth of a millisecond) keeps
// the readout from showing the previous bar's last beat.
const formatPosition = (bars) => {
  const b = bars + 1e-4;
  return `${String(Math.floor(b) + 1).padStart(3, '0')}.${Math.floor((b % 1) * 4) + 1}`;
};

/**
 * Paints the playhead, the overview marker, the position/time readouts and the
 * device's pattern position straight to the DOM every frame. Deliberately
 * outside React state — at 60 fps a re-render per frame would make the timeline
 * unusable.
 */
export function usePlayhead({ transport, refs, ppm, totalBars, follow, keepPlayheadVisible, active, loopRegion }) {
  const spm = transport.spm;

  // Read through a ref so the paint callback survives a loop change without
  // being rebuilt (and without the animation loop restarting).
  const loopRegionRef = useRef(loopRegion);
  loopRegionRef.current = loopRegion;

  const paintBars = useCallback((bars) => {
    const px = bars * ppm;
    if (refs.playhead.current) refs.playhead.current.style.transform = `translateX(${px}px)`;
    if (refs.overviewPlayhead.current) refs.overviewPlayhead.current.style.left = `${(bars / totalBars) * 100}%`;
    if (refs.position.current) refs.position.current.textContent = formatPosition(bars);
    if (refs.time.current) refs.time.current.textContent = formatClock(bars * spm / SR);
    const region = loopRegionRef.current;
    if (refs.pattern.current && region) refs.pattern.current.textContent = patternReadout(region, bars);
    if (follow && transport.playing) keepPlayheadVisible(px);
  }, [ppm, spm, totalBars, follow, keepPlayheadVisible, refs, transport.playing]);

  useAnimationFrame(active && transport.playing, () => {
    transport.checkEnd();
    if (spm) paintBars(transport.positionSamples() / spm);
  });

  // Keep the marker honest when the transport is idle (seek, zoom, stop) — and
  // parked where it froze when the transport is paused, which is what
  // positionSamples reports while stopped.
  useEffect(() => {
    if (!transport.playing && spm) paintBars(transport.positionSamples() / spm);
  }, [transport.playing, transport.paused, transport.startBar, ppm, spm, paintBars, transport]);

  return paintBars;
}

/**
 * Keeps the overview's viewport rectangle in step with the scroller.
 *
 * The numbers come from `viewport` state rather than from `scrollLeft` and
 * `clientWidth`: reading those here ran a synchronous layout of the whole
 * timeline on every scroll tick, which at 8 stems × 64 sections was 3.7% of all
 * samples taken while scrolling. The state is the same pair of numbers, only
 * coalesced to 24px steps — finer than this indicator can draw.
 */
export function useViewportIndicator({ refs, ppm, totalBars, viewport }) {
  useEffect(() => {
    const box = refs.overviewViewport.current;
    if (!box) return;
    const width = totalBars * ppm || 1;
    box.style.left = `${Math.max(0, Math.min(100, (viewport.scrollX / width) * 100))}%`;
    box.style.width = `${Math.max(1.5, Math.min(100, (viewport.width / width) * 100))}%`;
  }, [refs, ppm, totalBars, viewport]);
}

/** Bundles the DOM handles the timeline paints into. */
export function useTimelineRefs(attachScroller, scrollerRef) {
  const playhead = useRef(null);
  const overviewPlayhead = useRef(null);
  const overviewViewport = useRef(null);
  const overview = useRef(null);
  const position = useRef(null);
  const time = useRef(null);
  const pattern = useRef(null);
  const loopBrace = useRef(null);
  return {
    playhead, overviewPlayhead, overviewViewport, overview, position, time, pattern, loopBrace,
    scroller: scrollerRef, attachScroller,
  };
}
