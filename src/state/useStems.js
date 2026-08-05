import { useCallback, useRef, useState } from 'react';
import { parseWav, parseMidi, readZip, audioEntries, makeDemo } from '../lib/index.js';

const stemName = (fileName) =>
  fileName.replace(/\.wav$/i, '').replace(/[_-]?\d+$/, '').toUpperCase().slice(0, 20) || 'STEM';

/** Pull WAV/MIDI members out of any dropped .zip archives, leaving other files alone. */
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

    for (const file of expanded) {
      try {
        setReading(file.name);
        await new Promise(r => setTimeout(r, 20));
        const buf = await file.arrayBuffer();
        if (/\.(mid|midi)$/i.test(file.name)) {
          nextMidi = parseMidi(buf, file.name);
        } else if (/\.wav$/i.test(file.name)) {
          const parsed = parseWav(buf, file.name);
          collected.push({ id: nextId.current++, name: stemName(file.name), muted: false, solo: false, ...parsed });
        } else {
          errors.push(`${file.name}: unsupported type (need .wav, .mid or .zip)`);
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
      const demo = makeDemo(id);
      demoNames.current = demo.regionNames;
      const files = demo.files.map(f => ({ name: f.name, arrayBuffer: () => Promise.resolve(f.data) }));
      files.push({ name: demo.midi.name, arrayBuffer: () => Promise.resolve(demo.midi.data) });
      await addFiles(files, { replace: true });
      onLoaded?.({ abbrev: demo.abbrev });
      setDemoLoading(false);
    }, 30);
  }, [addFiles, onLoaded]);

  const update = useCallback(fn => setStems(prev => fn(prev)), []);

  return {
    stems, midi, error, reading, demoLoading, demoNames,
    addFiles, loadDemo, setError,
    removeMidi: () => setMidi(null),
    rename: (id, name) => update(list => list.map(s => s.id === id ? { ...s, name: name.toUpperCase().slice(0, 20) } : s)),
    remove: (id) => update(list => list.filter(s => s.id !== id)),
    move: (index, delta) => update(list => {
      const next = [...list], to = index + delta;
      if (to < 0 || to >= next.length) return list;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    }),
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
