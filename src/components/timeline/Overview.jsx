import { useEffect, useMemo, useState } from 'react';
import { barLabelStep } from '../../lib/index.js';

/**
 * Whole-song strip. Click or drag anywhere to move the playhead; the lighter
 * rectangle marks the part of the song the timeline below is showing, and a
 * double-click frames that section in the timeline.
 */
export default function Overview({
  regions, totalBars, loopRegionIdx, containerRef, playheadRef, viewportRef, onScrub, onZoomSection,
}) {
  // The label spacing is a pixel question, not a bar question — a 200-bar song
  // in a narrow window needs a coarser step than the same song full-screen.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const barLabels = useMemo(() => {
    if (!width || !totalBars) return [];
    const step = barLabelStep(totalBars, width);
    const out = [];
    for (let bar = 0; bar < totalBars; bar += step) out.push(bar);
    return out;
  }, [width, totalBars]);

  return (
    <div
      ref={containerRef}
      onPointerDown={onScrub}
      onDoubleClick={onZoomSection}
      title="Click or drag to jump · double-click a section to zoom to it"
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

      {/* Bar numbers live in their own strip along the bottom edge, clear of the
          section names at the top, so the two never overlap. */}
      {barLabels.map(bar => (
        <span
          key={bar}
          className="mono"
          style={{
            position: 'absolute', bottom: 1, left: `${bar / totalBars * 100}%`,
            paddingLeft: 3, fontSize: 9, lineHeight: 1, whiteSpace: 'nowrap',
            color: 'var(--color-neutral-500)', pointerEvents: 'none',
          }}
        >
          {bar + 1}
        </span>
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
