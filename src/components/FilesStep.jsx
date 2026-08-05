export default function FilesStep({ vals }) {
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(340px,420px) 1fr', gap: 18, padding: '22px 24px', alignContent: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="drop" onDragOver={vals.onDragOver} onDrop={vals.onDrop} onClick={vals.onPickFiles} style={{ padding: '36px 24px' }}>
          <div style={{ fontSize: 15, color: 'var(--color-neutral-200)', marginBottom: 6 }}>Drop stems + arrangement MIDI</div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
            5–6 stereo WAV stems (44.1 kHz, 16/24-bit)<br />plus one MIDI file — a note at each section start<br />and one final note at the song's end<br />
            <span style={{ color: 'var(--color-neutral-600)' }}>a .zip of all of them works too</span>
          </div>
          <div style={{ marginTop: 14 }}><span className="btn btn-secondary" style={{ fontSize: 12, pointerEvents: 'none' }}>Browse files</span></div>
          {vals.isReading && <div className="pulse" style={{ marginTop: 10, fontSize: 11.5, color: 'var(--color-accent-300)' }}>{vals.readingLabel}</div>}
        </div>
        <input type="file" multiple accept=".wav,.mid,.midi,.zip" style={{ display: 'none' }} ref={vals.fileInputRef} onChange={vals.onFileInput} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{vals.demoLead}</span>
          {vals.demosVm.map(d => (
            <button key={d.label} className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={d.onClick} disabled={vals.demoLoading}>{d.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', lineHeight: 1.6 }}>Fully client-side — audio and project data never leave this browser. Nothing is uploaded, nothing is stored.</div>
        {vals.hasFilesError && (
          <div style={{ fontSize: 12, color: 'var(--color-accent-300)', background: 'var(--color-accent-900)', border: '1px solid var(--color-accent-800)', borderRadius: 'var(--radius-md)', padding: '10px 12px', whiteSpace: 'pre-line' }}>{vals.filesError}</div>
        )}
        {vals.hasMidi && (
          <div className="card elev-sm">
            <div className="card-kicker">Arrangement MIDI</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ fontSize: 13 }}>{vals.midiName}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '0 4px' }} onClick={vals.onRemoveMidi}>remove</button>
            </div>
            <div className="hint">{vals.midiSummary}</div>
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <h6 style={{ color: 'var(--color-neutral-500)', marginBottom: 10 }}>Stems <span style={{ textTransform: 'none', letterSpacing: 0 }}>{vals.stemCountLabel}</span></h6>
        {vals.hasStems && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {vals.stemsVm.map(s => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 55%,transparent)' }}>
                <span className="mono" style={{ width: 16, fontSize: 12, color: 'var(--color-accent-300)' }}>{s.num}</span>
                <input className="input" style={{ width: 150, minHeight: 30, padding: '3px 8px', fontSize: 12.5, letterSpacing: '.05em' }} value={s.name} onChange={s.onName} />
                <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.fileName}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-neutral-500)' }}>{s.props}</span>
                {s.hasWarn && <span className="tag tag-accent" style={{ fontSize: 10 }} title={s.warnText}>{s.warnText}</span>}
                <div style={{ display: 'flex', gap: 3 }}>
                  <button className="msb" style={{ width: 20, height: 18 }} onClick={s.onUp} disabled={s.first}>▲</button>
                  <button className="msb" style={{ width: 20, height: 18 }} onClick={s.onDown} disabled={s.last}>▼</button>
                  <button className="msb" style={{ width: 20, height: 18 }} onClick={s.onRemove}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {vals.noStems && (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', padding: '24px 0' }}>No stems yet — drop WAV files on the left. Order here becomes the Octatrack track order (matters for scene locks in the project builder).</div>
        )}
        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={vals.onContinueFiles} disabled={vals.cantContinueFiles}>Continue → Tempo</button>
          <span className="hint">{vals.filesHint}</span>
        </div>
      </div>
    </div>
  );
}
