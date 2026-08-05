function ThemePicker({ themes }) {
  return (
    <div className="theme-picker" style={{ position: 'relative', flex: 'none' }}>
      <button className="stp" title="Colour scheme">◐</button>
      <div className="theme-menu">
        {themes.map(t => (
          <button key={t.id} className={'theme-opt' + (t.on ? ' on' : '')} onClick={t.onClick}>
            <span className="theme-dot" data-theme={t.id} />
            <span style={{ flex: 1, textAlign: 'left' }}>{t.label}</span>
            <span style={{ fontSize: 10, color: 'var(--color-neutral-600)' }}>{t.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Header({ vals }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-divider)', flex: 'none' }}>
      <span style={{ fontWeight: 500, letterSpacing: '.1em', fontSize: 14 }}>OSSC</span>
      <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>Octatrack Stem Slice Creator</span>
      <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{vals.metaLabel}</span>
      <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', alignItems: 'center' }}>
        {vals.stepsVm.map(st => (
          <button key={st.label} className={'stp ' + st.cls} onClick={st.onClick} disabled={st.disabled}>{st.label}</button>
        ))}
        <ThemePicker themes={vals.themes} />
      </div>
    </div>
  );
}
