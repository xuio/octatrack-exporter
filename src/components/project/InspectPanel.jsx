import PatternTable from './PatternTable.jsx';

/** Slot slice grids as markers.work has them — the file the device reads slices from. */
const Markers = ({ markers }) => {
  if (!markers) return <div className="hint">markers.work not found in this project.</div>;
  if (markers.error) return <div className="notice">◆ markers.work: {markers.error}</div>;
  if (!markers.slots.length) return <div className="hint">markers.work has no sliced Static slots.</div>;
  return (
    <div style={{ fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
      {markers.slots.map(slot => (
        <div key={slot.slot} className="mono">
          slot {slot.slot}: {slot.sliceCount} slices · trim {slot.trimStart}–{slot.trimEnd}
        </div>
      ))}
      <div className="hint" style={{ marginTop: 4 }}>
        checksum {markers.checksumOk ? 'matches' : 'does NOT match the contents'}
      </div>
    </div>
  );
};

/** Decode-only view of a loaded project: what is programmed in it right now. */
export default function InspectPanel({ result }) {
  return (
    <div className="card elev-sm" style={{ maxWidth: 720 }}>
      <div className="card-kicker">Programmed patterns in the loaded project</div>
      <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
        Decoded from this project&apos;s own bank files — patterns with no trigs are left out, and a bank whose
        layout does not verify is skipped rather than guessed at.
      </div>
      <PatternTable banks={result.banks} />
      <div className="k-label" style={{ marginTop: 6 }}>markers.work</div>
      <Markers markers={result.markers} />
    </div>
  );
}
