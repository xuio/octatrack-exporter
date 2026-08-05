import { useCallback, useRef, useState } from 'react';

const MIN_PPM = 2;
const MAX_PPM = 160;

/**
 * Zoom, scroll and the follow-the-playhead behaviour of the timeline.
 * The scroll container is held as a ref so the playhead can be painted every
 * frame without re-rendering React.
 */
export function useTimelineView({ follow, setFollow, playing }) {
  const [ppm, setPpm] = useState(16);
  const [viewport, setViewport] = useState({ scrollX: 0, width: 0 });
  const scrollerRef = useRef(null);
  const pendingScroll = useRef(false);

  const attachScroller = useCallback((el) => {
    if (scrollerRef.current === el) return;
    scrollerRef.current = el;
    if (el) setViewport(v => (v.width ? v : { scrollX: el.scrollLeft, width: el.clientWidth }));
  }, []);

  const onScroll = useCallback(() => {
    if (pendingScroll.current) return;
    pendingScroll.current = true;
    requestAnimationFrame(() => {
      pendingScroll.current = false;
      const el = scrollerRef.current;
      if (!el) return;
      setViewport(v => (Math.abs(el.scrollLeft - v.scrollX) > 24 || el.clientWidth !== v.width
        ? { scrollX: el.scrollLeft, width: el.clientWidth }
        : v));
    });
  }, []);

  /** Zoom around a screen position so the bar under the cursor stays put. */
  const zoomAt = useCallback((clientX, factor) => {
    const el = scrollerRef.current;
    setPpm(current => {
      const next = Math.max(MIN_PPM, Math.min(MAX_PPM, current * factor));
      if (!el || next === current) return next;
      const rect = el.getBoundingClientRect();
      const anchor = Math.max(0, Math.min(rect.width, (clientX ?? rect.left + rect.width / 2) - rect.left));
      const bar = (el.scrollLeft + anchor) / current;
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, bar * next - anchor);
        setViewport({ scrollX: el.scrollLeft, width: el.clientWidth });
      });
      return next;
    });
  }, []);

  const zoomToFit = useCallback((totalBars) => {
    const width = (scrollerRef.current?.clientWidth || window.innerWidth - 200) - 10;
    setPpm(Math.max(MIN_PPM, Math.min(30, Math.floor(width / Math.max(1, totalBars)))));
  }, []);

  /**
   * Trackpad pinch arrives as a wheel event with ctrlKey; a horizontal wheel
   * means the user is driving the view, so stop following the playhead.
   */
  const onWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomAt(e.clientX, Math.exp(-e.deltaY * 0.01));
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && follow && playing) setFollow(false);
  }, [zoomAt, follow, playing, setFollow]);

  /** Page the view along when the playhead approaches the edge. */
  const keepPlayheadVisible = useCallback((px) => {
    const el = scrollerRef.current;
    if (!el) return;
    const width = el.clientWidth, left = el.scrollLeft;
    if (px < left + width * 0.06 || px > left + width * 0.84) {
      el.scrollLeft = Math.max(0, px - width * 0.25);
    }
  }, []);

  return { ppm, setPpm, viewport, scrollerRef, attachScroller, onScroll, onWheel, zoomAt, zoomToFit, keepPlayheadVisible };
}
