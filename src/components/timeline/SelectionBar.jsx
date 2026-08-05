const Value = ({ children }) => <b style={{ color: 'var(--color-neutral-200)', fontWeight: 500 }}>{children}</b>;

const HINT = 'Select a slice to trim or delete it — drag its edges to trim, double-click to audition. '
  + 'Dashed blocks add a slice back.';

/** Footer describing the selected slice, with nudge / audition / delete actions. */
export default function SelectionBar({ selection, onNudge, onAudition, onResetTrim, onDelete }) {
  const bar = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', minHeight: 34, flexWrap: 'wrap',
    borderTop: '1px solid var(--color-divider)', fontSize: 11, color: 'var(--color-neutral-400)',
  };

  if (!selection) {
    return <div style={bar}><span style={{ color: 'var(--color-neutral-600)' }}>{HINT}</span></div>;
  }

  const { stem, slice, region } = selection;
  return (
    <div style={bar}>
      <span className="tag tag-accent" style={{ fontSize: 10 }}>{stem.name} · Slice {slice.num}</span>
      <span>region <Value>{String(region.idx).padStart(2, '0')}{region.name ? ` ${region.name.toUpperCase()}` : ''} ({region.bp})</Value></span>
      <span>song bar <Value>{slice.aM + 1}</Value> = pattern bar <Value>{slice.aM - region.start + 1}</Value></span>
      <span>trig step <b className="mono" style={{ color: 'var(--color-accent-300)', fontWeight: 500 }}>{slice.trig}</b> in {region.bp}</span>
      <span className="mono" style={{ color: 'var(--color-neutral-500)' }}>
        {slice.bM - slice.aM + 1} bars · smp {slice.start.toLocaleString()}–{slice.end.toLocaleString()}
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>START</span>
        <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => onNudge('l', -1)} title="Extend start by one bar">−</button>
        <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => onNudge('l', 1)} title="Trim start by one bar">+</button>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)', marginLeft: 4 }}>END</span>
        <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => onNudge('r', -1)} title="Trim end by one bar">−</button>
        <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => onNudge('r', 1)} title="Extend end by one bar">+</button>
      </span>

      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={onAudition}>Audition</button>
      {slice.edited && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={onResetTrim}>Reset trim</button>}
      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={onDelete} title="Delete this slice (Del)">Delete</button>
    </div>
  );
}
