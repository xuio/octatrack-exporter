import { useEffect, useRef, useState } from 'react';

const stop = e => e.stopPropagation();

/** Text that turns into an input on double-click. Enter commits, Escape cancels. */
export default function EditableLabel({ value, placeholder, onCommit, className, style, title }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  if (!editing) {
    return (
      <span
        className={className}
        style={{ ...style, cursor: 'text' }}
        title={title || 'Double-click to rename'}
        onDoubleClick={e => { stop(e); setEditing(true); }}
      >
        {value || <span style={{ opacity: 0.5 }}>{placeholder}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      className="input"
      value={draft}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={e => {
        stop(e);
        // blur through the ref: currentTarget is unreliable once the event has
        // been stopped, and Enter must always commit
        if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); setDraft(value); setEditing(false); }
      }}
      style={{ ...style, minHeight: 0, height: '1.5em', padding: '0 4px', font: 'inherit', width: '100%', minWidth: 40 }}
    />
  );
}
