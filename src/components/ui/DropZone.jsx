/**
 * The dashed intake box. Dropping is handled window-wide (see useFileDrop), so
 * this only reflects the drag state and offers a click target.
 */
export default function DropZone({ active, onClick, style, children }) {
  return (
    <div
      className={`drop${active ? ' dropping' : ''}`}
      onClick={onClick}
      onDragOver={e => e.preventDefault()}
      onDrop={e => e.preventDefault()}
      style={style}
    >
      {children}
    </div>
  );
}
