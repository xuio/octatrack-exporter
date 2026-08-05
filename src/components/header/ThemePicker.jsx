export const THEMES = [
  { id: 'nocturne', label: 'Nocturne', note: 'blurple on graphite' },
  { id: 'cobalt', label: 'Cobalt', note: 'deep blue console' },
  { id: 'ember', label: 'Ember', note: 'warm amber' },
  { id: 'moss', label: 'Moss', note: 'tape-machine green' },
  { id: 'orchid', label: 'Orchid', note: 'magenta on charcoal' },
  { id: 'graphite', label: 'Graphite', note: 'near-neutral' },
  { id: 'paper', label: 'Paper', note: 'light' },
];

export default function ThemePicker({ theme, onSelect }) {
  return (
    <div className="theme-picker" style={{ position: 'relative', flex: 'none' }}>
      <button className="stp" title="Colour scheme">◐</button>
      <div className="theme-menu">
        {THEMES.map(option => (
          <button
            key={option.id}
            className={`theme-opt${theme === option.id ? ' on' : ''}`}
            onClick={() => onSelect(option.id)}
          >
            <span className="theme-dot" data-theme={option.id} />
            <span style={{ flex: 1, textAlign: 'left' }}>{option.label}</span>
            <span style={{ fontSize: 10, color: 'var(--color-neutral-600)' }}>{option.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
