import { spmFor } from '../../lib/index.js';
import Field from '../ui/Field.jsx';

const Stat = ({ label, children }) => (
  <div>
    <div className="k-label">{label}</div>
    <span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{children}</span>
  </div>
);

/** Step 2: the BPM every cut is derived from. */
export default function TempoStep({ bpm, bpmSource, error, midi, abbrev, onBpm, onAbbrev, onConfirm }) {
  const tempo = parseFloat(bpm) || 0;
  const spm = tempo ? spmFor(tempo) : 0;
  const songLength = midi && spm ? (() => {
    const bars = Math.round(midi.ticks[midi.ticks.length - 1] / (midi.ppq * 4));
    const seconds = bars * spm / 44100;
    return `${bars} bars · ${(seconds / 60) | 0}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  })() : '—';

  return (
    <div style={{ flex: 1, padding: '34px 24px', maxWidth: 560 }}>
      <h6 style={{ color: 'var(--color-neutral-500)' }}>Confirm tempo</h6>
      <p style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', maxWidth: 420 }}>
        Every cut is computed from this BPM — positions are derived cumulatively from song start,
        so it must match the session the stems were bounced from.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '18px 0 6px' }}>
        <input
          className="input mono"
          type="number"
          step="0.01"
          min="30"
          max="300"
          value={bpm}
          onChange={e => onBpm(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{ width: 170, fontSize: 34, minHeight: 60, padding: '6px 14px', letterSpacing: '.04em', color: 'var(--color-accent-300)' }}
        />
        <span style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--color-neutral-500)' }}>BPM</span>
      </div>
      <div className="hint" style={{ marginBottom: 20 }}>{bpmSource}</div>

      <div style={{ display: 'flex', gap: 28, fontSize: 12, color: 'var(--color-neutral-400)', marginBottom: 22 }}>
        <Stat label="Samples / measure">{spm ? spm.toFixed(2) : '—'}</Stat>
        <Stat label="Song length">{songLength}</Stat>
        <Stat label="Regions">{midi ? Math.max(0, midi.noteCount - 1) : '—'}</Stat>
      </div>

      <Field
        label="Song abbreviation (used in file names)"
        value={abbrev}
        onChange={e => onAbbrev(e.target.value)}
        placeholder="e.g. Shake"
        style={{ maxWidth: 260, marginBottom: 24 }}
      />

      {error && <div style={{ fontSize: 12, color: 'var(--color-accent-300)', marginBottom: 14 }}>{error}</div>}
      <button className="btn btn-primary" onClick={onConfirm}>Confirm → Regions</button>
    </div>
  );
}
