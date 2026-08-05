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
      <button className={'tb ' + vals.followCls} onClick={vals.onToggleFollow} title="Keep the view following the playhead">Follow</button>
      {vals.hasLoop && (
        <button className="tag tag-accent" style={{ fontSize: 10, border: 'none', cursor: 'pointer' }} onClick={vals.onClearLoop} title="Release the loop and keep playing from here">⟳ looping {vals.loopLabel} ✕</button>
      )}
      <div style={{ display: 'inline-flex', flex: 'none', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>VOL</span>
        <input type="range" min="0" max="1" step="0.01" style={{ width: 90 }} value={vals.vol} onChange={vals.onVol} />
        <canvas ref={vals.masterMeterRef} style={{ width: 66, height: 10, background: 'var(--color-neutral-900)', borderRadius: 2 }} title="Master level" />
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
        <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }} title="Pinch or ⌘/Ctrl-scroll on the timeline to zoom">ZOOM</span>
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
        {vals.editCount > 0 && (
          <button className="tb" onClick={vals.onResetEdits} title="Discard manual slice edits and go back to automatic trimming">{vals.editCount} edit{vals.editCount > 1 ? 's' : ''} ✕</button>
        )}
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

// Whole-song strip: click or drag anywhere to move the playhead; the lighter
// rectangle is the part of the song the timeline below is showing.
function Overview({ vals }) {
  return (
    <div ref={vals.ovRef} onPointerDown={vals.onOvDown} title="Click or drag to jump"
      style={{ position: 'relative', height: 26, flex: 'none', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface)', cursor: 'ew-resize', userSelect: 'none', overflow: 'hidden' }}>
      {vals.ovRegions.map(r => (
        <div key={r.k} style={{ position: 'absolute', top: 0, bottom: 0, left: r.left + '%', width: r.width + '%', borderLeft: '1px solid var(--color-neutral-800)', background: r.bg, overflow: 'hidden', padding: '5px 0 0 4px', pointerEvents: 'none' }}>
          <span style={{ fontSize: 9, letterSpacing: '.04em', color: 'var(--color-neutral-500)', whiteSpace: 'nowrap' }}>{r.label}</span>
        </div>
      ))}
      <div ref={vals.ovVpRef} style={{ position: 'absolute', top: 0, bottom: 0, background: 'color-mix(in srgb,var(--color-accent) 12%,transparent)', borderLeft: '1px solid var(--color-accent-600)', borderRight: '1px solid var(--color-accent-600)', pointerEvents: 'none' }} />
      <div ref={vals.ovPhRef} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'var(--color-accent)', boxShadow: '0 0 5px var(--color-accent)', pointerEvents: 'none' }} />
    </div>
  );
}

