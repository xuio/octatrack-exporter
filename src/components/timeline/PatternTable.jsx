const Cell = ({ primary, secondary, color }) => (
  <div style={{ flex: 'none', width: 158, padding: '6px 8px', minWidth: 0, borderLeft: '1px solid color-mix(in srgb, var(--color-neutral-800) 45%, transparent)' }}>
    <div className="mono" style={{ fontSize: 11, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</div>
    {secondary && (
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {secondary}
      </div>
    )}
  </div>
);

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid color-mix(in srgb, var(--color-neutral-800) 45%, transparent)' }}>
    <div style={{ flex: 'none', width: 130, padding: '6px 8px', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>
      {label}
    </div>
    {children}
  </div>
);

/** Which slice each track trigs in each pattern, and on which step. */
export default function PatternTable({ regions, stems, tracks, onExportCsv, onPrint }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 'min-content' }}>
        <Row label="Region">
          {regions.map(r => (
            <Cell key={r.idx} primary={`${String(r.idx).padStart(2, '0')} ${r.name || ''}`} secondary={r.bp} color="var(--color-neutral-200)" />
          ))}
        </Row>
        <Row label="Length">
          {regions.map(r => <Cell key={r.idx} primary={`${r.len} bars`} color="var(--color-neutral-300)" />)}
        </Row>
        <Row label="Scale">
          {regions.map(r => <Cell key={r.idx} primary={r.scale.label} color="var(--color-neutral-300)" />)}
        </Row>
        <Row label="Master">
          {regions.map(r => <Cell key={r.idx} primary={r.scale.master} color="var(--color-neutral-500)" />)}
        </Row>

        {stems.map(stem => {
          const track = tracks.get(stem.id);
          return (
            <Row key={stem.id} label={stem.name}>
              {regions.map(region => {
                const slice = track && track.slices.find(s => s.region.idx === region.idx);
                if (!slice) return <Cell key={region.idx} primary="—" color="var(--color-neutral-700)" />;
                return (
                  <Cell
                    key={region.idx}
                    primary={`Slice ${slice.num}`}
                    secondary={slice.trig !== 1 ? `from bar ${slice.aM + 1} · step ${slice.trig}` : ''}
                    color="var(--color-accent-300)"
                  />
                );
              })}
            </Row>
          );
        })}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onExportCsv}>Export CSV</button>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onPrint}>Printable version</button>
      </div>
    </div>
  );
}
