import EditableLabel from '../ui/EditableLabel.jsx';

/** Section blocks above the ruler: name, pattern, scale, and the loop toggle. */
export default function RegionHeader({ regions, ppm, loopRegionIdx, selectedRegionIdx, onRename, onLoop }) {
  return (
    <div style={{ height: 40, position: 'relative', borderBottom: '1px solid color-mix(in srgb, var(--color-neutral-800) 55%, transparent)' }}>
      {regions.map(region => {
        const looping = loopRegionIdx === region.idx;
        const background = looping
          ? 'color-mix(in srgb, var(--color-accent-900) 70%, transparent)'
          : region.idx === selectedRegionIdx
            ? 'color-mix(in srgb, var(--color-accent-900) 45%, transparent)'
            : 'transparent';
        return (
          <div
            key={region.idx}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: region.start * ppm, width: region.len * ppm,
              borderLeft: '1px solid var(--color-neutral-800)',
              padding: '4px 24px 3px 8px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
              background,
            }}
          >
            <div style={{ display: 'flex', gap: 4, fontSize: 10.5, fontWeight: 500, color: 'var(--color-neutral-200)', letterSpacing: '.03em', overflow: 'hidden' }}>
              <span className="mono" style={{ flex: 'none', color: 'var(--color-accent-300)' }}>
                {String(region.idx).padStart(2, '0')}
              </span>
              <EditableLabel
                value={(region.name || '').toUpperCase()}
                placeholder="name"
                onCommit={name => onRename(region.idx, name)}
                title="Double-click to rename this section"
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              />
            </div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {region.bp} · {region.len} · {region.scale.label}
            </div>
            <button
              className={`msb ${looping ? 'on' : ''}`}
              onClick={e => { e.stopPropagation(); onLoop(region); }}
              title="Loop this section"
              style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 16, fontSize: 11, lineHeight: 1 }}
            >
              ⟳
            </button>
          </div>
        );
      })}
    </div>
  );
}
