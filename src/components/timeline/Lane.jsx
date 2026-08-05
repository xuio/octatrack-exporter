import SliceBlock from './SliceBlock.jsx';

/** One stem's row of clips, plus the dashed placeholders that add a clip back. */
export default function Lane({
  stem, track, height, ppm, gridImage, dimmed, selectedRegionIdx, waveStyle,
  buckets, pathsFor, visibleRange, onSelect, onDeselect, onAudition, onTrimStart, onRestore,
}) {
  return (
    <div
      onClick={onDeselect}
      style={{
        height,
        position: 'relative',
        borderBottom: '1px solid color-mix(in srgb, var(--color-neutral-800) 45%, transparent)',
        backgroundImage: gridImage,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      {track.ghosts.map(ghost => (
        <div
          key={`g${ghost.region.idx}`}
          className="slice-ghost"
          title={`${ghost.deleted ? 'Deleted' : 'Below threshold'} — click to add a slice for ${ghost.region.name || `region ${ghost.region.idx}`}`}
          onClick={e => { e.stopPropagation(); onRestore(ghost.region); }}
          style={{ left: ghost.region.start * ppm, width: Math.max(4, ghost.region.len * ppm - 2) }}
        />
      ))}

      {track.slices.map(slice => {
        const bars = slice.bM - slice.aM + 1;
        const visible = slice.bM + 1 >= visibleRange[0] && slice.aM <= visibleRange[1];
        return (
          <SliceBlock
            key={slice.region.idx}
            slice={{ ...slice, label: `${stem.name} slice ${slice.num}` }}
            left={slice.aM * ppm}
            width={Math.max(3, bars * ppm - 2)}
            buckets={bars * buckets}
            paths={visible ? pathsFor(stem, slice) : null}
            style={waveStyle}
            selected={selectedRegionIdx === slice.region.idx}
            onSelect={() => onSelect(slice.region.idx)}
            onAudition={() => onAudition(slice)}
            onTrimStart={(side, e) => onTrimStart(slice, side, e)}
          />
        );
      })}
    </div>
  );
}
