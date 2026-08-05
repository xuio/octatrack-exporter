import ConfirmButton from '../ui/ConfirmButton.jsx';

/** Tucked-away destructive actions. Nothing here fires on a single click. */
export default function SessionMenu({ hasWork, onClearAll }) {
  return (
    <div className="theme-picker" style={{ position: 'relative', flex: 'none' }}>
      <button className="stp" title="Session">⋯</button>
      <div className="theme-menu" style={{ minWidth: 250, padding: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', padding: '2px 4px 6px' }}>
          Clears the stems, sections, slice edits and the loaded project from this
          browser. Files already downloaded are unaffected.
        </div>
        <ConfirmButton
          label="Start over…"
          confirmLabel={hasWork ? 'Yes, discard everything' : 'Yes, clear'}
          title="Discard everything and start from scratch"
          className="theme-opt"
          onConfirm={onClearAll}
        />
      </div>
    </div>
  );
}
