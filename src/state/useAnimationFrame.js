import { useEffect, useRef } from 'react';

/** Runs `callback` once per frame while `active`, without re-subscribing on every render. */
export function useAnimationFrame(active, callback) {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (!active) return undefined;
    let id;
    const loop = () => {
      // the next frame is queued even if the callback throws, so one bad frame
      // cannot silently kill the meters or the playhead
      try { latest.current(); } finally { id = requestAnimationFrame(loop); }
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
