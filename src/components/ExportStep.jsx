export default function ExportStep({ vals }) {
  return (
    <div style={{ flex: 1, padding: '26px 24px', maxWidth: 1020 }}>
      <h6 style={{ color: 'var(--color-neutral-500)' }}>Export</h6>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, margin: '12px 0 18px' }}>
        <div className="field" style={{ width: 220 }}>
          <label>Song abbreviation</label>
          <input className="input" value={vals.abbrev} onChange={vals.onAbbrev} placeholder="e.g. Shake" />
        </div>
        <span className="hint" style={{ paddingBottom: 9 }}>files: <span className="mono">{vals.namingPreview}</span></span>
      </div>
      {vals.hasExportNotices && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
          {vals.exportNotices.map((n, i) => <div key={i} className="notice">◆ {n.text}</div>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {vals.fileCards.map(f => (
          <div key={f.num} className="card elev-sm">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>{f.num}</span>
              <span className="card-title" style={{ fontSize: 15 }}>{f.stemName}</span>
              <span className="tag tag-neutral" style={{ fontSize: 10, marginLeft: 'auto' }}>{f.sliceLabel}</span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>{f.wavName} <span style={{ color: 'var(--color-neutral-600)' }}>· {f.size}</span></div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>{f.otName} <span style={{ color: 'var(--color-neutral-600)' }}>· 832 B</span></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={f.onWav}>WAV</button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={f.onOt}>.ot</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={vals.onZip} disabled={vals.zipBusy}>{vals.zipLabel}</button>
        <button className="btn btn-secondary" onClick={vals.onCsv}>Pattern table CSV</button>
        <button className="btn btn-secondary" onClick={vals.onPrint}>Printable table</button>
        <button className="btn btn-ghost" onClick={vals.goProject}>Project builder →</button>
        <span className="hint" style={{ marginLeft: 'auto' }}>{vals.exportSummary}</span>
      </div>
    </div>
  );
}
