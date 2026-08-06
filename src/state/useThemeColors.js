import { useEffect, useState } from 'react';

const TOKENS = {
  accent200: '--color-accent-200',
  accent300: '--color-accent-300',
  accent400: '--color-accent-400',
  accent500: '--color-accent-500',
  accent800: '--color-accent-800',
  neutral100: '--color-neutral-100',
  neutral800: '--color-neutral-800',
};

const FALLBACK = {
  accent200: '#e7e5fe', accent300: '#d2cefd', accent400: '#b5abfc', accent500: '#968ae0',
  accent800: '#423a6a', neutral100: '#f3f5fe', neutral800: '#3f424d',
};

const readTokens = () => {
  const style = getComputedStyle(document.documentElement);
  return /** @type {typeof FALLBACK} */ (Object.fromEntries(
    Object.entries(TOKENS).map(([key, token]) =>
      [key, (style.getPropertyValue(token) || '').trim() || FALLBACK[key]]),
  ));
};

const same = (a, b) => Object.keys(TOKENS).every(key => a[key] === b[key]);

/**
 * Resolved token values for canvas drawing, re-read whenever the theme changes.
 *
 * The trigger is the `data-theme` attribute landing on <html>, not the React
 * prop: the attribute is written by an effect in App, and effects run child
 * first, so a hook keyed on the theme name reads the *old* variables — the
 * canvases then painted a whole theme behind until the next switch. Observing
 * the attribute cannot lose that race whichever effect runs first, and reading
 * computed styles flushes the pending style recalc, so the values are the ones
 * the rest of the page is about to use.
 */
export function useThemeColors(theme) {
  const [colors, setColors] = useState(FALLBACK);
  useEffect(() => {
    // Same values on a re-read mean the same object, so consumers that repaint
    // on a colour change (the scopes and meters) are not woken for nothing.
    const sync = () => setColors(prev => { const next = readTokens(); return same(prev, next) ? prev : next; });
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    sync();                       // the attribute may already be there (it usually is)
    return () => observer.disconnect();
  }, [theme]);                    // re-syncs on mount and on any theme the observer somehow missed
  return colors;
}
