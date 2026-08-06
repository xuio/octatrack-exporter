import { useCallback, useEffect, useRef } from 'react';
import { SR } from '../../lib/index.js';

/**
 * The sample-accurate edge editor for the selected clip.
 *
 * Bar-quantized edges are right for the trig grid and wrong for the waveform:
 * a bar line lands wherever it lands, and the Octatrack plays slices with no
 * fade, so a cut through a moving waveform is an audible click. These two strips
 * show the few milliseconds either side of each edge so the cut can be walked
 * onto a zero crossing. Nothing here touches a sample — only where the cut is.
 */

const W = 200, H = 36;
const VIEW_MS = 100;                       // the strip spans ±50 ms of audio
const SPP = (SR * VIEW_MS) / 1000 / W;     // samples per pixel — the fixed zoom

const msOf = samples => samples / SR * 1000;
const fmt = samples => `${msOf(samples) >= 0 ? '+' : '−'}${Math.abs(msOf(samples)).toFixed(2)} ms`;

/** Min/max envelope of the stereo sum, one column per pixel, plus the edge line. */
function paint(canvas, chL, chR, at, side) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const css = getComputedStyle(canvas);
  const v = name => css.getPropertyValue(name).trim();
  const mid = H / 2, amp = H / 2 - 1;
  const n = Math.min(chL.length, chR.length);

  // The half of the strip that is outside the slice reads as background.
  ctx.fillStyle = v('--color-neutral-800');
  ctx.globalAlpha = 0.35;
  ctx.fillRect(side === 'l' ? 0 : W / 2, 0, W / 2, H);
  ctx.globalAlpha = 1;

  ctx.fillStyle = v('--color-neutral-700');
  ctx.fillRect(0, mid, W, 0.5);

  for (let x = 0; x < W; x++) {
    const from = Math.round(at + (x - W / 2) * SPP), to = Math.round(at + (x + 1 - W / 2) * SPP);
    let lo = 1, hi = -1;
    for (let i = Math.max(0, from); i < Math.min(n, to); i++) {
      const m = (chL[i] + chR[i]) / 2;
      if (m < lo) lo = m;
      if (m > hi) hi = m;
    }
    if (hi < lo) continue;                 // past either end of the stem
    const inside = side === 'l' ? x >= W / 2 : x < W / 2;
    ctx.fillStyle = inside ? v('--color-accent-500') : v('--color-neutral-600');
    const top = mid - Math.max(-1, Math.min(1, hi)) * amp;
    const bottom = mid - Math.max(-1, Math.min(1, lo)) * amp;
    ctx.fillRect(x, top, 1, Math.max(0.75, bottom - top));
  }

  ctx.fillStyle = v('--color-accent-200');
  ctx.fillRect(W / 2 - 0.5, 0, 1, H);
}

/** One edge: its strip, its offset readout and its nudges. */
function Edge({ label, side, stem, at, offset, onSet, onSnap }) {
  const canvas = useRef(/** @type {HTMLCanvasElement|null} */(null));

  useEffect(() => {
    if (canvas.current) paint(canvas.current, stem.chL, stem.chR, at, side);
  }, [stem, at, side]);

  // Live frames are unrecorded and the release records once, so a drag that
  // wanders back and forth is still one undo step back to where it began.
  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX, from = offset;
    let last = from;
    const move = (ev) => {
      last = from + Math.round((ev.clientX - startX) * SPP);
      onSet(last, 'live');
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onSet(last, 'commit');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [offset, onSet]);

  const nudge = ms => onSet(offset + Math.round(ms * SR / 1000), 'commit');
  const btn = { minWidth: 26, height: 18, fontSize: 9.5, padding: '0 4px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10 }}>
        <span style={{ color: 'var(--color-neutral-500)', letterSpacing: '.08em' }}>{label}</span>
        <span className="mono" style={{ color: offset ? 'var(--color-accent-300)' : 'var(--color-neutral-600)' }}>
          {fmt(offset)} · {offset > 0 ? '+' : ''}{offset} smp
        </span>
      </div>
      <canvas
        ref={canvas}
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        title="Drag to move this slice point"
        style={{
          width: W, height: H, cursor: 'ew-resize', borderRadius: 2, touchAction: 'none',
          border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
        }}
      />
      <div style={{ display: 'flex', gap: 2 }}>
        <button className="tb" style={btn} onClick={() => nudge(-10)} title="Move 10 ms earlier">−10</button>
        <button className="tb" style={btn} onClick={() => nudge(-1)} title="Move 1 ms earlier">−1</button>
        <button className="tb" style={btn} onClick={() => nudge(1)} title="Move 1 ms later">+1</button>
        <button className="tb" style={btn} onClick={() => nudge(10)} title="Move 10 ms later">+10</button>
        <button className="tb" style={{ ...btn, marginLeft: 4 }} onClick={onSnap} title="Snap to the nearest zero crossing">Snap ✂</button>
        <button className="tb" style={{ ...btn, minWidth: 18 }} onClick={() => onSet(0, 'commit')} title="Back to the bar line">×</button>
      </div>
    </div>
  );
}

export default function FineTrim({ selection, onFine, onFineSnap }) {
  const { stem, slice } = selection;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', width: '100%', padding: '4px 0 2px' }}>
      <div style={{ maxWidth: 210, fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-neutral-500)' }}>
        <span style={{ color: 'var(--color-neutral-300)' }}>Fine trim</span> — moves the slice point only,
        audio is untouched. Snap to a zero crossing to avoid clicks on the device.
      </div>
      <Edge
        label="START EDGE" side="l" stem={stem} at={slice.start} offset={slice.fine.sa}
        onSet={(sa, phase) => onFine({ sa }, phase)}
        onSnap={() => onFineSnap('l')}
      />
      <Edge
        label="END EDGE" side="r" stem={stem} at={slice.end} offset={slice.fine.sb}
        onSet={(sb, phase) => onFine({ sb }, phase)}
        onSnap={() => onFineSnap('r')}
      />
    </div>
  );
}
