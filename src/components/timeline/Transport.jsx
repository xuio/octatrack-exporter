import { MasterMeter } from '../ui/LevelMeter.jsx';

const Icon = ({ children, size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 10 10">{children}</svg>
);

const UndoIcon = ({ flip }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    {flip
      ? <><path d="M20.5 9H9a5 5 0 0 0 0 10h6" /><polyline points="16.5 4.5 21 9 16.5 13.5" /></>
      : <><path d="M3.5 9h11.5a5 5 0 0 1 0 10H9" /><polyline points="7.5 4.5 3 9 7.5 13.5" /></>}
  </svg>
);

const Group = ({ label, title, children }) => (
  <div style={{ display: 'inline-flex', flex: 'none', alignItems: 'center', gap: 4, marginLeft: 8 }}>
    <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }} title={title}>{label}</span>
    {children}
  </div>
);

const Segmented = ({ name, options, value, onChange, padding = '3px 8px', fontSize = 10.5 }) => (
  <div className="seg" style={{ borderRadius: 4 }}>
    {options.map(opt => (
      <label key={opt.value} className="seg-opt" style={{ padding, fontSize }}>
        <input type="radio" name={name} checked={value === opt.value} onChange={() => onChange(opt.value)} />
        {opt.label}
      </label>
    ))}
  </div>
);

export default function Transport({
  playing, positionRef, positionLabel, follow, edits, history, warnings, view, waveStyle, scopeMode,
  volume, threshold, thresholdDraft, masterAnalyser, colors, active, showKeys,
  onPlay, onStop, onToStart, onToggleFollow, onUndo, onRedo, onClearLoop, loopLabel,
  onVolume, onThresholdGrab, onThresholdSlide, onThresholdRelease, onThresholdDraft, onThresholdCommit, onThresholdStep,
  onZoomIn, onZoomOut, onZoomFit, onWaveStyle, onScopeMode, onView, onResetEdits,
  onToggleWarnings, onToggleKeys, onExport,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
      <button className="tb" onClick={onToStart} title="Back to bar 1" aria-label="Back to bar 1">
        <Icon><path d="M2 0h1.6v10H2zM9 0L3.8 5 9 10z" fill="currentColor" /></Icon>
      </button>
      <button className={`tb ${playing ? 'on' : ''}`} onClick={onPlay} title="Play (space)" aria-label="Play">
        <Icon><path d="M1 0l8 5-8 5z" fill="currentColor" /></Icon>
      </button>
      <button className="tb" onClick={onStop} title="Stop (space)" aria-label="Stop">
        <Icon size={9}><rect width="9" height="9" fill="currentColor" /></Icon>
      </button>

      <span
        className="mono"
        ref={positionRef}
        style={{
          fontSize: 14, letterSpacing: '.08em', color: 'var(--color-accent-300)', minWidth: 74,
          border: '1px solid var(--color-neutral-800)', borderRadius: 4, padding: '2px 10px',
          background: 'var(--color-surface)', textAlign: 'center',
        }}
      >
        {positionLabel}
      </span>

      <button className={`tb ${follow ? 'on' : ''}`} onClick={onToggleFollow} title="Keep the view following the playhead">
        Follow
      </button>

      <span style={{ display: 'inline-flex', gap: 3 }}>
        <button className="tb" onClick={onUndo} disabled={!history.canUndo}
          title={history.canUndo ? `Undo ${history.undoLabel} (⌘Z)` : 'Nothing to undo'} aria-label="Undo"><UndoIcon /></button>
        <button className="tb" onClick={onRedo} disabled={!history.canRedo}
          title={history.canRedo ? `Redo ${history.redoLabel} (⇧⌘Z)` : 'Nothing to redo'} aria-label="Redo"><UndoIcon flip /></button>
      </span>

      {loopLabel && (
        <button className="tag tag-accent" onClick={onClearLoop} title="Release the loop and keep playing from here"
          style={{ fontSize: 10, border: 'none', cursor: 'pointer' }}>
          ⟳ looping {loopLabel} ✕
        </button>
      )}

      <Group label="VOL" title="Monitoring level only — never applied to exported audio">
        <input type="range" min="0" max="1" step="0.01" aria-label="Monitoring volume" style={{ width: 74 }} value={volume} onChange={onVolume} />
        <MasterMeter analyser={masterAnalyser} active={active} colors={colors} />
      </Group>

      <Group label="THRESHOLD">
        <input type="range" min="-100" max="-6" step="1" aria-label="Silence threshold in dBFS" style={{ width: 78 }}
          value={threshold} onChange={onThresholdSlide}
          onPointerDown={onThresholdGrab} onKeyDown={onThresholdGrab}
          onPointerUp={onThresholdRelease} onKeyUp={onThresholdRelease} />
        <button className="tb" style={{ minWidth: 22, height: 22 }} onClick={() => onThresholdStep(-3)} title="−3 dB">−</button>
        <input className="input mono" type="text" inputMode="numeric" aria-label="Silence threshold in dBFS" value={thresholdDraft ?? String(threshold)}
          onChange={onThresholdDraft} onBlur={onThresholdCommit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{ width: 46, minHeight: 26, padding: '2px 4px', fontSize: 12, textAlign: 'center' }} />
        <button className="tb" style={{ minWidth: 22, height: 22 }} onClick={() => onThresholdStep(3)} title="+3 dB">+</button>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>dBFS</span>
      </Group>

      <Group label="ZOOM" title="Pinch or ⌘/Ctrl-scroll on the timeline to zoom">
        <button className="tb" style={{ minWidth: 24, height: 22 }} onClick={onZoomOut}>−</button>
        <button className="tb" style={{ minWidth: 24, height: 22 }} onClick={onZoomIn}>+</button>
        <button className="tb" style={{ height: 22 }} onClick={onZoomFit}>Fit</button>
      </Group>

      <Group label="WAVE">
        <Segmented
          name="wave"
          value={waveStyle}
          onChange={onWaveStyle}
          options={[
            { value: 'spectral', label: 'Spectral' },
            { value: 'band', label: 'Band' },
            { value: 'bars', label: 'Bars' },
          ]}
        />
        <button className={`tb ${scopeMode === 'scope' ? 'on' : ''}`} style={{ height: 24 }}
          onClick={() => onScopeMode(scopeMode === 'scope' ? 'off' : 'scope')} title="Per-track oscilloscopes">Scopes</button>
        <button className={`tb ${scopeMode === 'fft' ? 'on' : ''}`} style={{ height: 24 }}
          onClick={() => onScopeMode(scopeMode === 'fft' ? 'off' : 'fft')} title="Per-track spectrum analyzer">FFT</button>
      </Group>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {edits.count > 0 && (
          <button className="tb" onClick={onResetEdits} title="Discard manual slice edits and go back to automatic trimming">
            {edits.count} edit{edits.count > 1 ? 's' : ''} ✕
          </button>
        )}
        {warnings.length > 0 && (
          <button className="tb" onClick={onToggleWarnings}>
            <span style={{ color: 'var(--color-accent-300)' }}>◆</span> {warnings.length} warnings
          </button>
        )}
        <button className={`tb ${showKeys ? 'on' : ''}`} onClick={onToggleKeys}
          title="Keyboard shortcuts (?)" aria-pressed={showKeys}>Keys</button>
        <Segmented
          name="view"
          value={view}
          onChange={onView}
          padding="4px 10px"
          fontSize={11}
          options={[{ value: 'timeline', label: 'Timeline' }, { value: 'table', label: 'Table' }]}
        />
        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={onExport}>Export →</button>
      </div>
    </div>
  );
}
