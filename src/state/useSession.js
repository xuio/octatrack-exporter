import { useCallback, useEffect, useState } from 'react';

const KEY = 'ossc.session.v1';

/**
 * Keeps the *work* — tempo, names, sections and slice edits — across a reload.
 *
 * The audio itself is far too large to stash (a five-stem song is well over a
 * hundred megabytes decoded), so a session is tied to a fingerprint of the stem
 * files: re-drop the same stems and OSSC offers the edits back, drop different
 * ones and it stays out of the way.
 *
 * Everything is stored by stem *index*, never by id — ids are per-load counters
 * and would point at the wrong stem in the next session.
 */
export const fingerprint = (stems, midi) => (stems.length
  ? [...stems.map(s => `${s.fileName}:${s.frames}`), midi ? `${midi.fileName}:${midi.noteCount}` : '-'].join('|')
  : '');

const countEdits = (byIndex) =>
  (byIndex || []).reduce((n, forStem) => n + Object.keys(forStem || {}).length, 0);

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};

export function useSession({ stems, midi, bpm, abbrev, regions, edits }) {
  const [saved] = useState(read);          // whatever was on disk when the app started
  const [dismissed, setDismissed] = useState(false);
  const key = fingerprint(stems, midi);

  useEffect(() => {
    if (!key) return;
    const snapshot = {
      key,
      savedAt: Date.now(),
      bpm,
      abbrev,
      names: stems.map(s => s.name),
      regionNames: regions ? regions.map(r => r.name || '') : null,
      editsByIndex: stems.map(s => edits[s.id] || {}),
    };
    try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* quota or private mode */ }
  }, [key, bpm, abbrev, stems, regions, edits]);

  /** A saved session for exactly these files that has not been used or waved away. */
  const offer = (!dismissed && saved && key && saved.key === key && countEdits(saved.editsByIndex) > 0)
    ? { savedAt: saved.savedAt, edits: countEdits(saved.editsByIndex) }
    : null;

  /** Map the stored snapshot back onto the stems that are loaded right now. */
  const restore = useCallback(() => {
    setDismissed(true);
    if (!saved) return null;
    return {
      bpm: saved.bpm,
      abbrev: saved.abbrev,
      names: saved.names || [],
      regionNames: saved.regionNames,
      edits: Object.fromEntries(stems.map((stem, i) => [stem.id, saved.editsByIndex?.[i] || {}])),
    };
  }, [saved, stems]);

  const dismiss = useCallback(() => setDismissed(true), []);
  const clear = useCallback(() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }, []);

  return { offer, restore, dismiss, clear };
}
