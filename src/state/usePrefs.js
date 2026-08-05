import { useCallback, useEffect, useState } from 'react';

const KEY = 'ossc.prefs.v1';

const DEFAULTS = {
  theme: 'nocturne',
  threshold: -60,
  waveStyle: 'spectral',
  scopeMode: 'scope',
  follow: true,
  railW: 232,
  laneH: 50,
};

const load = () => {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return { ...DEFAULTS }; }
};

/** UI preferences, persisted to localStorage and applied to the document theme. */
export function usePrefs() {
  const [prefs, setPrefs] = useState(load);

  const set = useCallback((patch) => setPrefs(p => ({ ...p, ...patch })), []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  return [prefs, set];
}
