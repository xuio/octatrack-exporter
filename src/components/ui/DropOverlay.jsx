/** Full-pane hint shown while a drag is over the window. */
export default function DropOverlay({ visible, target }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', pointerEvents: 'none',
        background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)',
        border: '2px dashed var(--color-accent)',
      }}
    >
      <div style={{ fontSize: 17, color: 'var(--color-accent-200)', textAlign: 'center', lineHeight: 1.7 }}>
        {target === 'project' ? 'Drop the Octatrack project folder or .zip' : 'Drop stems, a folder, or a .zip'}
        <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>anywhere on this pane</div>
      </div>
    </div>
  );
}
