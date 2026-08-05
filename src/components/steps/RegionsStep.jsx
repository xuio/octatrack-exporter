import Notices from '../ui/Notices.jsx';

/** Step 3: one section per pattern, with the scale each one needs. */
export default function RegionsStep({ regions, meta, analyzing, progress, hasAnalysis, onRename, onAnalyze }) {
  const notices = [];
  if (meta?.snapped) notices.push(`${meta.snapped} note(s) snapped to the nearest bar line`);
  if (regions.length > 32) notices.push(`${regions.length} regions — numbering rolls into further banks`);

  return (
    <div style={{ flex: 1, padding: '26px 24px', maxWidth: 1060 }}>
      <h6 style={{ color: 'var(--color-neutral-500)' }}>Regions → patterns</h6>
      <p style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', maxWidth: 560 }}>
        One arrangement section = one pattern, starting at Bank 2 (Bank 1 stays yours for an intro).
        Names are optional — they label the timeline and the table.
      </p>

      <Notices items={notices} style={{ margin: '10px 0 4px' }} />

      <table className="table" style={{ marginTop: 12, maxWidth: 1020 }}>
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th style={{ width: 220 }}>Name</th>
            <th>Pattern</th><th>Start bar</th><th>Bars</th><th>Scale</th><th>Master</th><th />
          </tr>
        </thead>
        <tbody>
          {regions.map(region => (
            <tr key={region.idx}>
              <td className="mono" style={{ color: 'var(--color-accent-300)' }}>{String(region.idx).padStart(2, '0')}</td>
              <td>
                <input
                  className="input"
                  value={region.name}
                  placeholder={`Region ${region.idx}`}
                  onChange={e => onRename(region.idx, e.target.value)}
                  style={{ minHeight: 28, padding: '2px 8px', fontSize: 12.5 }}
                />
              </td>
              <td><span className="tag tag-neutral mono" style={{ fontSize: 10.5 }}>{region.bp}</span></td>
              <td className="mono" style={{ fontSize: 12 }}>{region.start + 1}</td>
              <td className="mono" style={{ fontSize: 12 }}>{region.len}</td>
              <td className="mono" style={{ fontSize: 12, color: 'var(--color-neutral-300)' }}>{region.scale.label}</td>
              <td className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{region.scale.master}</td>
              <td>{!region.scale.ok && <span className="tag tag-outline" style={{ fontSize: 10 }}>&gt; 32 bars</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="btn btn-primary" onClick={onAnalyze} disabled={analyzing}>
          {analyzing ? 'Analyzing…' : hasAnalysis ? 'Re-analyze stems' : 'Analyze stems →'}
        </button>
        {analyzing && <span className="pulse" style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>{progress}</span>}
      </div>
    </div>
  );
}
