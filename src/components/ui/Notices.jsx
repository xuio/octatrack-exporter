/** The recurring "◆ message" list used for warnings and plan notes. */
export default function Notices({ items, style }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, ...style }}>
      {items.map((text, i) => <div key={i} className="notice">◆ {text}</div>)}
    </div>
  );
}
