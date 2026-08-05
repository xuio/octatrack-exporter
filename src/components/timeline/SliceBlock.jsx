import { memo } from 'react';

const FILLS = {
  // [peak envelope, body, highlight] with matching opacities — the outer shape
  // sits darker and the body core brighter, the classic two-tone DAW waveform
  spectral: { colors: ['var(--color-accent-600)', 'var(--color-accent-300)', 'var(--color-accent-100)'], alpha: [0.95, 0.95, 0.35] },
  band: { colors: ['var(--color-accent-600)', 'var(--color-accent-300)', 'none'], alpha: [0.95, 1, 0] },
  bars: { colors: ['var(--color-accent-400)', 'none', 'var(--color-accent-200)'], alpha: [1, 0, 0.8] },
};

function SliceBlock({ slice, left, width, buckets, paths, style, selected, onSelect, onAudition, onTrimStart }) {
  const fill = FILLS[style] || FILLS.spectral;
  const tip = `${slice.label} · bars ${slice.aM + 1}–${slice.bM + 1}${slice.edited ? ' (trimmed)' : ''}`
    + ' — drag the edges to trim, double-click to audition';

  return (
    <div
      className="slice-block"
      title={tip}
      onClick={e => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={e => { e.stopPropagation(); onAudition(); }}
      style={{
        left,
        width,
        border: `1px solid ${selected ? 'var(--color-accent-400)' : 'var(--color-accent-700)'}`,
        boxShadow: selected
          ? '0 0 0 1px var(--color-accent-400), 0 0 10px color-mix(in srgb, var(--color-accent) 35%, transparent)'
          : 'none',
      }}
    >
      {paths && (
        <svg viewBox={`0 0 ${buckets} 32`} preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          <path d={paths.p1} fill={fill.colors[0]} opacity={fill.alpha[0]} />
          <path d={paths.p2} fill={fill.colors[1]} opacity={fill.alpha[1]} />
          <path d={paths.p3} fill={fill.colors[2]} opacity={fill.alpha[2]} />
        </svg>
      )}
      <b className="mono" style={{ position: 'absolute', top: 0, left: 4, fontSize: 9, fontWeight: 500, color: 'var(--color-accent-200)' }}>
        {slice.num}{slice.edited ? '✎' : ''}
      </b>
      {selected && (
        <>
          <div className="trim-h" style={{ left: 0 }} title="Drag to trim the start (snaps to bars)"
            onPointerDown={e => onTrimStart('l', e)} />
          <div className="trim-h" style={{ right: 0 }} title="Drag to trim the end (snaps to bars)"
            onPointerDown={e => onTrimStart('r', e)} />
        </>
      )}
    </div>
  );
}

// One of these exists per clip per stem; re-rendering them all because a
// neighbouring lane changed is the one thing that gets expensive at scale.
export default memo(SliceBlock);
