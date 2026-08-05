import { useCallback } from 'react';

const BOUNDS = {
  railW: { min: 110, max: 460, axis: 'x', cursor: 'col-resize' },
  laneH: { min: 28, max: 220, axis: 'y', cursor: 'ns-resize' },
};

/** Drag-to-resize for the track column and the track height. */
export function useDragResize(setPrefs) {
  const start = useCallback((key, event) => {
    const spec = BOUNDS[key];
    if (!spec) return;
    event.preventDefault();
    event.stopPropagation();

    const from = spec.axis === 'x' ? event.clientX : event.clientY;
    let initial = null;

    const move = (e) => {
      const delta = (spec.axis === 'x' ? e.clientX : e.clientY) - from;
      setPrefs(prev => {
        if (initial === null) initial = prev[key];
        return { [key]: Math.max(spec.min, Math.min(spec.max, initial + delta)) };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = spec.cursor;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [setPrefs]);

  return { start };
}
