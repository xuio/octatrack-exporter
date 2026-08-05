export default function TempoStep({ vals }) {
  return (
    <div style={{ flex: 1, padding: '34px 24px', maxWidth: 560 }}>
      <h6 style={{ color: 'var(--color-neutral-500)' }}>Confirm tempo</h6>
      <p style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', maxWidth: 420 }}>
        Every cut is computed from this BPM — positions are derived cumulatively from song start, so it must match the session the stems were bounced from.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '18px 0 6px' }}>
        <input className="input mono" type="number" step="0.01" min="30" max="300"
          style={{ width: 170, fontSize: 34, minHeight: 60, padding: '6px 14px', letterSpacing: '.04em', color: 'var(--color-accent-300)' }}
          value={vals.bpmStr} onChange={vals.onBpm} onBlur={vals.onBpmCommit} onKeyDown={vals.onBpmKey} />
        <span style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--color-neutral-500)' }}>BPM</span>
      </div>
      <div className="hint" style={{ marginBottom: 20 }}>{vals.bpmSource}</div>
      <div style={{ display: 'flex', gap: 28, fontSize: 12, color: 'var(--color-neutral-400)', marginBottom: 22 }}>
        <div><div className="k-label">Samples / measure</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.spmLabel}</span></div>
        <div><div className="k-label">Song length</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.songLenLabel}</span></div>
        <div><div className="k-label">Regions</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.regionCountLabel}</span></div>
      </div>
      <div className="field" style={{ maxWidth: 260, marginBottom: 24 }}>
        <label>Song abbreviation (used in file names)</label>
        <input className="input" value={vals.abbrev} onChange={vals.onAbbrev} placeholder="e.g. Shake" />
      </div>
      {vals.hasBpmError && <div style={{ fontSize: 12, color: 'var(--color-accent-300)', marginBottom: 14 }}>{vals.bpmError}</div>}
      <button className="btn btn-primary" onClick={vals.onConfirmTempo}>Confirm → Regions</button>
    </div>
  );
}
