function Transport({ vals }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
      <button className="tb" onClick={vals.onToStart} title="Back to bar 1">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 0h1.6v10H2zM9 0L3.8 5 9 10z" fill="currentColor" /></svg>
      </button>
      <button className={'tb ' + vals.playCls} onClick={vals.onPlay} title="Play (space)">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 0l8 5-8 5z" fill="currentColor" /></svg>
      </button>
      <button className="tb" onClick={vals.onStop} title="Stop (space)">
        <svg width="9" height="9" viewBox="0 0 9 9"><rect width="9" height="9" fill="currentColor" /></svg>
      </button>
      <span className="mono" ref={vals.posRef} style={{ fontSize: 14, letterSpacing: '.08em', color: 'var(--color-accent-300)', border: '1px solid var(--color-neutral-800)', borderRadius: 4, padding: '2px 10px', background: 'var(--color-surface)', minWidth: 74, textAlign: 'center' }}>{vals.posLabel}</span>
      <span style={{ fontSize: 10.5, color: 'var(--color-neutral-500)' }}>from bar <b className="mono" style={{ color: 'var(--color-neutral-300)', fontWeight: 500 }}>{vals.startMeasure}</b> — click the ruler to move</span>
      {vals.hasLoop && (
        <button className="tag tag-accent" style={{ fontSize: 10, border: 'none', cursor: 'pointer' }} onClick={vals.onClearLoop} title="Release loop">⟳ looping {vals.loopLabel} ✕</button>
      )}
      <div style={{ display: 'inline-flex', flex: 'none', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>VOL</span>
        <input type="range" min="0" max="1" step="0.01" style={{ width: 90 }} value={vals.vol} onChange={vals.onVol} />
        <canvas ref={vals.masterMeterRef} width="66" height="10" style={{ width: 66, height: 10, background: 'var(--color-neutral-900)', borderRadius: 2 }} title="Master level" />
      </div>
      <div style={{ display: 'inline-flex', flex: 'none', alignItems: 'center', gap: 4, marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>THRESHOLD</span>
        <input type="range" min="-100" max="-6" step="1" style={{ width: 78 }} value={vals.thresholdVal} onChange={vals.onThresholdSlide} />
        <button className="tb" style={{ minWidth: 22, height: 22 }} onClick={vals.onThDown} title="−3 dB">−</button>
        <input className="input mono" type="text" inputMode="numeric" style={{ width: 46, minHeight: 26, padding: '2px 4px', fontSize: 12, textAlign: 'center' }} value={vals.thresholdStr} onChange={vals.onThresholdDraft} onBlur={vals.onThresholdCommit} onKeyDown={vals.onThresholdKey} />
        <button className="tb" style={{ minWidth: 22, height: 22 }} onClick={vals.onThUp} title="+3 dB">+</button>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>dBFS</span>
      </div>
      <div style={{ display: 'inline-flex', flex: 'none', gap: 4, alignItems: 'center', marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>ZOOM</span>
        <button className="tb" style={{ minWidth: 24, height: 22 }} onClick={vals.onZoomOut}>−</button>
        <button className="tb" style={{ minWidth: 24, height: 22 }} onClick={vals.onZoomIn}>+</button>
        <button className="tb" style={{ height: 22 }} onClick={vals.onZoomFit}>Fit</button>
      </div>
      <div style={{ display: 'inline-flex', flex: 'none', gap: 4, alignItems: 'center', marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>WAVE</span>
        <div className="seg" style={{ borderRadius: 4 }}>
          <label className="seg-opt" style={{ padding: '3px 8px', fontSize: 10.5 }}><input type="radio" name="wv" checked={vals.wvSpec} onChange={vals.onWvSpec} />Spectral</label>
          <label className="seg-opt" style={{ padding: '3px 8px', fontSize: 10.5 }}><input type="radio" name="wv" checked={vals.wvBand} onChange={vals.onWvBand} />Band</label>
          <label className="seg-opt" style={{ padding: '3px 8px', fontSize: 10.5 }}><input type="radio" name="wv" checked={vals.wvBars} onChange={vals.onWvBars} />Bars</label>
        </div>
        <button className={'tb ' + vals.scopeCls} style={{ height: 24 }} onClick={vals.onToggleScopes} title="Per-track oscilloscopes">Scopes</button>
        <button className={'tb ' + vals.fftCls} style={{ height: 24 }} onClick={vals.onToggleFft} title="Per-track spectrum analyzer">FFT</button>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {vals.hasWarnings && (
          <button className="tb" onClick={vals.onToggleWarn}><span style={{ color: 'var(--color-accent-300)' }}>◆</span> {vals.warnCount} warnings</button>
        )}
        <div className="seg" style={{ borderRadius: 4 }}>
          <label className="seg-opt" style={{ padding: '4px 10px', fontSize: 11 }}><input type="radio" name="v" checked={vals.viewTl} onChange={vals.onViewTl} />Timeline</label>
          <label className="seg-opt" style={{ padding: '4px 10px', fontSize: 11 }}><input type="radio" name="v" checked={vals.viewTable} onChange={vals.onViewTable} />Table</label>
        </div>
        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={vals.goExport}>Export →</button>
      </div>
    </div>
  );
}

function Timeline({ vals }) {
  return (
    <>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: vals.railCols, minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--color-neutral-800)' }}>
          <div style={{ height: 58, borderBottom: '1px solid var(--color-neutral-800)' }} />
          {vals.lanes.map(lane => (
            <div key={lane.name} style={{ height: vals.laneH, display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 45%,transparent)', fontSize: 11, letterSpacing: '.06em', color: 'var(--color-neutral-300)' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.name}</span>
              <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
                <button className={'msb ' + lane.mCls} onClick={lane.onMute}>M</button>
                <button className={'msb ' + lane.sCls} onClick={lane.onSolo}>S</button>
              </span>
              {vals.scopesOn && (
                <canvas ref={lane.scopeRef} width="54" height="34" style={{ flex: 'none', width: 54, height: 'calc(100% - 12px)', background: 'var(--color-bg)', border: '1px solid color-mix(in srgb,var(--color-neutral-800) 60%,transparent)', borderRadius: 3 }} />
              )}
              <canvas ref={lane.meterRef} width="5" height="40" style={{ flex: 'none', width: 5, height: 'calc(100% - 12px)', background: 'var(--color-neutral-900)', borderRadius: 2 }} />
            </div>
          ))}
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'hidden' }} ref={vals.scrollRef}>
          <div style={{ position: 'relative', width: vals.tlWidth }}>
            <div style={{ height: 40, position: 'relative', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 55%,transparent)' }}>
              {vals.regionBlocks.map((rb, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: rb.left, width: rb.width, borderLeft: '1px solid var(--color-neutral-800)', padding: '4px 24px 3px 8px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', background: rb.bg }}>
                  <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--color-neutral-200)', letterSpacing: '.03em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rb.title}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rb.sub}</div>
                  <button className={'msb ' + rb.loopCls} style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 16, fontSize: 11, lineHeight: 1 }} onClick={rb.onLoop} title="Loop this section">⟳</button>
                </div>
              ))}
            </div>
            <div style={{ height: 18, position: 'relative', borderBottom: '1px solid var(--color-neutral-800)', cursor: 'pointer', backgroundImage: vals.rulerGrid }} onClick={vals.onRulerClick}>
              {vals.barTicks.map(bt => (
                <span key={bt.n} className="mono" style={{ position: 'absolute', left: bt.left, top: 2, fontSize: 9, color: 'var(--color-neutral-500)', paddingLeft: 3, borderLeft: '1px solid var(--color-neutral-700)', pointerEvents: 'none' }}>{bt.n}</span>
              ))}
            </div>
            {vals.lanes.map(lane => (
              <div key={lane.name} onClick={vals.onDeselect} style={{ height: vals.laneH, position: 'relative', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 45%,transparent)', backgroundImage: vals.laneGrid, opacity: lane.op }}>
                {lane.slices.map(sl => (
                  <div key={sl.num} className="slice-block" onClick={sl.onClick} onDoubleClick={sl.onDbl} title={sl.tip}
                    style={{ left: sl.left, width: sl.width, border: '1px solid ' + sl.border, boxShadow: sl.glow }}>
                    <svg viewBox={sl.vb} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
                      <path d={sl.p1} fill={sl.f1} opacity={sl.o1} />
                      <path d={sl.p2} fill={sl.f2} />
                      <path d={sl.p3} fill={sl.f3} />
                    </svg>
                    <b className="mono" style={{ position: 'absolute', top: 0, left: 4, fontSize: 9, fontWeight: 500, color: 'var(--color-accent-200)' }}>{sl.num}</b>
                  </div>
                ))}
              </div>
            ))}
            {vals.regionLines.map((rl, i) => (
              <div key={i} style={{ position: 'absolute', top: 40, bottom: 0, left: rl.left, width: 1, background: 'color-mix(in srgb,var(--color-neutral-600) 45%,transparent)', pointerEvents: 'none' }} />
            ))}
            <div ref={vals.playheadRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'var(--color-accent)', boxShadow: '0 0 6px var(--color-accent)', pointerEvents: 'none', transform: `translateX(${vals.playheadPx}px)` }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 16px', borderTop: '1px solid var(--color-divider)', fontSize: 11, color: 'var(--color-neutral-400)', minHeight: 34 }}>
        {vals.hasSel ? (
          <>
            <span className="tag tag-accent" style={{ fontSize: 10 }}>{vals.selTitle}</span>
            <span>region <b style={{ color: 'var(--color-neutral-200)', fontWeight: 500 }}>{vals.selRegion}</b></span>
            <span>audio from bar <b style={{ color: 'var(--color-neutral-200)', fontWeight: 500 }}>{vals.selFromBar}</b></span>
            <span>trig step <b className="mono" style={{ color: 'var(--color-accent-300)', fontWeight: 500 }}>{vals.selTrig}</b></span>
            <span className="mono" style={{ color: 'var(--color-neutral-500)' }}>{vals.selSamples}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={vals.onAudition}>Audition</button>
          </>
        ) : (
          <span style={{ color: 'var(--color-neutral-600)' }}>Select a slice to inspect it — double-click to audition.</span>
        )}
      </div>
    </>
  );
}

function TableView({ vals }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 'min-content' }}>
        {vals.tableRows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 45%,transparent)' }}>
            <div style={{ flex: 'none', width: 130, padding: '6px 8px', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--color-neutral-500)', textTransform: 'uppercase' }}>{row.label}</div>
            {row.cells.map((c, ci) => (
              <div key={ci} style={{ flex: 'none', width: 158, padding: '6px 8px', borderLeft: '1px solid color-mix(in srgb,var(--color-neutral-800) 45%,transparent)', minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 11, color: c.c1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l1}</div>
                {c.hasL2 && <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l2}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={vals.onCsv}>Export CSV</button>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={vals.onPrint}>Printable version</button>
      </div>
    </div>
  );
}

export default function ResultsStep({ vals }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Transport vals={vals} />
      {vals.showWarn && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 3, background: 'color-mix(in srgb,var(--color-surface) 55%,transparent)' }}>
          {vals.warningsVm.map((w, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--color-neutral-400)' }}><span style={{ color: 'var(--color-accent-300)' }}>◆</span> {w.text}</div>
          ))}
        </div>
      )}
      {vals.viewTl ? <Timeline vals={vals} /> : <TableView vals={vals} />}
    </div>
  );
}
