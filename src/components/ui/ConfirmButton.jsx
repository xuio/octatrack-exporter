import { useEffect, useRef, useState } from 'react';

/**
 * A destructive action that asks first: the button swaps into an explicit
 * confirm/cancel pair rather than firing on a single click. Reverts on its own
 * if left alone, so an accidental click never sits there armed.
 */
export default function ConfirmButton({ label, confirmLabel, title, className = 'stp', onConfirm, timeout = 5000 }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!armed) return undefined;
    timer.current = setTimeout(() => setArmed(false), timeout);
    return () => clearTimeout(timer.current);
  }, [armed, timeout]);

  if (!armed) {
    return <button className={className} title={title} onClick={() => setArmed(true)}>{label}</button>;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        className={className}
        style={{ color: '#e0483c' }}
        onClick={() => { setArmed(false); onConfirm(); }}
      >
        {confirmLabel}
      </button>
      <button className={className} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}
