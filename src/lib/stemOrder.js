// Stem sets are usually exported with the track number in front of the name —
// "1 DRUMS.wav", "2 BASS.wav" — because that is the order they sit in on the
// device. Drops, file pickers and zips all hand the files over in whatever order
// they please, so the number is the only thing that survives the trip.

const PREFIX = /^\s*(\d{1,3})[\s._-]/;

/** The leading track number, or null when the name does not carry one. */
export const trackNumber = (name) => {
  const m = PREFIX.exec(name);
  return m ? Number(m[1]) : null;
};

/** Drop the leading track number, unless that would leave nothing behind. */
export const stripTrackNumber = (name) => {
  const rest = name.replace(PREFIX, '').trim();
  return rest || name;
};

/**
 * One intake batch in track order: numbered files first, ascending, then the
 * rest. Stable both ways — files that share a number (or have none) keep the
 * order they arrived in, so an unnumbered set is left exactly as the user
 * dropped it.
 *
 * @template T
 * @param {T[]} files
 * @param {(file: T) => string} nameOf
 * @returns {T[]}
 */
export function sortByTrackNumber(files, nameOf = (f) => String(f)) {
  return files
    .map((file, i) => ({ file, i, n: trackNumber(nameOf(file)) }))
    .sort((a, b) =>
      (a.n === null ? 1 : 0) - (b.n === null ? 1 : 0)
      || (a.n ?? 0) - (b.n ?? 0)
      || a.i - b.i)
    .map(e => e.file);
}
