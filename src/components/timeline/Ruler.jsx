const tickStepFor = ppm => (ppm >= 22 ? 1 : ppm >= 11 ? 2 : ppm >= 6 ? 4 : 8);

const capStyle = { position: 'absolute', top: 0, bottom: 0, width: 2, background: 'var(--color-accent)' };

/**
 * Bar numbers under the section headers. Dragging scrubs; shift-dragging marks
 * a loop range, drawn here as a brace so the loop — section or range — is
 * always visible against the bars it covers.
 */
export default function Ruler({ totalBars, ppm, gridImage, loop, braceRef, onScrub, onLoopDrag }) {
  const step = tickStepFor(ppm);
  const ticks = [];
  for (let bar = 0; bar < totalBars; bar += step) ticks.push(bar);

  return (
    <div
      onPointerDown={e => (e.shiftKey ? onLoopDrag(e) : onScrub(e))}
      title="Drag to scrub · shift-drag to loop a bar range"
      style={{
        height: 18, position: 'relative', cursor: 'ew-resize',
        borderBottom: '1px solid var(--color-neutral-800)', backgroundImage: gridImage,
      }}
    >
      {ticks.map(bar => (
        <span
          key={bar}
          className="mono"
          style={{
            position: 'absolute', left: bar * ppm, top: 2, fontSize: 9, pointerEvents: 'none',
            color: 'var(--color-neutral-500)', paddingLeft: 3, borderLeft: '1px solid var(--color-neutral-700)',
          }}
        >
          {bar + 1}
        </span>
      ))}

      <div
        ref={braceRef}
        className="loop-brace"
        style={{
          position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none',
          display: loop ? 'block' : 'none',
          left: (loop?.a ?? 0) * ppm,
          width: ((loop?.b ?? 0) - (loop?.a ?? 0)) * ppm,
          background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
          borderTop: '2px solid var(--color-accent)',
        }}
      >
        <div style={{ ...capStyle, left: 0 }} />
        <div style={{ ...capStyle, right: 0 }} />
      </div>
    </div>
  );
}
