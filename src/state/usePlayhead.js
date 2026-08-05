import { useCallback, useEffect, useRef } from 'react';
import { useAnimationFrame } from './useAnimationFrame.js';

const formatPosition = bars =>
  `${String(Math.floor(bars) + 1).padStart(3, '0')}.${Math.floor((bars % 1) * 4) + 1}`;

/**
 * Paints the playhead, the overview marker and the position readout straight to
 * the DOM every frame. Deliberately outside React state — at 60 fps a re-render
 * per frame would make the timeline unusable.
 */
export function usePlayhead({ transport, refs, ppm, totalBars, follow, keepPlayheadVisible, active }) {
  const spm = transport.spm;

  const paintBars = useCallback((bars) => {
    const px = bars * ppm;
    if (refs.playhead.current) refs.playhead.current.style.transform = `translateX(${px}px)`;
    if (refs.overviewPlayhead.current) refs.overviewPlayhead.current.style.left = `${(bars / totalBars) * 100}%`;
    if (refs.position.current) refs.position.current.textContent = formatPosition(bars);
    if (follow && transport.playing) keepPlayheadVisible(px);
  }, [ppm, totalBars, follow, keepPlayheadVisible, refs, transport.playing]);

  useAnimationFrame(active && transport.playing, () => {
    transport.checkEnd();
    if (spm) paintBars(transport.positionSamples() / spm);
  });

  // Keep the marker honest when the transport is idle (seek, zoom, stop).
  useEffect(() => {
    if (!transport.playing && spm) paintBars(transport.barToSample(transport.startBar - 1) / spm);
  }, [transport.playing, transport.startBar, ppm, spm, paintBars, transport]);

  return paintBars;
}

/** Keeps the overview's viewport rectangle in step with the scroller. */
export function useViewportIndicator({ refs, scrollerRef, ppm, totalBars, viewport }) {
  const sync = useCallback(() => {
    const el = scrollerRef.current, box = refs.overviewViewport.current;
    if (!el || !box) return;
    const width = totalBars * ppm || 1;
    box.style.left = `${Math.max(0, Math.min(100, (el.scrollLeft / width) * 100))}%`;
    box.style.width = `${Math.max(1.5, Math.min(100, (el.clientWidth / width) * 100))}%`;
  }, [refs, scrollerRef, ppm, totalBars]);

  useEffect(sync, [sync, viewport]);
  return sync;
}

/** Bundles the DOM handles the timeline paints into. */
export function useTimelineRefs(attachScroller, scrollerRef) {
  const playhead = useRef(null);
  const overviewPlayhead = useRef(null);
  const overviewViewport = useRef(null);
  const overview = useRef(null);
  const position = useRef(null);
  return { playhead, overviewPlayhead, overviewViewport, overview, position, scroller: scrollerRef, attachScroller };
}
