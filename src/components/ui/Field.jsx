/** Labelled text input with an optional monospace hint underneath. */
export default function Field({ label, value, onChange, placeholder, hint, style, inputStyle }) {
  return (
    <div className="field" style={style}>
      <label>{label}</label>
      <input className="input" value={value} onChange={onChange} placeholder={placeholder} style={inputStyle} />
      {hint && <div className="mono" style={{ fontSize: 10, color: 'var(--color-neutral-500)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
