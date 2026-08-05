import Field from '../ui/Field.jsx';
import Notices from '../ui/Notices.jsx';
import { stemFileBase } from '../../export/naming.js';
import { estimateSize } from '../../export/stemFiles.js';

const StemCard = ({ index, stem, track, abbrev, onWav, onOt }) => {
  const base = stemFileBase(stem, index, abbrev);
  const count = track ? track.slices.length : 0;
  return (
    <div className="card elev-sm">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="mono" style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>{index + 1}</span>
        <span className="card-title" style={{ fontSize: 15 }}>{stem.name}</span>
        <span className="tag tag-neutral" style={{ fontSize: 10, marginLeft: 'auto' }}>
          {count ? `${count}${count > 64 ? ' slices (64 kept)' : ' slices'}` : 'no slices — skipped'}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
        {base}.wav <span style={{ color: 'var(--color-neutral-600)' }}>· {estimateSize(stem, track)}</span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
        {base}.ot <span style={{ color: 'var(--color-neutral-600)' }}>· 832 B</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={onWav} disabled={!count}>WAV</button>
        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={onOt} disabled={!count}>.ot</button>
      </div>
    </div>
  );
};

/** Step 5: per-stem chains and the ZIP of them all. */
export default function ExportStep({
  stems, tracks, abbrev, zipName, zipNamePlaceholder, warnings, busy, summary,
  onAbbrev, onZipName, onDownloadWav, onDownloadOt, onZip, onExportCsv, onPrint, onProject,
}) {
  return (
    <div style={{ flex: 1, padding: '26px 24px', maxWidth: 1020 }}>
      <h6 style={{ color: 'var(--color-neutral-500)' }}>Export</h6>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, margin: '12px 0 18px' }}>
        <Field label="Song abbreviation" value={abbrev} onChange={onAbbrev} placeholder="e.g. Shake" style={{ width: 220 }} />
        <Field label="ZIP name" value={zipName} onChange={onZipName} placeholder={zipNamePlaceholder} style={{ width: 240 }} />
        <span className="hint" style={{ paddingBottom: 9 }}>
          files: <span className="mono">{stems[0] ? `${stemFileBase(stems[0], 0, abbrev)}.wav / .ot` : '—'}</span>
        </span>
      </div>

      <Notices items={warnings} style={{ marginBottom: 14 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {stems.map((stem, i) => (
          <StemCard
            key={stem.id}
            index={i}
            stem={stem}
            track={tracks.get(stem.id)}
            abbrev={abbrev}
            onWav={() => onDownloadWav(stem, i)}
            onOt={() => onDownloadOt(stem, i)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={onZip} disabled={busy}>{busy ? 'Packing ZIP…' : 'Download all (ZIP)'}</button>
        <button className="btn btn-secondary" onClick={onExportCsv}>Pattern table CSV</button>
        <button className="btn btn-secondary" onClick={onPrint}>Printable table</button>
        <button className="btn btn-ghost" onClick={onProject}>Project builder →</button>
        <span className="hint" style={{ marginLeft: 'auto' }}>{summary}</span>
      </div>
    </div>
  );
}
