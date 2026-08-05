import { useRef } from 'react';
import DropZone from '../ui/DropZone.jsx';
import Field from '../ui/Field.jsx';

const Stat = ({ label, children }) => (
  <div>
    <div className="k-label">{label}</div>
    <span className="mono" style={{ color: 'var(--color-neutral-200)' }}>{children}</span>
  </div>
);

const writePlan = (stemCount, regionCount) => [
  ['project folder', 'AUTO', 'tag-accent', `${stemCount} stem WAVs + .ot slice files placed inside the project folder (no set-level AUDIO pool)`],
  ['project.work', 'AUTO', 'tag-accent', `${stemCount} Static sample slots written (1–${stemCount}, stem order = track order; timestretch off, project BPM, trig quantize direct)`],
  ['markers.work', 'AUTO', 'tag-accent', 'trim + 64-slice grid written per Static slot — this is the file the device reads slot slices from, so they appear without reloading samples'],
  ['bank02+.work', 'AUTO', 'tag-accent', `${regionCount} patterns written in place: one trig per stem-slice with a slice p-lock (no sample locks — tracks play their default sample), per-track scale, master length INF at master scale 1x; checksum recomputed. Structure is verified against your own file first — any mismatch falls back to an untouched copy.`],
  ['parts / scenes · bank01', 'VERIFIED', 'tag-neutral', 'never rewritten — byte-identity of the part data (where scenes live) is checked after every bank write'],
  ['on device, once', 'MANUAL', 'tag-neutral', `on tracks 1–${Math.min(8, stemCount)} in the part, assign a STATIC machine and set its default sample (TRK DEFAULT) to the matching slot — slices are p-locked per trig, so nothing else is needed`],
  ['PATTERNS.html', 'SHEET', 'tag-neutral', 'printable reference of everything written, and the manual fallback if a bank fails verification'],
];

/** Step 6: rewrite a copy of the user's own project folder. */
export default function ProjectStep({
  project, dragging, stemCount, regionCount, folderName, folderPlaceholder, busy, report,
  onPickFolder, onPickZip, onFiles, onFolderName, onGenerate,
}) {
  const folderInput = useRef(null);
  const zipInput = useRef(null);

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) 1fr', gap: 18, padding: '26px 24px', alignContent: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h6 style={{ color: 'var(--color-neutral-500)', margin: 0 }}>
          Project builder <span className="tag tag-outline" style={{ fontSize: 9, marginLeft: 6, whiteSpace: 'nowrap' }}>PHASE 2</span>
        </h6>
        <p style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', margin: 0 }}>
          Drop your own default Octatrack project folder (saved from your unit). OSSC never touches it in
          place — it produces a copy with the stems inside the project folder, Static slots assigned, and the
          Bank 2+ patterns programmed: trigs, slice p-locks, per-track scales.
        </p>

        <DropZone active={dragging} onClick={() => folderInput.current?.click()} style={{ padding: '28px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--color-neutral-200)', marginBottom: 4 }}>Drop or select project folder</div>
          <div className="hint">project.work + bank files from your CF card — a .zip of the folder works too</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <span className="btn btn-secondary" style={{ fontSize: 11, pointerEvents: 'none' }}>Browse folder</span>
            <button className="btn btn-secondary" style={{ fontSize: 11 }}
              onClick={e => { e.stopPropagation(); zipInput.current?.click(); }}>Browse .zip</button>
          </div>
        </DropZone>

        <input ref={folderInput} type="file" webkitdirectory="true" style={{ display: 'none' }}
          onChange={e => { onFiles([...e.target.files]); e.target.value = ''; }} />
        <input ref={zipInput} type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => { onFiles([...e.target.files]); e.target.value = ''; }} />

        <div className="card" style={{ border: '1px solid var(--color-accent-800)' }}>
          <div className="card-kicker">Scene preservation</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-neutral-400)', lineHeight: 1.6 }}>
            Scenes live in a bank's part data. OSSC writes only the pattern sections: byte offsets are
            verified against your own file's section markers before writing, and the part region is checked
            byte-identical afterwards — on any mismatch the bank is copied unchanged instead. Keep a backup
            and verify the first generated project on the device.
          </div>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {!project ? (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', padding: '24px 0' }}>
            No project loaded. Everything on this screen stays in your browser.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
              <Stat label="Folder">{project.folder}</Stat>
              <Stat label="OS version">{project.os}</Stat>
              <Stat label="Files">{project.files}</Stat>
              <Stat label="Banks">
                {project.banks.length
                  ? `${project.banks.length} (${project.banks.slice(0, 3).join(', ')}${project.banks.length > 3 ? '…' : ''})`
                  : 'none found'}
              </Stat>
            </div>
            {project.warn && <div className="notice">◆ {project.warn}</div>}

            <h6 style={{ color: 'var(--color-neutral-500)', margin: '10px 0 2px' }}>Write plan</h6>
            <table className="table" style={{ maxWidth: 720 }}>
              <thead><tr><th>Target</th><th style={{ width: 64 }} /><th>Change</th></tr></thead>
              <tbody>
                {writePlan(stemCount, regionCount).map(([target, tag, tagClass, change]) => (
                  <tr key={target}>
                    <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-neutral-300)' }}>{target}</td>
                    <td><span className={`tag ${tagClass}`} style={{ fontSize: 9 }}>{tag}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>{change}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Field label="Output folder / ZIP name" value={folderName} onChange={onFolderName}
              placeholder={folderPlaceholder} style={{ maxWidth: 320, marginTop: 8 }} />

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
              <button className="btn btn-primary" onClick={onGenerate} disabled={busy}>
                {busy ? 'Generating…' : 'Generate project copy (ZIP)'}
              </button>
              <span className="hint" style={{ maxWidth: 420 }}>
                Bank format per community research (ot-tools-io); every offset re-verified against your own
                file before writing. One-time device step afterwards: STATIC machines on the used tracks with
                the matching slot as TRK DEFAULT — slices are already p-locked per trig.
              </span>
            </div>

            {report && (
              <div className="card elev-sm" style={{ marginTop: 14, maxWidth: 720 }}>
                <div className="card-kicker">Generation report</div>
                {report.map((line, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--color-neutral-300)', display: 'flex', gap: 8 }}>
                    <span style={{ color: line.warn ? 'var(--color-accent-300)' : 'var(--color-accent-500)' }}>
                      {line.warn ? '◆' : '✓'}
                    </span>
                    <span>{line.text}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 4 }}>
                  Copy the ZIP contents onto your CF card set: the project folder (audio included) goes beside
                  your other projects. Keep a backup; verify the first load on the device.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
