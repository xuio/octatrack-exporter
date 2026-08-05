/**
 * Whole-song strip. Click or drag anywhere to move the playhead; the lighter
 * rectangle marks the part of the song the timeline below is showing.
 */
export default function Overview({ regions, totalBars, loopRegionIdx, containerRef, playheadRef, viewportRef, onScrub }) {
  return (
    <div
      ref={containerRef}
      onPointerDown={onScrub}
      title="Click or drag to jump"
      style={{
        position: 'relative', height: 26, flex: 'none', overflow: 'hidden',
        borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface)',
        cursor: 'ew-resize', userSelect: 'none',
      }}
    >
      {regions.map(region => (
        <div
          key={region.idx}
          style={{
            position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden',
            left: `${region.start / totalBars * 100}%`,
            width: `${region.len / totalBars * 100}%`,
            borderLeft: '1px solid var(--color-neutral-800)',
            padding: '5px 0 0 4px',
            background: loopRegionIdx === region.idx
              ? 'color-mix(in srgb, var(--color-accent-900) 80%, transparent)'
              : region.idx % 2
                ? 'color-mix(in srgb, var(--color-surface) 60%, transparent)'
                : 'transparent',
          }}
        >
          <span style={{ fontSize: 9, letterSpacing: '.04em', color: 'var(--color-neutral-500)', whiteSpace: 'nowrap' }}>
            {String(region.idx).padStart(2, '0')}{region.name ? ` ${region.name.toUpperCase()}` : ''}
          </span>
        </div>
      ))}
      <div
        ref={viewportRef}
        style={{
          position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none',
          background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
          borderLeft: '1px solid var(--color-accent-600)',
          borderRight: '1px solid var(--color-accent-600)',
        }}
      />
      <div
        ref={playheadRef}
        style={{
          position: 'absolute', top: 0, bottom: 0, width: 1, pointerEvents: 'none',
          background: 'var(--color-accent)', boxShadow: '0 0 5px var(--color-accent)',
        }}
      />
    </div>
  );
}
