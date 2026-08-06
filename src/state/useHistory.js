import { useCallback, useReducer, useRef } from 'react';

const LIMIT = 200;

/**
 * One undo stack for the whole arrangement editor.
 *
 * Built from inverse commands rather than document snapshots: clip edits,
 * track and section names and the loudness threshold each live in their own
 * piece of state, and recording how to reverse a change is what lets a single
 * stack span all of them without hoisting everything into one store.
 *
 * The stacks are refs, and a counter forces the re-render — pushing to them
 * from inside a setState updater is what made an earlier snapshot-based version
 * lose redo steps.
 */
export function useHistory() {
  const past = useRef([]);
  const future = useRef([]);
  const [, bump] = useReducer(n => n + 1, 0);

  /** `undo` and `redo` must be pure state swaps — they run long after the event. */
  const record = useCallback((label, undo, redo) => {
    past.current.push({ label, undo, redo });
    if (past.current.length > LIMIT) past.current.shift();
    future.current = [];
    bump();
  }, []);

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (!entry) return;
    entry.undo();
    future.current.unshift(entry);
    bump();
  }, []);

  const redo = useCallback(() => {
    const entry = future.current.shift();
    if (!entry) return;
    entry.redo();
    past.current.push(entry);
    bump();
  }, []);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    bump();
  }, []);

  return {
    record, undo, redo, clear,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undoLabel: past.current[past.current.length - 1]?.label || '',
    redoLabel: future.current[0]?.label || '',
  };
}
