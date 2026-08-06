/**
 * Shared shapes for the core. There is no runtime code here — importing the
 * typedefs is what lets `checkJs` catch the confusions this domain invites:
 * bar indices, sample offsets and byte offsets are all just numbers.
 *
 * @module
 */

/**
 * A decoded stem: 44.1 kHz stereo, plus the PCM exactly as it will be written.
 * @typedef {object} Stem
 * @property {number} id            per-load counter, not stable across sessions
 * @property {string} name          shown in the UI and used in file names
 * @property {string} fileName      the file it came from
 * @property {number} frames        length in sample frames
 * @property {number} bits          16 or 24
 * @property {number} bytesPerFrame stereo frame size in the exported WAV
 * @property {Float32Array} chL
 * @property {Float32Array} chR
 * @property {Uint8Array} pcm       interleaved PCM, byte-identical when possible
 * @property {string[]} warnings    anything that had to be converted
 */

/**
 * One arrangement section, and the pattern it becomes.
 * @typedef {object} Region
 * @property {number} idx    1-based; also decides the bank and pattern number
 * @property {number} start  first bar, 0-based
 * @property {number} end    one past the last bar
 * @property {number} len    length in bars
 * @property {string} name
 * @property {string} bp     e.g. "B2 P3"
 * @property {Scale}  scale
 */

/**
 * The pattern scale a section length forces.
 * @typedef {object} Scale
 * @property {boolean} ok     false when the section is longer than 32 bars
 * @property {string}  mult   TEMPO MULTIPLIER, e.g. "1/4x"
 * @property {number}  steps  trig keys per bar
 * @property {number}  LEN    pattern length in steps
 * @property {number}  MAX
 * @property {string}  label
 * @property {string}  master
 */

/**
 * A clip's sample-accurate edge offsets, and the room they have to move in.
 * @typedef {object} FineTrim
 * @property {number} sa       start offset from `barStart`, after clamping
 * @property {number} sb       end offset from `barEnd`, after clamping
 * @property {number} barStart the bar-quantized start this offsets from
 * @property {number} barEnd
 * @property {number} min      first sample of the section — the edges' floor
 * @property {number} max      one past its last sample — their ceiling
 */

/**
 * One clip: a span of bars in a section, and where it lands in the chain.
 * @typedef {object} Slice
 * @property {Region} region     the section it belongs to
 * @property {number} aM         first bar, absolute and 0-based
 * @property {number} bM         last bar, inclusive
 * @property {number} start      first sample in the source stem
 * @property {number} end        one past the last sample
 * @property {number} frames     end − start
 * @property {number} num        1-based position in the chain = the slice number
 * @property {number} outStart   offset in the exported chain
 * @property {number} outEnd
 * @property {number} trig       step within the pattern, 1-based
 * @property {Region} trigRegion the pattern that trigs it (always `region`)
 * @property {number} trigRegionIdx
 * @property {boolean} edited    true when a manual trim produced it
 * @property {FineTrim} fine     sample-accurate edge offsets on top of the bars
 */

/**
 * Everything one stem contributes to the export.
 * @typedef {object} Track
 * @property {Slice[]} slices
 * @property {{region: Region, deleted: boolean}[]} ghosts  sections with no clip
 * @property {number} totalFrames  length of the concatenated chain
 */

export {};
