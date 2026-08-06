import { useCallback, useState } from 'react';
import EditableLabel from '../ui/EditableLabel.jsx';
import LevelMeter from '../ui/LevelMeter.jsx';
import Oscilloscope from '../ui/Oscilloscope.jsx';

/**
 * How far the rows that are *not* being dragged have to move so the gap opens
 * where the row will land: everything between the old and the new slot shifts
 * by exactly one row, towards the slot being vacated.
 */
const slotOffset = (index, from, to, laneHeight) => {
  if (from < to && index > from && index <= to) return -laneHeight;
  if (from > to && index >= to && index < from) return laneHeight;
  return 0;
};

/** The fixed left column: track name, mute/solo, scope and meter. */
export default function TrackRail({
  stems, mixer, laneHeight, scopeMode, scopeWidth, colors, analyserFor, active,
  onRename, onMute, onSolo, onReorder, onResizeWidth, onResizeHeight,
}) {
  const [drag, setDrag] = useState(/** @type {{from: number, to: number, dy: number}|null} */(null));

  /**
   * Only the grip starts a drag — the rest of the row is rename, mute and solo,
   * all of which need their own pointer events. React hears about every move
   * (there are at most six rows, so a re-render per frame is free), and the
   * array is only really reordered on release, which keeps it one undo step.
   */
  const startDrag = useCallback((index, e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const live = { from: index, to: index, dy: 0 };
    setDrag({ ...live });

    const move = (ev) => {
      live.dy = ev.clientY - startY;
      live.to = Math.max(0, Math.min(stems.length - 1, index + Math.round(live.dy / laneHeight)));
      setDrag({ ...live });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (live.to !== index) onReorder(index, live.to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [stems.length, laneHeight, onReorder]);

  return (
    <div style={{ position: 'relative', borderRight: '1px solid var(--color-neutral-800)', overflow: 'hidden' }}>
      <div style={{ height: 58, borderBottom: '1px solid var(--color-neutral-800)' }} />

      {stems.map((stem, index) => {
        const state = mixer[stem.id] || {};
        const dragging = drag?.from === index;
        const offset = drag ? (dragging ? drag.dy : slotOffset(index, drag.from, drag.to, laneHeight)) : 0;
        return (
          <div
            key={stem.id}
            style={{
              position: 'relative', height: laneHeight, display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 8px 0 14px', fontSize: 11, letterSpacing: '.06em', color: 'var(--color-neutral-300)',
              borderBottom: '1px solid color-mix(in srgb, var(--color-neutral-800) 45%, transparent)',
              transform: offset ? `translateY(${offset}px)` : undefined,
              transition: drag && !dragging ? 'transform 90ms ease-out' : undefined,
              zIndex: dragging ? 4 : undefined,
              background: dragging ? 'color-mix(in srgb, var(--color-accent-900) 55%, var(--color-surface))' : undefined,
              boxShadow: dragging ? '0 4px 12px rgb(0 0 0 / .45)' : undefined,
            }}
          >
            <div
              onPointerDown={e => startDrag(index, e)}
              title="Drag to reorder — this is the Octatrack track order"
              aria-hidden="true"
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, lineHeight: 1, letterSpacing: '-.1em',
                color: dragging ? 'var(--color-accent-300)' : 'var(--color-neutral-600)',
                cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', zIndex: 3,
              }}
            >
              ⋮⋮
            </div>

            <EditableLabel
              value={stem.name}
              placeholder="TRACK"
              onCommit={name => onRename(stem.id, name)}
              title="Double-click to rename this track (used in the exported file names)"
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            />
            <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
              <button className={`msb ${state.muted ? 'on' : ''}`} onClick={() => onMute(stem.id)}
                aria-label={`${state.muted ? 'Unmute' : 'Mute'} ${stem.name}`} aria-pressed={!!state.muted}>M</button>
              <button className={`msb ${state.solo ? 'on' : ''}`} onClick={e => onSolo(stem.id, e.shiftKey)}
                aria-label={`Solo ${stem.name} (shift-click to add)`} aria-pressed={!!state.solo}>S</button>
            </span>
            {scopeMode !== 'off' && (
              <Oscilloscope
                analyser={analyserFor(stem.id)}
                mode={scopeMode}
                active={active}
                colors={colors}
                width={scopeWidth}
              />
            )}
            <LevelMeter
              analyser={analyserFor(stem.id)}
              active={active}
              colors={colors}
              title="Track level (dBFS) — red above −3, line at 0"
              style={{ flex: 'none', width: 8, height: 'calc(100% - 12px)', background: 'var(--color-neutral-900)', borderRadius: 2 }}
            />
            <div
              onPointerDown={onResizeHeight}
              title="Drag to resize track height"
              style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 5, cursor: 'ns-resize', zIndex: 2 }}
            />
          </div>
        );
      })}

      <div
        onPointerDown={onResizeWidth}
        title="Drag to resize the track column"
        style={{ position: 'absolute', top: 0, bottom: 0, right: -2, width: 5, cursor: 'col-resize', zIndex: 3 }}
      />
    </div>
  );
}
