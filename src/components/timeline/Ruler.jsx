const tickStepFor = ppm => (ppm >= 22 ? 1 : ppm >= 11 ? 2 : ppm >= 6 ? 4 : 8);

/** Bar numbers under the section headers; dragging it scrubs. */
export default function Ruler({ totalBars, ppm, gridImage, onScrub }) {
  const step = tickStepFor(ppm);
  const ticks = [];
  for (let bar = 0; bar < totalBars; bar += step) ticks.push(bar);

  return (
    <div
      onPointerDown={onScrub}
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
    </div>
  );
}
