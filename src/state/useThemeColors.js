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

/** Resolved token values for canvas drawing, re-read whenever the theme changes. */
export function useThemeColors(theme) {
  const [colors, setColors] = useState(FALLBACK);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name, fallback) => (style.getPropertyValue(name) || '').trim() || fallback;
    setColors(Object.fromEntries(
      Object.entries(TOKENS).map(([key, token]) => [key, read(token, FALLBACK[key])]),
    ));
  }, [theme]);
  return colors;
}
