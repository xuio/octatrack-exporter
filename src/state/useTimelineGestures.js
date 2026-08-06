import { useCallback } from 'react';
import { trimLimits } from '../lib/index.js';

/** Runs a pointer drag, cleaning up its window listeners on release. */
function drag(onMove, onUp) {
  const move = e => onMove(e);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onUp?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/**
 * Scrubbing the ruler / playhead / overview, and dragging a clip's edges.
 *
 * Both keep React out of the loop while the pointer is down: scrubbing only
 * paints, and a trim writes edits without recording history until release, so a
 * drag is one undo step.
 */
export function useTimelineGestures({ base, ppm, tracks, edits, transport, paintBars, refs }) {
  const totalBars = base?.total ?? 0;

  /** Scrub: silence while dragging, resume from where it is dropped. */
  const scrub = useCallback((barAt, e) => {
    if (!base) return;
    e.preventDefault();
    const wasPlaying = transport.playing;
    if (wasPlaying) transport.stop();
    let bar = barAt(e);
    paintBars(bar);
    drag(
      ev => { bar = barAt(ev); paintBars(bar); },
      () => {
        const target = Math.max(0, Math.min(totalBars - 1, Math.floor(bar)));
        transport.setStartBar(target + 1);
        if (wasPlaying) transport.play(target + 1); else paintBars(target);
      },
    );
  }, [base, totalBars, transport, paintBars]);

  const barAtTimeline = useCallback((e) => {
    const el = refs.scroller.current;
    if (!el) return 0;
    const rect = el.firstChild.getBoundingClientRect();
    return Math.max(0, Math.min(totalBars - 0.001, (e.clientX - rect.left) / ppm));
  }, [refs, ppm, totalBars]);

  const barAtOverview = useCallback((e) => {
    const rect = refs.overview.current.getBoundingClientRect();
    return Math.max(0, Math.min(totalBars - 0.001, ((e.clientX - rect.left) / rect.width) * totalBars));
  }, [refs, totalBars]);

  const scrubTimeline = useCallback((e) => scrub(barAtTimeline, e), [scrub, barAtTimeline]);
  const scrubOverview = useCallback((e) => scrub(barAtOverview, e), [scrub, barAtOverview]);

  /**
   * Shift-drag in the ruler: a whole-bar loop range. The brace is painted
   * directly while the pointer is down (React only hears about the range on
   * release), so dragging across a long song stays free of re-renders.
   */
  const dragLoopRange = useCallback((e) => {
    if (!base) return;
    e.preventDefault();
    const brace = refs.loopBrace.current;
    const anchor = Math.floor(barAtTimeline(e));
    let to = anchor;
    const paint = () => {
      if (!brace) return;
      const a = Math.min(anchor, to), b = Math.max(anchor, to) + 1;
      brace.style.display = 'block';
      brace.style.left = `${a * ppm}px`;
      brace.style.width = `${(b - a) * ppm}px`;
    };
    paint();
    drag(
      ev => { to = Math.floor(barAtTimeline(ev)); paint(); },
      () => {
        paint();          // the release position, in case React renders no change
        transport.loopRange(Math.min(anchor, to), Math.max(anchor, to) + 1);
      },
    );
  }, [base, ppm, refs, transport, barAtTimeline]);

  /**
   * Trim a clip edge. The span is recomputed from the layout captured at
   * pointer-down, so dragging out and back does not accumulate, and crossing a
   * section boundary splits the overhang into that section's own clip.
   */
  const startTrim = useCallback((stemId, slice, side, e) => {
    e.stopPropagation();
    e.preventDefault();
    const track = tracks.get(stemId);
    if (!track) return;

    const baseLayout = track.slices.map(s => ({ regionIdx: s.region.idx, aM: s.aM, bM: s.bM }));
    const baseEdits = edits.edits;
    const limits = trimLimits(track.slices, slice.region.idx, base.regs);
    const startX = e.clientX, fromA = slice.aM, fromB = slice.bM;
    let lastA = fromA, lastB = fromB;

    drag(
      ev => {
        const delta = Math.round((ev.clientX - startX) / ppm);
        const a = side === 'l' ? Math.max(limits.minA, Math.min(fromB, fromA + delta)) : fromA;
        const b = side === 'l' ? fromB : Math.min(limits.maxB, Math.max(fromA, fromB + delta));
        if (a === lastA && b === lastB) return;
        lastA = a; lastB = b;
        edits.trim(stemId, slice.region.idx, a, b, { regions: base.regs, base: baseLayout, baseEdits, record: false });
      },
      () => {
        if (lastA !== fromA || lastB !== fromB) {
          edits.trim(stemId, slice.region.idx, lastA, lastB, { regions: base.regs, base: baseLayout, baseEdits, record: true });
        }
      },
    );
  }, [base, ppm, tracks, edits]);

  return { scrubTimeline, scrubOverview, dragLoopRange, startTrim };
}
