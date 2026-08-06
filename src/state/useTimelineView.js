import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MIN_PPM, clampPpm, ppmForRange, anchoredScrollLeft } from '../lib/index.js';

// How much zoom one pixel of pinch travel is worth. Exponential so the gesture
// feels the same at every zoom level.
const ZOOM_PER_WHEEL_PX = 0.01;

/**
 * Zoom, scroll and the follow-the-playhead behaviour of the timeline.
 * The scroll container is held as a ref so the playhead can be painted every
 * frame without re-rendering React.
 */
export function useTimelineView({ follow, setFollow, playing }) {
  const [ppm, setPpmState] = useState(16);
  const [viewport, setViewport] = useState({ scrollX: 0, width: 0 });
  const scrollerRef = useRef(null);
  const pendingScroll = useRef(false);

  // The zoom paths read and write `ppmRef` rather than `ppm`: a pinch can flush
  // several times before React commits, and each flush has to build on the last
  // one's value, not on the last rendered one.
  const ppmRef = useRef(16);
  // Scroll position that belongs with the ppm currently being committed. It is
  // applied in a layout effect (after the relayout, before the paint) so the
  // browser never gets to show the new zoom against the old scroll — that
  // one-frame mismatch is what used to make a pinch lurch sideways.
  const pendingScrollLeft = useRef(/** @type {number|null} */(null));
  const [viewNonce, setViewNonce] = useState(0);

  /** Move zoom and scroll together, in one commit. */
  const commitView = useCallback((nextPpm, nextScrollLeft) => {
    ppmRef.current = nextPpm;
    pendingScrollLeft.current = nextScrollLeft;
    setPpmState(nextPpm);
    // A nonce rather than `ppm` as the effect's key: restoring a session can
    // move the scroll without changing the zoom at all.
    setViewNonce(n => n + 1);
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const target = pendingScrollLeft.current;
    pendingScrollLeft.current = null;
    if (!el) return;
    if (target != null) el.scrollLeft = target;
    setViewport(v => (v.scrollX === el.scrollLeft && v.width === el.clientWidth
      ? v
      : { scrollX: el.scrollLeft, width: el.clientWidth }));
  }, [viewNonce]);

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
    const current = ppmRef.current;
    const next = clampPpm(current * factor);
    if (next === current) return;
    if (!el) { commitView(next, null); return; }
    const rect = el.getBoundingClientRect();
    const anchor = Math.max(0, Math.min(rect.width, (clientX ?? rect.left + rect.width / 2) - rect.left));
    commitView(next, anchoredScrollLeft(el.scrollLeft, anchor, current, next));
  }, [commitView]);

  /** Set the zoom outright (no anchoring); kept for callers that own the value. */
  const setPpm = useCallback((value) => {
    const next = clampPpm(typeof value === 'function' ? value(ppmRef.current) : value);
    commitView(next, null);
  }, [commitView]);

  const zoomToFit = useCallback((totalBars) => {
    const width = (scrollerRef.current?.clientWidth || window.innerWidth - 200) - 10;
    commitView(Math.max(MIN_PPM, Math.min(30, Math.floor(width / Math.max(1, totalBars)))), null);
  }, [commitView]);

  /**
   * Frame a bar range: zoom until it fills most of the viewport and put it in
   * the middle. Double-clicking a section in the overview lands here.
   */
  const zoomToRange = useCallback((barA, barB) => {
    const el = scrollerRef.current;
    const width = el?.clientWidth || 1200;
    const bars = Math.max(1, barB - barA);
    const next = ppmForRange(bars, width);
    commitView(next, Math.max(0, barA * next - Math.max(0, width - bars * next) / 2));
    return next;
  }, [commitView]);

  /** Put zoom and scroll back where a restored session left them. */
  const restoreView = useCallback(({ ppm: nextPpm, scrollX }) => {
    commitView(
      Number.isFinite(nextPpm) ? clampPpm(nextPpm) : ppmRef.current,
      Number.isFinite(scrollX) ? Math.max(0, scrollX) : null,
    );
  }, [commitView]);

  // A pinch streams wheel events far faster than the screen refreshes, and one
  // setState each would mean several full re-renders per frame. Instead the
  // deltas pile up here and turn into a single zoom step per frame.
  const pinch = useRef({ delta: 0, clientX: /** @type {number|null} */(null), frame: 0 });

  const flushPinch = useCallback(() => {
    const g = pinch.current;
    g.frame = 0;
    const delta = g.delta;
    g.delta = 0;
    if (delta) zoomAt(g.clientX, Math.exp(-delta * ZOOM_PER_WHEEL_PX));
  }, [zoomAt]);

  useEffect(() => () => { if (pinch.current.frame) cancelAnimationFrame(pinch.current.frame); }, []);

  /**
   * Trackpad pinch arrives as a wheel event with ctrlKey; a horizontal wheel
   * means the user is driving the view, so stop following the playhead.
   */
  const onWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      // Has to happen on the event itself, not on the frame, or the browser
      // page-zooms before we get there.
      e.preventDefault();
      const g = pinch.current;
      // Anchor on the first event of the frame: the fingers move during a
      // pinch, so each frame gets a fresh — but internally consistent — anchor.
      if (!g.frame) { g.clientX = e.clientX; g.frame = requestAnimationFrame(flushPinch); }
      g.delta += e.deltaY;
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && follow && playing) setFollow(false);
  }, [flushPinch, follow, playing, setFollow]);

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
