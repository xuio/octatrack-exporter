import { useRef } from 'react';
import DropZone from '../ui/DropZone.jsx';
import { DEMO_LIST } from '../../lib/index.js';

const StemRow = ({ stem, index, count, onRename, onMove, onRemove }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid color-mix(in srgb, var(--color-neutral-800) 55%, transparent)' }}>
    <span className="mono" style={{ width: 16, fontSize: 12, color: 'var(--color-accent-300)' }}>{index + 1}</span>
    <input
      className="input"
      aria-label={`Name of stem ${index + 1}`}
      value={stem.name}
      onChange={e => onRename(stem.id, e.target.value)}
      style={{ width: 150, minHeight: 30, padding: '3px 8px', fontSize: 12.5, letterSpacing: '.05em' }}
    />
    <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {stem.fileName}
    </span>
    <span className="mono" style={{ fontSize: 10.5, color: 'var(--color-neutral-500)' }}>
      {`${(stem.frames / 44100 / 60) | 0}:${String((stem.frames / 44100 % 60) | 0).padStart(2, '0')}`}
      {` · ${stem.bits}-bit · ${stem.frames.toLocaleString()} smp`}
    </span>
    {stem.warnings.length > 0 && (
      <span className="tag tag-accent" style={{ fontSize: 10 }} title={stem.warnings.join('; ')}>{stem.warnings.join('; ')}</span>
    )}
    <div style={{ display: 'flex', gap: 3 }}>
      <button className="msb" style={{ width: 20, height: 18 }} onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${stem.name} up`}>▲</button>
      <button className="msb" style={{ width: 20, height: 18 }} onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${stem.name} down`}>▼</button>
      <button className="msb" style={{ width: 20, height: 18 }} onClick={() => onRemove(stem.id)} aria-label={`Remove ${stem.name}`}>✕</button>
    </div>
  </div>
);

/** Step 1: stems and the arrangement MIDI. */
export default function FilesStep({
  stems, midi, error, reading, demoLoading, dragging, hint, canContinue, session,
  onFiles, onLoadDemo, onRemoveMidi, onRename, onMove, onRemove, onContinue,
  onRestoreSession, onDismissSession,
}) {
  const inputRef = useRef(null);

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 18, padding: '22px 24px', alignContent: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <DropZone active={dragging} onClick={() => inputRef.current?.click()} style={{ padding: '36px 24px' }}>
          <div style={{ fontSize: 15, color: 'var(--color-neutral-200)', marginBottom: 6 }}>Drop stems + arrangement MIDI</div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
            5–6 stereo WAV stems (44.1 kHz, 16/24-bit)<br />
            plus one MIDI file — a note at each section start<br />
            and one final note at the song&apos;s end<br />
            <span style={{ color: 'var(--color-neutral-600)' }}>drop a folder or a .zip of them all — that works too</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <span className="btn btn-secondary" style={{ fontSize: 12, pointerEvents: 'none' }}>Browse files</span>
          </div>
          {reading && <div className="pulse" style={{ marginTop: 10, fontSize: 11.5, color: 'var(--color-accent-300)' }}>Reading {reading}…</div>}
        </DropZone>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".wav,.mid,.midi,.zip"
          style={{ display: 'none' }}
          onChange={e => { onFiles([...e.target.files]); e.target.value = ''; }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
            {demoLoading ? 'Synthesizing demo song…' : 'No files handy? Load a demo:'}
          </span>
          {DEMO_LIST.map(demo => (
            <button key={demo.id} className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }}
              onClick={() => onLoadDemo(demo.id)} disabled={demoLoading}>
              {demo.label} · {demo.bpm}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', lineHeight: 1.6 }}>
          Fully client-side — audio and project data never leave this browser. Nothing is uploaded, nothing is stored.
        </div>

        {session && (
          <div className="card elev-sm" style={{ border: '1px solid var(--color-accent-700)' }}>
            <div className="card-kicker">Previous session</div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-300)' }}>
              These are the same files you worked on before, with{' '}
              <b style={{ fontWeight: 500 }}>{session.edits} slice edit{session.edits === 1 ? '' : 's'}</b> saved.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={onRestoreSession}>
                Restore edits
              </button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={onDismissSession}>
                Start fresh
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--color-accent-300)', background: 'var(--color-accent-900)', border: '1px solid var(--color-accent-800)', borderRadius: 'var(--radius-md)', padding: '10px 12px', whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}

        {midi && (
          <div className="card elev-sm">
            <div className="card-kicker">Arrangement MIDI</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ fontSize: 13 }}>{midi.fileName}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '0 4px' }} onClick={onRemoveMidi}>remove</button>
            </div>
            <div className="hint">
              {midi.noteCount} notes · {midi.ppq} ppq
              {midi.bpm ? ` · tempo event ${midi.bpm} BPM` : ' · no tempo event'}
              {` → ${Math.max(0, midi.noteCount - 1)} regions`}
            </div>
          </div>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <h6 style={{ color: 'var(--color-neutral-500)', marginBottom: 10 }}>
          Stems <span style={{ textTransform: 'none', letterSpacing: 0 }}>{stems.length ? `· ${stems.length} loaded` : ''}</span>
        </h6>

        {stems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stems.map((stem, i) => (
              <StemRow key={stem.id} stem={stem} index={i} count={stems.length}
                onRename={onRename} onMove={onMove} onRemove={onRemove} />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', padding: '24px 0' }}>
            No stems yet — drop WAV files on the left. Order here becomes the Octatrack track order
            (matters for scene locks in the project builder).
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={onContinue} disabled={!canContinue}>Continue → Tempo</button>
          <span className="hint">{hint}</span>
        </div>
      </div>
    </div>
  );
}
