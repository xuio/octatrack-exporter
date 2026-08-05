/** Draggable playhead. Its transform is written directly each frame, not via state. */
export default function Playhead({ innerRef, initialPx, onScrub }) {
  return (
    <div
      ref={innerRef}
      onPointerDown={onScrub}
      style={{
        position: 'absolute', top: 0, bottom: 0, left: -5, width: 11,
        cursor: 'ew-resize', zIndex: 4, transform: `translateX(${initialPx}px)`,
      }}
    >
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 1, background: 'var(--color-accent)', boxShadow: '0 0 6px var(--color-accent)' }} />
      <div style={{ position: 'absolute', top: 0, left: 1, width: 9, height: 7, background: 'var(--color-accent)', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
    </div>
  );
}
