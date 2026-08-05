import { useCallback, useState } from 'react';

/**
 * Mute/solo, kept apart from the stems themselves: toggling a mute must not
 * invalidate the derived slices (and so must not re-cue the audio graph).
 */
export function useMixer() {
  const [state, setState] = useState({});

  const toggleMute = useCallback((id) => {
    setState(prev => ({ ...prev, [id]: { ...prev[id], muted: !prev[id]?.muted } }));
  }, []);

  /**
   * A plain click solos one track; shift-click builds a solo group. Clearing the
   * last solo brings every unmuted track back, as in any DAW.
   */
  const toggleSolo = useCallback((id, additive) => {
    setState(prev => {
      const soloed = Object.entries(prev).filter(([, v]) => v?.solo).map(([k]) => k);
      const onlyThis = soloed.length === 1 && soloed[0] === String(id);
      const next = {};
      for (const key of new Set([...Object.keys(prev), String(id)])) {
        const isTarget = key === String(id);
        next[key] = {
          ...prev[key],
          solo: additive ? (isTarget ? !prev[key]?.solo : !!prev[key]?.solo) : (isTarget ? !onlyThis : false),
        };
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setState({}), []);

  return { state, toggleMute, toggleSolo, clear };
}
