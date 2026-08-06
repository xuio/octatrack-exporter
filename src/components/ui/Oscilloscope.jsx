import { useCallback, useEffect, useRef } from 'react';
import { useAnimationFrame } from '../../state/useAnimationFrame.js';
import { drawScope, drawSpectrum } from '../../audio/visualizers.js';

/** Per-track scope or spectrum analyser, depending on `mode`. */
export default function Oscilloscope({ analyser, mode, active, colors, sampleRate = 44100, width }) {
  const canvasRef = useRef(null);
  const timeBuffer = useRef(null);
  const freqBuffer = useRef(null);
  const peaks = useRef(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mode === 'fft') {
      const bins = analyser ? analyser.frequencyBinCount : 1024;
      if (!freqBuffer.current || freqBuffer.current.length !== bins) freqBuffer.current = new Float32Array(bins);
      peaks.current = drawSpectrum(canvas, analyser, freqBuffer.current, peaks.current, { colors, sampleRate });
    } else {
      const size = analyser ? analyser.fftSize : 4096;
      if (!timeBuffer.current || timeBuffer.current.length !== size) timeBuffer.current = new Float32Array(size);
      drawScope(canvas, analyser, timeBuffer.current, { colors, sampleRate });
    }
  }, [analyser, mode, colors, sampleRate]);

  useAnimationFrame(active && mode !== 'off', paint);

  // A new theme has to reach the canvas even when nothing is driving the frame
  // loop — the pixels are not styled by CSS, so without one repaint they keep
  // the old palette until playback starts again.
  useEffect(() => { if (mode !== 'off') paint(); }, [colors, mode, paint]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        flex: 'none',
        width,
        height: 'calc(100% - 12px)',
        background: 'var(--color-bg)',
        border: '1px solid color-mix(in srgb, var(--color-neutral-800) 60%, transparent)',
        borderRadius: 3,
      }}
    />
  );
}
