export default function ProjectStep({ vals }) {
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(320px,400px) 1fr', gap: 18, padding: '26px 24px', alignContent: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h6 style={{ color: 'var(--color-neutral-500)', margin: 0 }}>Project builder <span className="tag tag-outline" style={{ fontSize: 9, marginLeft: 6, whiteSpace: 'nowrap' }}>PHASE 2</span></h6>
        <p style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', margin: 0 }}>
          Drop your own default Octatrack project folder (saved from your unit). OSSC never touches it in place — it produces a copy with the stems inside the project folder, Static slots assigned, and the Bank 2+ patterns programmed: trigs, slice p-locks, per-track scales.
        </p>
        <div className={'drop' + (vals.projDropping ? ' dropping' : '')} onClick={vals.onPickProject}
          onDragOver={vals.onProjectDragOver} onDragLeave={vals.onProjectDragLeave} onDrop={vals.onProjectDrop} style={{ padding: '28px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--color-neutral-200)', marginBottom: 4 }}>Drop or select project folder</div>
          <div className="hint">project.work + bank files from your CF card — a .zip of the folder works too</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <span className="btn btn-secondary" style={{ fontSize: 11, pointerEvents: 'none' }}>Browse folder</span>
            <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); vals.onPickProjectZip(); }}>Browse .zip</button>
          </div>
        </div>
        <input type="file" webkitdirectory="true" style={{ display: 'none' }} ref={vals.dirInputRef} onChange={vals.onProjectInput} />
        <input type="file" accept=".zip" style={{ display: 'none' }} ref={vals.zipInputRef} onChange={vals.onProjectInput} />
        <div className="card" style={{ border: '1px solid var(--color-accent-800)' }}>
          <div className="card-kicker">Scene preservation</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-neutral-400)', lineHeight: 1.6 }}>
            Scenes live in a bank's part data. OSSC writes only the pattern sections: byte offsets are verified against your own file's section markers before writing, and the part region is checked byte-identical afterwards — on any mismatch the bank is copied unchanged instead. Keep a backup and verify the first generated project on the device.
          </div>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        {vals.hasProject ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
              <div><div className="k-label">Folder</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.projFolder}</span></div>
              <div><div className="k-label">OS version</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.projOs}</span></div>
              <div><div className="k-label">Files</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.projFiles}</span></div>
              <div><div className="k-label">Banks</div><span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{vals.projBanks}</span></div>
            </div>
            {vals.hasProjWarn && <div className="notice">◆ {vals.projWarn}</div>}
            <h6 style={{ color: 'var(--color-neutral-500)', margin: '10px 0 2px' }}>Write plan</h6>
            <table className="table" style={{ maxWidth: 720 }}>
              <thead><tr><th>Target</th><th style={{ width: 64 }}></th><th>Change</th></tr></thead>
              <tbody>
                {vals.projPlan.map((p, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-neutral-300)' }}>{p.target}</td>
                    <td><span className={'tag ' + p.tagCls} style={{ fontSize: 9 }}>{p.tag}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{p.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="field" style={{ maxWidth: 320, marginTop: 8 }}>
              <label>Output folder / ZIP name</label>
              <input className="input" value={vals.projName} onChange={vals.onProjName} placeholder={vals.projNamePh} />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
              <button className="btn btn-primary" onClick={vals.onGenerateProject} disabled={vals.projBusy}>{vals.generateLabel}</button>
              <span className="hint" style={{ maxWidth: 420 }}>
                Bank format per community research (ot-tools-io); every offset re-verified against your own file before writing. One-time device step afterwards: STATIC machines on the used tracks with the matching slot as TRK DEFAULT — slices are already p-locked per trig.
              </span>
            </div>
            {vals.hasProjReport && (
              <div className="card elev-sm" style={{ marginTop: 14, maxWidth: 720 }}>
                <div className="card-kicker">Generation report</div>
                {vals.projReport.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--color-neutral-300)', display: 'flex', gap: 8 }}>
                    <span style={{ color: r.c }}>{r.mark}</span><span>{r.text}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 4 }}>
                  Copy the ZIP contents onto your CF card set: the project folder (audio included) goes beside your other projects. Keep a backup; verify the first load on the device.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', padding: '24px 0' }}>No project loaded. Everything on this screen stays in your browser.</div>
        )}
      </div>
    </div>
  );
}
