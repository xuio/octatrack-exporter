import EditableLabel from '../ui/EditableLabel.jsx';
import LevelMeter from '../ui/LevelMeter.jsx';
import Oscilloscope from '../ui/Oscilloscope.jsx';

/** The fixed left column: track name, mute/solo, scope and meter. */
export default function TrackRail({
  stems, mixer, width, laneHeight, scopeMode, scopeWidth, colors, analyserFor, active,
  onRename, onMute, onSolo, onResizeWidth, onResizeHeight,
}) {
  return (
    <div style={{ position: 'relative', borderRight: '1px solid var(--color-neutral-800)', overflow: 'hidden' }}>
      <div style={{ height: 58, borderBottom: '1px solid var(--color-neutral-800)' }} />

      {stems.map(stem => {
        const state = mixer[stem.id] || {};
        return (
          <div
            key={stem.id}
            style={{
              position: 'relative', height: laneHeight, display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 8px', fontSize: 11, letterSpacing: '.06em', color: 'var(--color-neutral-300)',
              borderBottom: '1px solid color-mix(in srgb, var(--color-neutral-800) 45%, transparent)',
            }}
          >
            <EditableLabel
              value={stem.name}
              placeholder="TRACK"
              onCommit={name => onRename(stem.id, name)}
              title="Double-click to rename this track (used in the exported file names)"
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            />
            <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
              <button className={`msb ${state.muted ? 'on' : ''}`} onClick={() => onMute(stem.id)}>M</button>
              <button className={`msb ${state.solo ? 'on' : ''}`} onClick={e => onSolo(stem.id, e.shiftKey)}>S</button>
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
