import { useCallback, useMemo, useRef, useState } from 'react';
import { splitTrim } from '../lib/index.js';

/**
 * Manual slice edits, keyed by stem and section so they survive threshold
 * changes and re-analysis:
 *
 *   edits[stemId][regionIdx] = { del: true } | { a: bar, b: bar, sa, sb }
 *
 * `sa`/`sb` are signed sample offsets from the bar-derived edges (the fine
 * trim); they are stored only when non-zero, which is what keeps sessions
 * written before they existed loading unchanged.
 *
 * Undo lives in the shared history (see useHistory) so a clip edit, a rename
 * and a threshold change all sit on one stack. Every transition computes the
 * next value outside the state updater — recording history from inside one runs
 * twice under StrictMode and corrupts the stack.
 */
export function useSliceEdits(history) {
  const [edits, setEdits] = useState({});
  const ref = useRef(edits);

  const set = useCallback((value) => { ref.current = value; setEdits(value); }, []);

  /**
   * Move to `next`. `label` records an undo step (omit it for the intermediate
   * states of a drag); `from` overrides what undo goes back to, which is how a
   * whole drag collapses into one step that returns to where it started.
   */
  const commit = useCallback((next, label, from) => {
    const previous = from ?? ref.current;
    if (next === ref.current) return;
    set(next);
    if (label) history.record(label, () => set(previous), () => set(next));
  }, [history, set]);

  /**
   * Merge a patch into one region's edit. Passing `label = null` skips the undo
   * step (the live frames of a fine-trim drag), and `from` is the state that one
   * drag's single recorded step goes back to.
   */
  const setRegionEdit = useCallback((stemId, regionIdx, patch, label = 'clip edit', from) => {
    const current = ref.current;
    const forStem = { ...(current[stemId] || {}) };
    const merged = { ...(forStem[regionIdx] || {}), ...patch };
    // Normalize on the way in: an edit that says nothing is no edit at all, and
    // a zero offset must not linger as one — `count` and the ✎ marker read this.
    const next = {};
    if (merged.del) next.del = true;
    if (merged.a != null) { next.a = merged.a; next.b = merged.b != null ? merged.b : merged.a; }
    if (merged.sa) next.sa = merged.sa;
    if (merged.sb) next.sb = merged.sb;
    if (!Object.keys(next).length) delete forStem[regionIdx];
    else forStem[regionIdx] = next;
    commit({ ...current, [stemId]: forStem }, label, from);
  }, [commit]);

  /**
   * Apply a dragged span, splitting it across every section it reaches — the
   * overhang becomes that section's own clip. `base`/`baseEdits` pin the drag to
   * the layout it started from, so dragging out and back does not accumulate,
   * and they double as the point undo returns to.
   */
  const trim = useCallback((stemId, regionIdx, a, b, { regions, base, baseEdits, record = true }) => {
    const source = baseEdits || ref.current;
    const patch = splitTrim(regions, regionIdx, a, b, base);
    const forStem = { ...(source[stemId] || {}) };
    for (const [idx, span] of Object.entries(patch)) {
      if (span === null) { delete forStem[idx]; continue; }
      // A fine trim is an offset from the bar edge, so it survives the bar edge
      // moving — dragging a clip wider keeps the click-free cut it was given.
      const { sa, sb } = forStem[idx] || {};
      forStem[idx] = { a: span.a, b: span.b, ...(sa ? { sa } : {}), ...(sb ? { sb } : {}) };
    }
    commit({ ...source, [stemId]: forStem }, record ? 'trim clip' : null, source);
  }, [commit]);

  /** Swap in a whole edit set (restoring a session) as one undoable step. */
  const replace = useCallback((next) => commit(next, 'restore session'), [commit]);
  const reset = useCallback(() => commit({}, 'discard clip edits'), [commit]);
  const clearAll = useCallback(() => set({}), [set]);

  const count = useMemo(
    () => Object.values(edits).reduce((n, forStem) => n + Object.keys(forStem).length, 0),
    [edits],
  );

  return { edits, count, trim, setRegionEdit, reset, replace, clearAll };
}
