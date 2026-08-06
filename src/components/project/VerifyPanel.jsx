import PatternTable, { OK_COLOR, BAD_COLOR } from './PatternTable.jsx';

const Count = ({ value, label }) => (
  <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
    <span className="mono" style={{ fontSize: 14, color: 'var(--color-neutral-200)' }}>{value}</span>
    <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{label}</span>
  </div>
);

/**
 * The result of one readback pass, shown as a banner plus the decoded pattern
 * table it was computed from. `banks` is what the files say; where an intended
 * job was available the chips carry both, so a mismatch is visible per trig.
 */
export default function VerifyPanel({ title, source, verify, banks, defaultOpen = false }) {
  if (!verify) return null;
  const color = verify.ok ? OK_COLOR : BAD_COLOR;
  const patterns = banks.reduce((n, b) => n + b.patterns.length, 0);

  return (
    <div className="card elev-sm" style={{ maxWidth: 720, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color, fontSize: 13 }}>{verify.ok ? '✓' : '◆'}</span>
        <div style={{ fontSize: 13, color: 'var(--color-neutral-200)' }}>
          {verify.ok ? title : `${title} — ${verify.problems.length} mismatch(es)`}
        </div>
      </div>

      {verify.ok ? (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 2 }}>
          <Count value={verify.counts.trigs} label="trigs" />
          <Count value={verify.counts.patterns} label="patterns" />
          <Count value={verify.counts.slices} label="slices" />
          <Count value={verify.counts.slots} label="slot grids" />
          <Count value="all" label="checksums match" />
        </div>
      ) : (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {verify.problems.map((problem, i) => (
            <li key={i} style={{ fontSize: 11.5, color: BAD_COLOR }}>{problem}</li>
          ))}
        </ul>
      )}

      <details open={defaultOpen} style={{ marginTop: 8 }}>
        <summary style={{ fontSize: 12, color: 'var(--color-accent-300)', cursor: 'pointer' }}>
          Decoded patterns ({patterns})
        </summary>
        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', margin: '6px 0 8px' }}>
          Not a re-print of the pattern table: every trig below was decoded back out of {source}.
          Red means the bytes and the intended pattern disagree.
        </div>
        <PatternTable banks={banks} />
      </details>
    </div>
  );
}
