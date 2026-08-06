import { useCallback, useRef, useState } from 'react';
import { parseMidi, readZip, audioEntries, sortByTrackNumber, stripTrackNumber } from '../lib/index.js';
import { decodeAudio, synthesizeDemo, AUDIO_RE } from '../workers/audioClient.js';

/** Track names are uppercase and bounded — the Octatrack's own display limit. */
export const normalizeStemName = (name) => name.toUpperCase().slice(0, 20);

// The leading track number has done its job once the batch is in order, so it
// comes off the display name — "1 DRUMS.wav" is the DRUMS track.
export const stemName = (fileName) =>
  normalizeStemName(stripTrackNumber(fileName.replace(AUDIO_RE, '')).replace(/[_-]?\d+$/, '')) || 'STEM';

/** Pull audio/MIDI members out of any dropped .zip archives, leaving other files alone. */
async function expandArchives(files, errors) {
  const out = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) { out.push(file); continue; }
    try {
      const entries = audioEntries(await readZip(await file.arrayBuffer()));
      if (!entries.length) errors.push(`${file.name}: no WAV or MIDI files inside`);
      for (const e of entries) {
        const data = e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength);
        out.push({ name: e.name.split('/').pop(), arrayBuffer: () => Promise.resolve(data) });
      }
    } catch (err) { errors.push(`${file.name}: ${err.message}`); }
  }
  return out;
}

function guessTempo(midi) {
  const fromName = (midi.fileName.match(/\d{2,3}(?:\.\d+)?/g) || [])
    .map(Number).find(n => n >= 50 && n <= 250);
  if (fromName) return { bpm: String(fromName), source: `detected from file name “${midi.fileName}” — confirm before processing` };
  if (midi.bpm) return { bpm: String(midi.bpm), source: 'from MIDI tempo event — confirm before processing' };
  return { bpm: '120', source: 'no tempo found — enter the session BPM' };
}

/** The stems and arrangement MIDI, plus everything that gets them in. */
export function useStems({ onLoaded }) {
  const [stems, setStems] = useState([]);
  const [midi, setMidi] = useState(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const nextId = useRef(1);
  const demoNames = useRef(null);

  const addFiles = useCallback(async (files, { replace = false } = {}) => {
    const errors = [];
    setReading('archive');
    const expanded = await expandArchives(files, errors);
    // `replace` is explicit rather than read back from state: a caller that has
    // just cleared the list would otherwise still see the old one here.
    const collected = [];
    let nextMidi = replace ? null : midi;

    // Only the incoming batch is ordered: stems already in the list may have
    // been dragged into place by hand, and that has to stand.
    const ordered = [
      ...sortByTrackNumber(expanded.filter(f => AUDIO_RE.test(f.name)), f => f.name),
      ...expanded.filter(f => !AUDIO_RE.test(f.name)),
    ];

    for (const file of ordered) {
      try {
        setReading(file.name);
        await new Promise(r => setTimeout(r, 20));
        const buf = await file.arrayBuffer();
        if (/\.(mid|midi)$/i.test(file.name)) {
          nextMidi = parseMidi(buf, file.name);
        } else if (AUDIO_RE.test(file.name)) {
          const parsed = await decodeAudio(buf, file.name);
          collected.push({ id: nextId.current++, name: stemName(file.name), muted: false, solo: false, ...parsed });
        } else {
          errors.push(`${file.name}: unsupported type (need .wav, .aif, .flac, .mid or .zip)`);
        }
      } catch (err) { errors.push(err.message); }
    }

    const nextStems = replace ? collected : [...stems, ...collected];
    setStems(nextStems);
    setMidi(nextMidi);
    setError(errors.join('\n'));
    setReading('');
    onLoaded?.({ stems: nextStems, midi: nextMidi, tempo: nextMidi ? guessTempo(nextMidi) : null, replace });
  }, [stems, midi, onLoaded]);

  const loadDemo = useCallback((id) => {
    setDemoLoading(true);
    setTimeout(async () => {
      const demo = await synthesizeDemo(id);
      demoNames.current = demo.regionNames;
      const files = demo.files.map(f => ({ name: f.name, arrayBuffer: () => Promise.resolve(f.data) }));
      files.push({ name: demo.midi.name, arrayBuffer: () => Promise.resolve(demo.midi.data) });
      await addFiles(files, { replace: true });
      onLoaded?.({ abbrev: demo.abbrev });
      setDemoLoading(false);
    }, 30);
  }, [addFiles, onLoaded]);

  const update = useCallback(fn => setStems(prev => fn(prev)), []);

  /**
   * Put the stem at `from` in slot `to`. A splice-move rather than a swap: the
   * rail lets a row be dragged several slots at once, and the rows it passes
   * have to shift by one each — a swap would scramble them. Its own inverse is
   * `reorder(to, from)`, which is what the undo stack records.
   */
  const reorder = useCallback((from, to) => update(list => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  }), [update]);

  const clear = useCallback(() => {
    setStems([]); setMidi(null); setError(''); setReading('');
    demoNames.current = null;
  }, []);

  return {
    stems, midi, error, reading, demoLoading, demoNames,
    addFiles, loadDemo, setError, clear, reorder,
    removeMidi: () => setMidi(null),
    rename: (id, name) => update(list => list.map(s => s.id === id ? { ...s, name: normalizeStemName(name) } : s)),
    remove: (id) => update(list => list.filter(s => s.id !== id)),
    move: (index, delta) => reorder(index, index + delta),
    toggleMute: (id) => update(list => list.map(s => s.id === id ? { ...s, muted: !s.muted } : s)),
    // A plain click solos one track; shift-click builds a solo group. Clearing
    // the last solo returns every unmuted track, as in any DAW.
    toggleSolo: (id, additive) => update(list => {
      const soloed = list.filter(s => s.solo);
      const onlyThis = soloed.length === 1 && soloed[0].id === id;
      return list.map(s => ({
        ...s,
        solo: additive ? (s.id === id ? !s.solo : s.solo) : (s.id === id ? !onlyThis : false),
      }));
    }),
  };
}

export function validateStems(stems, midi) {
  if (!stems.length || !midi) return 'Need stems and a MIDI file.';
  const length = stems[0].frames;
  if (stems.some(s => s.frames !== length)) {
    return 'Stem lengths differ — all stems must start at bar 1 and share one length:\n'
      + stems.map(s => `${s.fileName} — ${s.frames.toLocaleString()} samples`).join('\n');
  }
  if (midi.noteCount < 2) return 'MIDI has fewer than 2 notes — need one per section start plus one at the song end.';
  return '';
}

export const isAudible = (stem, stems) =>
  stems.some(s => s.solo) ? stem.solo : !stem.muted;
