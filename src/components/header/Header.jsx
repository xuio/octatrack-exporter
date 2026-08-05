import NamingPanel from './NamingPanel.jsx';
import ThemePicker from './ThemePicker.jsx';
import SessionMenu from './SessionMenu.jsx';

export const STEPS = [
  { id: 'files', label: '1 Files' },
  { id: 'tempo', label: '2 Tempo' },
  { id: 'regions', label: '3 Regions' },
  { id: 'results', label: '4 Results' },
  { id: 'export', label: '5 Export' },
  { id: 'project', label: '6 Project' },
];

export default function Header({ step, enabled, summary, theme, naming, hasWork, onStep, onTheme, onClearAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-divider)', flex: 'none' }}>
      <span style={{ fontWeight: 500, letterSpacing: '.1em', fontSize: 14 }}>OSSC</span>
      <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>Octatrack Stem Slice Creator</span>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{summary}</span>

      <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', alignItems: 'center' }}>
        {STEPS.map(({ id, label }) => (
          <button
            key={id}
            className={`stp ${step === id ? 'on' : ''}`}
            disabled={!enabled(id)}
            onClick={() => onStep(id)}
          >
            {label}
          </button>
        ))}
        <NamingPanel {...naming} />
        <ThemePicker theme={theme} onSelect={onTheme} />
        <SessionMenu hasWork={hasWork} onClearAll={onClearAll} />
      </div>
    </div>
  );
}
