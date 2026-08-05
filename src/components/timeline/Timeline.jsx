import { useEffect } from 'react';
import TrackRail from './TrackRail.jsx';
import RegionHeader from './RegionHeader.jsx';
import Ruler from './Ruler.jsx';
import Lane from './Lane.jsx';
import Playhead from './Playhead.jsx';
import Overview from './Overview.jsx';

const gridImage = ppm =>
  `repeating-linear-gradient(to right, color-mix(in srgb, var(--color-neutral-800) 55%, transparent) 0 1px, transparent 1px ${ppm}px)`;

/** The arrangement view: overview strip, section headers, ruler and one lane per stem. */
export default function Timeline({
  base, stems, mixer, tracks, ppm, viewport, view, selection, waveStyle, scopeMode,
  railWidth, laneHeight, colors, analyserFor, active, buckets, pathsFor, refs,
  onScrubTimeline, onScrubOverview, onSelect, onDeselect, onAudition, onTrimStart, onRestore,
  onRenameStem, onRenameRegion, onMute, onSolo, onLoopRegion, onResizeRail, onResizeLane, onScroll, onWheel,
}) {
  const width = Math.ceil(base.total * ppm) + 2;
  const grid = gridImage(ppm);
  const visibleRange = [
    viewport.scrollX / ppm - 2,
    (viewport.scrollX + (viewport.width || 1200)) / ppm + 2,
  ];

  // The wheel listener must be non-passive to be able to block browser zoom.
  useEffect(() => {
    const el = refs.scroller.current;
    if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [refs.scroller, onWheel]);

  return (
    <>
      <Overview
        regions={base.regs}
        totalBars={base.total}
        loopRegionIdx={view.loopRegionIdx}
        containerRef={refs.overview}
        playheadRef={refs.overviewPlayhead}
        viewportRef={refs.overviewViewport}
        onScrub={onScrubOverview}
      />

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${railWidth}px 1fr`, minHeight: 0 }}>
        <TrackRail
          stems={stems}
          mixer={mixer}
          laneHeight={laneHeight}
          scopeMode={scopeMode}
          scopeWidth={Math.max(40, Math.min(200, railWidth - 148))}
          colors={colors}
          analyserFor={analyserFor}
          active={active}
          onRename={onRenameStem}
          onMute={onMute}
          onSolo={onSolo}
          onResizeWidth={onResizeRail}
          onResizeHeight={onResizeLane}
        />

        <div ref={refs.attachScroller} onScroll={onScroll} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ position: 'relative', width }}>
            <RegionHeader
              regions={base.regs}
              ppm={ppm}
              loopRegionIdx={view.loopRegionIdx}
              selectedRegionIdx={selection?.region.idx}
              onRename={onRenameRegion}
              onLoop={onLoopRegion}
            />
            <Ruler totalBars={base.total} ppm={ppm} gridImage={grid} onScrub={onScrubTimeline} />

            {stems.map(stem => (
              <Lane
                key={stem.id}
                stem={stem}
                track={tracks.get(stem.id) || { slices: [], ghosts: [] }}
                height={laneHeight}
                ppm={ppm}
                gridImage={grid}
                dimmed={!view.audible(stem.id)}
                selectedRegionIdx={selection?.stem.id === stem.id ? selection.region.idx : null}
                waveStyle={waveStyle}
                buckets={buckets}
                pathsFor={pathsFor}
                visibleRange={visibleRange}
                onSelect={regionIdx => onSelect(stem.id, regionIdx)}
                onDeselect={onDeselect}
                onAudition={slice => onAudition(stem.id, slice)}
                onTrimStart={(slice, side, e) => onTrimStart(stem.id, slice, side, e)}
                onRestore={region => onRestore(stem.id, region)}
              />
            ))}

            {base.regs.map(region => (
              <div
                key={region.idx}
                style={{
                  position: 'absolute', top: 40, bottom: 0, left: region.start * ppm, width: 1,
                  background: 'color-mix(in srgb, var(--color-neutral-600) 45%, transparent)', pointerEvents: 'none',
                }}
              />
            ))}

            <Playhead innerRef={refs.playhead} initialPx={(view.startBar - 1) * ppm} onScrub={onScrubTimeline} />
          </div>
        </div>
      </div>
    </>
  );
}
