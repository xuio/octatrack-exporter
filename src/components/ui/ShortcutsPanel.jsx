import { SHORTCUTS } from '../../state/useTimelineKeys.js';

const Key = ({ children }) => (
  <kbd
    className="mono"
    style={{
      display: 'inline-block', minWidth: 18, padding: '1px 5px', fontSize: 10.5, lineHeight: 1.5,
      textAlign: 'center', color: 'var(--color-accent-200)',
      border: '1px solid var(--color-neutral-700)', borderRadius: 3,
      background: 'color-mix(in srgb, var(--color-neutral-800) 45%, transparent)',
    }}
  >
    {children}
  </kbd>
);

/** The keyboard reference, opened with `?` or the transport's Keys button. */
export default function ShortcutsPanel({ onClose }) {
  return (
    <div
      style={{
        padding: '10px 16px 12px', borderBottom: '1px solid var(--color-divider)',
        background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--color-neutral-400)' }}>KEYBOARD</span>
        <button className="tb" style={{ marginLeft: 'auto', height: 20, fontSize: 10 }} onClick={onClose}>close</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 20px' }}>
        {SHORTCUTS.map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
            <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
              {item.keys.map(k => <Key key={k}>{k}</Key>)}
            </span>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
