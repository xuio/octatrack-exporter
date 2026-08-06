import { useCallback, useEffect } from 'react';

/**
 * Every keyboard shortcut in the arrangement editor.
 *
 * Selection moves between clips rather than between DOM nodes: arrows walk the
 * grid of stems × sections the timeline already draws, so the keyboard reaches
 * exactly what the mouse can and nothing that only exists as markup. Modified
 * arrows trim the selected clip, which makes bar-accurate edits possible
 * without a steady hand.
 */

/** What each shortcut does, in the order the help panel lists them. */
export const SHORTCUTS = [
  { keys: ['Space'], text: 'Play / pause — resumes where it stopped' },
  { keys: ['Home'], text: 'Stop and go back to bar 1' },
  { keys: ['F'], text: 'Follow the playhead' },
  { keys: ['←', '→'], text: 'Select the previous / next clip' },
  { keys: ['↑', '↓'], text: 'Select the clip in the track above / below' },
  { keys: ['⇧←', '⇧→'], text: 'Move the clip’s start one bar' },
  { keys: ['⌥←', '⌥→'], text: 'Move the clip’s end one bar' },
  { keys: ['Enter'], text: 'Audition the selected clip' },
  { keys: ['⌫'], text: 'Delete the selected clip' },
  { keys: ['R'], text: 'Restore it to the full section' },
  { keys: ['L'], text: 'Loop the selected clip’s section' },
  { keys: ['⇧drag'], text: 'Loop a bar range — drag in the ruler' },
  { keys: ['M'], text: 'Mute the selected clip’s track' },
  { keys: ['S', '⇧S'], text: 'Solo it — shift adds to the solo group' },
  { keys: ['+', '−', '0'], text: 'Zoom in / out / fit' },
  { keys: ['⌘Z', '⇧⌘Z'], text: 'Undo / redo' },
  { keys: ['Esc'], text: 'Deselect' },
  { keys: ['?'], text: 'Show this list' },
];

/** The clip nearest a section in a given lane — how ↑/↓ keep their place. */
function nearestSlice(track, regionIdx) {
  if (!track || !track.slices.length) return null;
  return track.slices.reduce((best, slice) => (
    Math.abs(slice.region.idx - regionIdx) < Math.abs(best.region.idx - regionIdx) ? slice : best
  ), track.slices[0]);
}

export function useTimelineKeys({
  enabled, stems, tracks, selection, setSelected, history, transport,
  onNudge, onDelete, onRestore, onAudition, onLoop, onMute, onSolo, onToStart,
  onZoomIn, onZoomOut, onZoomFit, onToggleFollow, onToggleHelp, onReveal,
}) {
  /** Move the selection by `dStem` lanes and `dClip` clips. */
  const move = useCallback((dStem, dClip) => {
    if (!stems.length) return;
    const stemIndex = selection ? stems.findIndex(s => s.id === selection.stem.id) : 0;
    const nextStem = stems[Math.max(0, Math.min(stems.length - 1, (stemIndex < 0 ? 0 : stemIndex) + dStem))];
    const track = tracks.get(nextStem.id);
    if (!track || !track.slices.length) return;

    let slice;
    if (!selection) slice = track.slices[0];
    else if (dStem) slice = nearestSlice(track, selection.region.idx);
    else {
      const at = track.slices.findIndex(s => s.region.idx === selection.region.idx);
      slice = track.slices[Math.max(0, Math.min(track.slices.length - 1, at + dClip))];
    }
    if (!slice) return;
    setSelected({ stemId: nextStem.id, regionIdx: slice.region.idx });
    onReveal?.(slice);
  }, [stems, tracks, selection, setSelected, onReveal]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      // Never steal keys from a field the user is typing in — inline renaming
      // lives right inside the timeline.
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const take = () => e.preventDefault();

      if (mod && key.toLowerCase() === 'z') { take(); e.shiftKey ? history.redo() : history.undo(); return; }
      if (mod && key.toLowerCase() === 'y') { take(); history.redo(); return; }
      if (mod) return;                       // leave every other ⌘/Ctrl chord to the browser

      switch (key) {
        case ' ': take(); transport.toggle(); return;
        case 'Home': take(); onToStart(); return;
        case 'Escape': take(); setSelected(null); return;
        case 'Enter': if (selection) { take(); onAudition(); } return;
        case 'Delete':
        case 'Backspace': if (selection) { take(); onDelete(); } return;
        case '?': take(); onToggleHelp(); return;
        case '+': case '=': take(); onZoomIn(); return;
        case '-': case '_': take(); onZoomOut(); return;
        case '0': take(); onZoomFit(); return;
        case 'ArrowLeft':
          take();
          if (e.shiftKey) onNudge('l', -1);
          else if (e.altKey) onNudge('r', -1);
          else move(0, -1);
          return;
        case 'ArrowRight':
          take();
          if (e.shiftKey) onNudge('l', 1);
          else if (e.altKey) onNudge('r', 1);
          else move(0, 1);
          return;
        case 'ArrowUp': take(); move(-1, 0); return;
        case 'ArrowDown': take(); move(1, 0); return;
        default: break;
      }

      switch (key.toLowerCase()) {
        case 'f': take(); onToggleFollow(); break;
        case 'l': if (selection) { take(); onLoop(); } break;
        case 'm': if (selection) { take(); onMute(); } break;
        case 's': if (selection) { take(); onSolo(e.shiftKey); } break;
        case 'r': if (selection) { take(); onRestore(); } break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    enabled, selection, history, transport, move, setSelected,
    onNudge, onDelete, onRestore, onAudition, onLoop, onMute, onSolo, onToStart,
    onZoomIn, onZoomOut, onZoomFit, onToggleFollow, onToggleHelp, onReveal,
  ]);
}
