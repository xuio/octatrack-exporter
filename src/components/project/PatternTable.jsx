// Decoded pattern table: one row per programmed track, chips for the trigs that
// were actually read back out of the bank bytes.

// The palette has no semantic pass/fail pair (the accent ramp is the whole theme
// system), so these two are stated once here and used by both panels.
export const OK_COLOR = 'oklch(0.74 0.14 152)';
export const BAD_COLOR = 'oklch(0.70 0.19 25)';

const CHIP_STYLE = {
  plain: { color: 'var(--color-neutral-300)', border: 'var(--color-divider)' },
  ok: { color: 'var(--color-neutral-300)', border: 'var(--color-divider)' },
  wrong: { color: BAD_COLOR, border: BAD_COLOR },
  extra: { color: BAD_COLOR, border: BAD_COLOR },
  missing: { color: BAD_COLOR, border: BAD_COLOR },
};

const sliceLabel = n => (n === null ? '?' : n + 1);

// Slices are 0-based in the file and 1-based everywhere the user sees them.
const chipText = (chip) => {
  switch (chip.state) {
    case 'wrong': return `${chip.step} → ${sliceLabel(chip.slice)} (want ${sliceLabel(chip.want)})`;
    case 'extra': return `${chip.step} → ${sliceLabel(chip.slice)} (not intended)`;
    case 'missing': return `${chip.step} → ${sliceLabel(chip.want)} (missing)`;
    default: return `${chip.step} → ${sliceLabel(chip.slice)}`;
  }
};

const Chip = ({ chip }) => {
  const style = CHIP_STYLE[chip.state] || CHIP_STYLE.plain;
  return (
    <span className="mono" title={chip.slice === null ? 'STRT p-lock is not on a slice boundary' : undefined}
      style={{
        fontSize: 10.5, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
        color: style.color, border: `1px solid ${style.border}`,
      }}>
      {chipText(chip)}
    </span>
  );
};

const Bank = ({ bank }) => {
  if (bank.error) {
    return <div className="notice">◆ {bank.name}: {bank.error} — not decoded</div>;
  }
  if (!bank.patterns.length) {
    return <div className="hint">no trigs found in {bank.name}</div>;
  }
  return (
    <table className="table" style={{ fontSize: 11.5 }}>
      <thead>
        <tr>
          <th style={{ width: 70 }}>Pattern</th>
          <th style={{ width: 56 }}>Track</th>
          <th style={{ width: 90 }}>Scale</th>
          <th>step → slice</th>
        </tr>
      </thead>
      <tbody>
        {bank.patterns.flatMap(pattern => (
          pattern.tracks.length
            ? pattern.tracks.map((track, i) => (
              <tr key={`${pattern.patternIdx}-${track.trackIdx}`}>
                <td className="mono" style={{ color: 'var(--color-neutral-400)' }}>
                  {i === 0 ? `P${pattern.patternIdx + 1}` : ''}
                </td>
                <td className="mono" style={{ color: 'var(--color-neutral-400)' }}>T{track.trackIdx + 1}</td>
                <td className="mono" style={{ color: track.scaleOk ? 'var(--color-neutral-400)' : BAD_COLOR }}>
                  {track.LEN}/{track.mult || '?'}
                  {!track.scaleOk && ` (want ${track.wantLEN}/${track.wantMult})`}
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {track.chips.map(chip => <Chip key={chip.step} chip={chip} />)}
                  </div>
                </td>
              </tr>
            ))
            : [(
              <tr key={`${pattern.patternIdx}-empty`}>
                <td className="mono" style={{ color: 'var(--color-neutral-400)' }}>P{pattern.patternIdx + 1}</td>
                <td colSpan={3} className="hint">no trigs written</td>
              </tr>
            )]
        ))}
      </tbody>
    </table>
  );
};

/** @param {{ banks: any[] }} props — banks as returned by decodeExport / inspectProject */
export default function PatternTable({ banks }) {
  if (!banks.length) return <div className="hint">No bank files to decode.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {banks.map(bank => (
        <div key={bank.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="k-label">{bank.name}</div>
          <Bank bank={bank} />
        </div>
      ))}
    </div>
  );
}
