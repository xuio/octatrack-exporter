import { useCallback, useEffect, useRef, useState } from 'react';
import { captureDrop, filesFromDataTransfer } from '../lib/index.js';

/**
 * Window-wide drag and drop, so dropping next to the dashed box (or anywhere
 * else on the step) works and a stray drop never navigates the browser away.
 */
export function useFileDrop(target, onDrop) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onDrop);
  handler.current = onDrop;

  const enabled = Boolean(target);

  const handleDrop = useCallback(async (capture) => {
    const items = await filesFromDataTransfer(capture);
    if (items.length) handler.current(items);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onDragOver = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const onDragEnter = e => { e.preventDefault(); if (++depth.current === 1) setDragging(true); };
    const onDragLeave = () => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } };
    const onDropEvent = (e) => {
      e.preventDefault();
      const capture = captureDrop(e.dataTransfer);   // must read before any await
      depth.current = 0;
      setDragging(false);
      handleDrop(capture);
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDropEvent);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDropEvent);
    };
  }, [enabled, handleDrop]);

  return dragging && enabled;
}
