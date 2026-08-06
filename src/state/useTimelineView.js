import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_PPM, MAX_PPM, clampPpm, ppmForRange } from '../lib/index.js';

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

  // `viewport` is now the only record of how wide the scroller is (the overview
  // indicator reads it instead of measuring the DOM every scroll tick), so a
  // window resize has to reach it even though it fires no scroll event.
  useEffect(() => {
    const onResize = () => {
      const el = scrollerRef.current;
      if (el) setViewport({ scrollX: el.scrollLeft, width: el.clientWidth });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
   * Frame a bar range: zoom until it fills most of the viewport and put it in
   * the middle. Double-clicking a section in the overview lands here.
   */
  const zoomToRange = useCallback((barA, barB) => {
    const el = scrollerRef.current;
    const width = el?.clientWidth || 1200;
    const bars = Math.max(1, barB - barA);
    const next = ppmForRange(bars, width);
    setPpm(next);
    // The scroller has not been laid out at the new zoom yet, so the scroll
    // position has to wait a frame — same dance as zoomAt.
    requestAnimationFrame(() => {
      if (!el) return;
      el.scrollLeft = Math.max(0, barA * next - Math.max(0, width - bars * next) / 2);
      setViewport({ scrollX: el.scrollLeft, width: el.clientWidth });
    });
    return next;
  }, []);

  /** Put zoom and scroll back where a restored session left them. */
  const restoreView = useCallback(({ ppm: nextPpm, scrollX }) => {
    if (Number.isFinite(nextPpm)) setPpm(clampPpm(nextPpm));
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (!el) return;
      if (Number.isFinite(scrollX)) el.scrollLeft = Math.max(0, scrollX);
      setViewport({ scrollX: el.scrollLeft, width: el.clientWidth });
    });
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

  /**
   * Scroll the least amount that brings a pixel span into view — used when the
   * keyboard moves the selection to a clip that is off screen. A clip wider than
   * the viewport is aligned to its start rather than chasing its end.
   */
  const revealRange = useCallback((fromPx, toPx) => {
    const el = scrollerRef.current;
    if (!el) return;
    const pad = 24, width = el.clientWidth, left = el.scrollLeft;
    if (fromPx - pad < left) el.scrollLeft = Math.max(0, fromPx - pad);
    else if (toPx + pad > left + width) el.scrollLeft = Math.max(0, Math.min(toPx + pad - width, fromPx - pad));
    else return;
    setViewport({ scrollX: el.scrollLeft, width: el.clientWidth });
  }, []);

  return {
    ppm, setPpm, viewport, scrollerRef, attachScroller, onScroll, onWheel,
    zoomAt, zoomToFit, zoomToRange, restoreView, keepPlayheadVisible, revealRange,
  };
}