function Timeline({ vals }) {
  return (
    <>
      <Overview vals={vals} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: vals.railW + 'px 1fr', minHeight: 0 }}>
        <div style={{ position: 'relative', borderRight: '1px solid var(--color-neutral-800)', overflow: 'hidden' }}>
          <div style={{ height: 58, borderBottom: '1px solid var(--color-neutral-800)' }} />
          {vals.lanes.map(lane => (
            <div key={lane.id} style={{ position: 'relative', height: vals.laneH, display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 45%,transparent)', fontSize: 11, letterSpacing: '.06em', color: 'var(--color-neutral-300)' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.name}</span>
              <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
                <button className={'msb ' + lane.mCls} onClick={lane.onMute}>M</button>
                <button className={'msb ' + lane.sCls} onClick={lane.onSolo}>S</button>
              </span>
              {vals.scopesOn && (
                <canvas ref={lane.scopeRef} style={{ flex: 'none', width: vals.scopeW, height: 'calc(100% - 12px)', background: 'var(--color-bg)', border: '1px solid color-mix(in srgb,var(--color-neutral-800) 60%,transparent)', borderRadius: 3 }} />
              )}
              <canvas ref={lane.meterRef} style={{ flex: 'none', width: 5, height: 'calc(100% - 12px)', background: 'var(--color-neutral-900)', borderRadius: 2 }} />
              <div onPointerDown={vals.onLaneResize} title="Drag to resize track height"
                style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 5, cursor: 'ns-resize', zIndex: 2 }} />
            </div>
          ))}
          <div onPointerDown={vals.onRailResize} title="Drag to resize the track column"
            style={{ position: 'absolute', top: 0, bottom: 0, right: -2, width: 5, cursor: 'col-resize', zIndex: 3 }} />
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'hidden' }} ref={vals.scrollRef} onScroll={vals.onScroll}>
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
            <div style={{ height: 18, position: 'relative', borderBottom: '1px solid var(--color-neutral-800)', cursor: 'ew-resize', backgroundImage: vals.rulerGrid }} onPointerDown={vals.onRulerDown}>
              {vals.barTicks.map(bt => (
                <span key={bt.n} className="mono" style={{ position: 'absolute', left: bt.left, top: 2, fontSize: 9, color: 'var(--color-neutral-500)', paddingLeft: 3, borderLeft: '1px solid var(--color-neutral-700)', pointerEvents: 'none' }}>{bt.n}</span>
              ))}
            </div>
            {vals.lanes.map(lane => (
              <div key={lane.id} onClick={vals.onDeselect} style={{ height: vals.laneH, position: 'relative', borderBottom: '1px solid color-mix(in srgb,var(--color-neutral-800) 45%,transparent)', backgroundImage: vals.laneGrid, opacity: lane.op }}>
                {lane.ghosts.map(g => (
                  <div key={'g' + g.k} className="slice-ghost" onClick={g.onClick} title={g.tip} style={{ left: g.left, width: g.width }} />
                ))}
                {lane.slices.map(sl => (
                  <div key={sl.key} className="slice-block" onClick={sl.onClick} onDoubleClick={sl.onDbl} title={sl.tip}
                    style={{ left: sl.left, width: sl.width, border: '1px solid ' + sl.border, boxShadow: sl.glow }}>
                    {sl.hasWave && (
                      <svg viewBox={sl.vb} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
                        <path d={sl.p1} fill={sl.f1} opacity={sl.o1} />
                        <path d={sl.p2} fill={sl.f2} />
                        <path d={sl.p3} fill={sl.f3} />
                      </svg>
                    )}
                    <b className="mono" style={{ position: 'absolute', top: 0, left: 4, fontSize: 9, fontWeight: 500, color: 'var(--color-accent-200)' }}>{sl.num}{sl.edited ? '✎' : ''}</b>
                    {sl.selected && <>
                      <div className="trim-h" onPointerDown={sl.onTrimL} title="Drag to trim the start (snaps to bars)" style={{ left: 0 }} />
                      <div className="trim-h" onPointerDown={sl.onTrimR} title="Drag to trim the end (snaps to bars)" style={{ right: 0 }} />
                    </>}
                  </div>
                ))}
              </div>
            ))}
            {vals.regionLines.map((rl, i) => (
              <div key={i} style={{ position: 'absolute', top: 40, bottom: 0, left: rl.left, width: 1, background: 'color-mix(in srgb,var(--color-neutral-600) 45%,transparent)', pointerEvents: 'none' }} />
            ))}
            <div ref={vals.playheadRef} onPointerDown={vals.onPlayheadDown} style={{ position: 'absolute', top: 0, bottom: 0, left: -5, width: 11, cursor: 'ew-resize', transform: `translateX(${vals.playheadPx}px)`, zIndex: 4 }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 1, background: 'var(--color-accent)', boxShadow: '0 0 6px var(--color-accent)' }} />
              <div style={{ position: 'absolute', top: 0, left: 1, width: 9, height: 7, background: 'var(--color-accent)', clipPath: 'polygon(0 0,100% 0,50% 100%)' }} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px', borderTop: '1px solid var(--color-divider)', fontSize: 11, color: 'var(--color-neutral-400)', minHeight: 34, flexWrap: 'wrap' }}>
        {vals.hasSel ? (
          <>
            <span className="tag tag-accent" style={{ fontSize: 10 }}>{vals.selTitle}</span>
            <span>region <b style={{ color: 'var(--color-neutral-200)', fontWeight: 500 }}>{vals.selRegion}</b></span>
            <span>song bar <b style={{ color: 'var(--color-neutral-200)', fontWeight: 500 }}>{vals.selFromBar}</b> = pattern bar <b style={{ color: 'var(--color-neutral-200)', fontWeight: 500 }}>{vals.selPatternBar}</b></span>
            <span>trig step <b className="mono" style={{ color: 'var(--color-accent-300)', fontWeight: 500 }}>{vals.selTrig}</b></span>
            <span className="mono" style={{ color: 'var(--color-neutral-500)' }}>{vals.selSamples}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>START</span>
              <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => vals.onNudge('l', -1)} title="Extend start by one bar">−</button>
              <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => vals.onNudge('l', 1)} title="Trim start by one bar">+</button>
              <span style={{ fontSize: 10, color: 'var(--color-neutral-500)', marginLeft: 4 }}>END</span>
              <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => vals.onNudge('r', -1)} title="Trim end by one bar">−</button>
              <button className="tb" style={{ minWidth: 20, height: 20 }} onClick={() => vals.onNudge('r', 1)} title="Extend end by one bar">+</button>
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={vals.onAudition}>Audition</button>
            {vals.selEdited && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={vals.onResetSel}>Reset trim</button>}
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={vals.onDeleteSel} title="Delete this slice (Del)">Delete</button>
          </>
        ) : (
          <span style={{ color: 'var(--color-neutral-600)' }}>Select a slice to trim or delete it — drag its edges to trim, double-click to audition. Dashed blocks add a slice back.</span>
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
