import { useRef } from 'react';
import { useAnimationFrame } from '../../state/useAnimationFrame.js';
import { drawMeter, readPeak, advanceEnvelope, newEnvelope } from '../../audio/visualizers.js';
import { MASTER_TICKS, dbPos } from '../../lib/meters.js';

/** dBFS level meter driven straight from an analyser node. */
export default function LevelMeter({ analyser, active, horizontal = false, colors, style, title }) {
  const canvasRef = useRef(null);
  const envelope = useRef(newEnvelope());
  const buffer = useRef(null);

  useAnimationFrame(active, () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = analyser ? analyser.fftSize : 2048;
    if (!buffer.current || buffer.current.length !== size) buffer.current = new Float32Array(size);
    advanceEnvelope(envelope.current, readPeak(analyser, buffer.current));
    drawMeter(canvas, envelope.current, { horizontal, colors });
  });

  return <canvas ref={canvasRef} title={title} style={style} />;
}

/** Master meter with a labelled dB scale underneath. */
export function MasterMeter({ analyser, active, colors }) {
  return (
    <span style={{ position: 'relative', width: 118, flex: 'none' }} title="Master level (dBFS)">
      <LevelMeter
        analyser={analyser}
        active={active}
        horizontal
        colors={colors}
        style={{ display: 'block', width: 118, height: 11, background: 'var(--color-neutral-900)', borderRadius: 2 }}
      />
      <span style={{ position: 'relative', display: 'block', height: 9 }}>
        {MASTER_TICKS.map(db => (
          <span
            key={db}
            className="mono"
            style={{
              position: 'absolute',
              left: `${dbPos(db) * 100}%`,
              top: 0,
              transform: db === 0 ? 'translateX(-100%)' : 'translateX(-50%)',
              fontSize: 7.5,
              color: db === 0 ? '#e0483c' : 'var(--color-neutral-600)',
            }}
          >
            {db === 0 ? '0' : db}
          </span>
        ))}
      </span>
    </span>
  );
}
