export default function RegionsStep({ vals }) {
  return (
    <div style={{ flex: 1, padding: '26px 24px', maxWidth: 1060 }}>
      <h6 style={{ color: 'var(--color-neutral-500)' }}>Regions → patterns</h6>
      <p style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', maxWidth: 560 }}>
        One arrangement section = one pattern, starting at Bank 2 (Bank 1 stays yours for an intro). Names are optional — they label the timeline and the table.
      </p>
      {vals.hasRegionNotices && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '10px 0 4px' }}>
          {vals.regionNotices.map((n, i) => <div key={i} className="notice">◆ {n.text}</div>)}
        </div>
      )}
      <table className="table" style={{ marginTop: 12, maxWidth: 1020 }}>
        <thead>
          <tr><th style={{ width: 34 }}>#</th><th style={{ width: 220 }}>Name</th><th>Pattern</th><th>Start bar</th><th>Bars</th><th>Scale</th><th>Master</th><th></th></tr>
        </thead>
        <tbody>
          {(vals.regionsVm || []).map(r => (
            <tr key={r.num}>
              <td className="mono" style={{ color: 'var(--color-accent-300)' }}>{r.num}</td>
              <td><input className="input" style={{ minHeight: 28, padding: '2px 8px', fontSize: 12.5 }} value={r.name} onChange={r.onName} placeholder={r.ph} /></td>
              <td><span className="tag tag-neutral mono" style={{ fontSize: 10.5 }}>{r.bp}</span></td>
              <td className="mono" style={{ fontSize: 12 }}>{r.startBar}</td>
              <td className="mono" style={{ fontSize: 12 }}>{r.len}</td>
              <td className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-300)' }}>{r.scale}</td>
              <td className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{r.master}</td>
              <td>{r.tooLong && <span className="tag tag-outline" style={{ fontSize: 10 }}>&gt; 32 bars</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="btn btn-primary" onClick={vals.onAnalyze} disabled={vals.analyzing}>{vals.analyzeLabel}</button>
        {vals.analyzing && <span className="pulse" style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>{vals.progress}</span>}
      </div>
    </div>
  );
}
