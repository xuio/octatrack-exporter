import { useCallback, useMemo, useState } from 'react';
import { splitTrim } from '../lib/index.js';

const LIMIT = 200;

/**
 * Manual slice edits, keyed by stem and section so they survive threshold
 * changes and re-analysis, with undo/redo on top.
 *
 *   edits[stemId][regionIdx] = { del: true } | { a: bar, b: bar }
 *
 * Edits and history live in one state object so every transition is a single
 * pure update — nesting setState calls inside updaters made redo unreliable.
 */
export function useSliceEdits() {
  const [state, setState] = useState({ edits: {}, past: [], future: [] });

  /** Replace the edits, optionally pushing the previous value onto the undo stack. */
  const apply = useCallback((produce, record = true) => {
    setState(prev => {
      const next = produce(prev.edits);
      if (next === prev.edits) return prev;
      return record
        ? { edits: next, past: [...prev.past, prev.edits].slice(-LIMIT), future: [] }
        : { ...prev, edits: next };
    });
  }, []);

  const setRegionEdit = useCallback((stemId, regionIdx, patch, record = true) => {
    apply((edits) => {
      const forStem = { ...(edits[stemId] || {}) };
      const merged = { ...(forStem[regionIdx] || {}), ...patch };
      if (merged.del == null && merged.a == null) delete forStem[regionIdx];
      else forStem[regionIdx] = merged;
      return { ...edits, [stemId]: forStem };
    }, record);
  }, [apply]);

  /**
   * Apply a dragged span, splitting it across every section it reaches — the
   * overhang becomes that section's own clip. `base`/`baseEdits` pin the drag to
   * the layout it started from, so dragging out and back does not accumulate.
   */
  const trim = useCallback((stemId, regionIdx, a, b, { regions, base, baseEdits, record = true }) => {
    const patch = splitTrim(regions, regionIdx, a, b, base);
    apply((edits) => {
      const source = baseEdits || edits;
      const forStem = { ...(source[stemId] || {}) };
      for (const [idx, span] of Object.entries(patch)) {
        if (span === null) delete forStem[idx];
        else forStem[idx] = { a: span.a, b: span.b };
      }
      return { ...source, [stemId]: forStem };
    }, record);
  }, [apply]);

  const undo = useCallback(() => setState(prev => (prev.past.length ? {
    edits: prev.past[prev.past.length - 1],
    past: prev.past.slice(0, -1),
    future: [prev.edits, ...prev.future].slice(0, LIMIT),
  } : prev)), []);

  const redo = useCallback(() => setState(prev => (prev.future.length ? {
    edits: prev.future[0],
    past: [...prev.past, prev.edits].slice(-LIMIT),
    future: prev.future.slice(1),
  } : prev)), []);

  /** Swap in a whole edit set (restoring a session) as one undoable step. */
  const replace = useCallback((next) => apply(() => next, true), [apply]);

  const reset = useCallback(() => apply(() => ({}), true), [apply]);
  const clearAll = useCallback(() => setState({ edits: {}, past: [], future: [] }), []);

  const count = useMemo(
    () => Object.values(state.edits).reduce((n, forStem) => n + Object.keys(forStem).length, 0),
    [state.edits],
  );

  return {
    edits: state.edits,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    count, trim, setRegionEdit, undo, redo, reset, replace, clearAll,
  };
}
