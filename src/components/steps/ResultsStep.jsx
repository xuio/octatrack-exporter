import { useCallback, useEffect, useMemo, useState } from 'react';
import Transport from '../timeline/Transport.jsx';
import Timeline from '../timeline/Timeline.jsx';
import PatternTable from '../timeline/PatternTable.jsx';
import SelectionBar from '../timeline/SelectionBar.jsx';
import { useTimelineView } from '../../state/useTimelineView.js';
import { usePlayhead, useViewportIndicator, useTimelineRefs } from '../../state/usePlayhead.js';
import { useTimelineGestures } from '../../state/useTimelineGestures.js';
import { useThemeColors } from '../../state/useThemeColors.js';
import { isAudible } from '../../state/useStems.js';
import { bucketsPerBarFor, trimLimits } from '../../lib/index.js';

/** The arrangement editor: transport, timeline (or pattern table) and selection. */
export default function ResultsStep({
  base, stems, mixer, tracks, warnings, edits, transport, prefs, setPrefs, waveforms,
  onRenameStem, onRenameRegion, onMute, onSolo, onExport, onExportCsv, onPrint, onResize,
}) {
  const [view, setView] = useState('timeline');
  const [showWarnings, setShowWarnings] = useState(false);
  const [selected, setSelected] = useState(null);        // { stemId, regionIdx }
  const [thresholdDraft, setThresholdDraft] = useState(null);

  const colors = useThemeColors(prefs.theme);
  const setFollow = useCallback(v => setPrefs({ follow: v }), [setPrefs]);
  const timeline = useTimelineView({ follow: prefs.follow, setFollow, playing: transport.playing });
  const refs = useTimelineRefs(timeline.attachScroller, timeline.scrollerRef);

  const paintBars = usePlayhead({
    transport, refs, ppm: timeline.ppm, totalBars: base.total,
    follow: prefs.follow, keepPlayheadVisible: timeline.keepPlayheadVisible, active: true,
  });
  useViewportIndicator({ refs, scrollerRef: timeline.scrollerRef, ppm: timeline.ppm, totalBars: base.total, viewport: timeline.viewport });
  const gestures = useTimelineGestures({ base, ppm: timeline.ppm, tracks, edits, transport, paintBars, refs });

  const buckets = bucketsPerBarFor(timeline.ppm);
  const pathsFor = useCallback(
    (stem, slice) => waveforms.pathsFor(stem, slice.aM, slice.bM, buckets, prefs.waveStyle),
    [waveforms, buckets, prefs.waveStyle],
  );

  const selection = useMemo(() => {
    if (!selected) return null;
    const stem = stems.find(s => s.id === selected.stemId);
    const slice = tracks.get(selected.stemId)?.slices.find(s => s.region.idx === selected.regionIdx);
    return stem && slice ? { stem, slice, region: slice.region } : null;
  }, [selected, stems, tracks]);

  const deleteSelected = useCallback(() => {
    if (selection) edits.setRegionEdit(selection.stem.id, selection.region.idx, { del: true, a: null, b: null });
  }, [selection, edits]);

  const applyThreshold = useCallback((value) => {
    if (!Number.isFinite(value)) return;
    setPrefs({ threshold: Math.max(-120, Math.min(0, Math.round(value))) });
  }, [setPrefs]);

  const nudge = useCallback((side, delta) => {
    if (!selection) return;
    const { stem, slice, region } = selection;
    const track = tracks.get(stem.id);
    const limits = trimLimits(track.slices, region.idx, base.regs);
    const a = side === 'l' ? Math.max(limits.minA, Math.min(slice.bM, slice.aM + delta)) : slice.aM;
    const b = side === 'l' ? slice.bM : Math.min(limits.maxB, Math.max(slice.aM, slice.bM + delta));
    edits.trim(stem.id, region.idx, a, b, {
      regions: base.regs,
      base: track.slices.map(s => ({ regionIdx: s.region.idx, aM: s.aM, bM: s.bM })),
    });
  }, [selection, tracks, base, edits]);

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? edits.redo() : edits.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); edits.redo(); }
      else if (e.code === 'Space') { e.preventDefault(); transport.toggle(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); deleteSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [edits, transport, selected, deleteSelected]);

  const loopRegion = base.regs.find(r => r.idx === transport.loopRegionIdx);
  const mixed = stems.map(s => ({ ...s, ...(mixer[s.id] || {}) }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Transport
        playing={transport.playing}
        positionRef={refs.position}
        positionLabel={`${String(transport.startBar).padStart(3, '0')}.1`}
        follow={prefs.follow}
        edits={edits}
        warnings={warnings}
        view={view}
        waveStyle={prefs.waveStyle}
        scopeMode={prefs.scopeMode}
        volume={prefs.volume ?? transport.volume ?? 0.85}
        threshold={prefs.threshold}
        thresholdDraft={thresholdDraft}
        masterAnalyser={transport.engine.masterAnalyser}
        colors={colors}
        active
        loopLabel={loopRegion && `${String(loopRegion.idx).padStart(2, '0')}${loopRegion.name ? ` ${loopRegion.name.toUpperCase()}` : ''} (${loopRegion.bp})`}
        onPlay={() => transport.play()}
        onStop={transport.stop}
        onToStart={() => { transport.stop(); transport.setStartBar(1); if (timeline.scrollerRef.current) timeline.scrollerRef.current.scrollLeft = 0; }}
        onToggleFollow={() => setFollow(!prefs.follow)}
        onUndo={edits.undo}
        onRedo={edits.redo}
        onClearLoop={transport.releaseLoop}
        onVolume={e => setPrefs({ volume: parseFloat(e.target.value) })}
        onThresholdSlide={e => { setThresholdDraft(null); applyThreshold(parseFloat(e.target.value)); }}
        onThresholdDraft={e => { setThresholdDraft(e.target.value); applyThreshold(parseFloat(e.target.value)); }}
        onThresholdCommit={e => { setThresholdDraft(null); applyThreshold(parseFloat(e.target.value)); }}
        onThresholdStep={delta => { setThresholdDraft(null); applyThreshold(prefs.threshold + delta); }}
        onZoomIn={() => timeline.zoomAt(null, 1.4)}
        onZoomOut={() => timeline.zoomAt(null, 1 / 1.4)}
        onZoomFit={() => timeline.zoomToFit(base.total)}
        onWaveStyle={waveStyle => setPrefs({ waveStyle })}
        onScopeMode={scopeMode => setPrefs({ scopeMode })}
        onView={setView}
        onResetEdits={edits.reset}
        onToggleWarnings={() => setShowWarnings(v => !v)}
        onExport={onExport}
      />

      {showWarnings && warnings.length > 0 && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 3, background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)' }}>
          {warnings.map((text, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
              <span style={{ color: 'var(--color-accent-300)' }}>◆</span> {text}
            </div>
          ))}
        </div>
      )}

      {view === 'timeline' ? (
        <>
          <Timeline
            base={base}
            stems={stems}
            mixer={mixer}
            tracks={tracks}
            ppm={timeline.ppm}
            viewport={timeline.viewport}
            view={{
              loopRegionIdx: transport.loopRegionIdx,
              startBar: transport.startBar,
              audible: id => isAudible(mixed.find(s => s.id === id), mixed),
            }}
            selection={selection}
            waveStyle={prefs.waveStyle}
            scopeMode={prefs.scopeMode}
            railWidth={prefs.railW}
            laneHeight={prefs.laneH}
            colors={colors}
            analyserFor={id => transport.engine.analyserFor(id)}
            active
            buckets={buckets}
            pathsFor={pathsFor}
            refs={refs}
            onScrubTimeline={gestures.scrubTimeline}
            onScrubOverview={gestures.scrubOverview}
            onSelect={(stemId, regionIdx) => setSelected({ stemId, regionIdx })}
            onDeselect={() => setSelected(null)}
            onAudition={(stemId, slice) => transport.audition(stemId, slice)}
            onTrimStart={gestures.startTrim}
            onRestore={(stemId, region) => {
              edits.setRegionEdit(stemId, region.idx, { del: null, a: region.start, b: region.end - 1 });
              setSelected({ stemId, regionIdx: region.idx });
            }}
            onRenameStem={onRenameStem}
            onRenameRegion={onRenameRegion}
            onMute={onMute}
            onSolo={onSolo}
            onLoopRegion={transport.loopRegion}
            onResizeRail={e => onResize('railW', e)}
            onResizeLane={e => onResize('laneH', e)}
            onScroll={timeline.onScroll}
            onWheel={timeline.onWheel}
          />
          <SelectionBar
            selection={selection}
            onNudge={nudge}
            onAudition={() => selection && transport.audition(selection.stem.id, selection.slice)}
            onResetTrim={() => selection && edits.setRegionEdit(selection.stem.id, selection.region.idx, { del: null, a: null, b: null })}
            onDelete={deleteSelected}
          />
        </>
      ) : (
        <PatternTable regions={base.regs} stems={stems} tracks={tracks} onExportCsv={onExportCsv} onPrint={onPrint} />
      )}
    </div>
  );
}
