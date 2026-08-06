// Arrangement MIDI: note-on ticks mark section starts (+ one final note = song
// end). Regions map to Octatrack patterns from Bank 2 with a scale that fits
// the section length into one pattern.

/**
 * Variable-length quantity, bounded by the end of the track so a corrupt file
 * cannot run the reader off into the next chunk. `bad` means the value never
 * terminated within its four-byte maximum.
 */
function readVarLen(u8, p, end) {
  let v = 0;
  for (let n = 0; n < 4 && p < end; n++) {
    const b = u8[p++];
    v = (v << 7) | (b & 127);
    if (!(b & 128)) return { v, p, bad: false };
  }
  return { v, p, bad: true };
}

export function parseMidi(buf, fileName) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'MThd') throw new Error(fileName + ': not a MIDI file');
  const ntrks = dv.getUint16(10), division = dv.getUint16(12);
  if (division & 0x8000) throw new Error(fileName + ': SMPTE time division not supported');
  let off = 8 + dv.getUint32(4), bpm = null, ranStatus = false;
  const ticks = [];

  for (let t = 0; t < ntrks && off + 8 <= u8.length; t++) {
    if (tag(off) !== 'MTrk') break;
    const end = Math.min(off + 8 + dv.getUint32(off + 4), u8.length);
    let p = off + 8, abs = 0, run = 0;

    while (p < end) {
      const delta = readVarLen(u8, p, end);
      if (delta.bad) break;
      p = delta.p; abs += delta.v;
      if (p >= end) break;

      let st = u8[p];
      if (st & 0x80) {
        p++;
        // Running status carries over between channel messages only: any system
        // message (meta, sysex, real-time) cancels it. Missing this is what makes
        // a hand-rolled parser lose notes on real DAW exports, where a meta event
        // sits in the middle of the note stream.
        run = st < 0xF0 ? st : 0;
      } else if (run) {
        st = run;
        ranStatus = true;
      } else break;  // a data byte with no status to inherit — the track is unreadable from here

      if (st === 0xFF) {
        if (p >= end) break;
        const type = u8[p++];
        const len = readVarLen(u8, p, end);
        if (len.bad) break;
        p = len.p;
        if (type === 0x51 && bpm === null && p + 2 < end) bpm = 60000000 / ((u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2]);
        p += len.v;
      } else if (st === 0xF0 || st === 0xF7) {
        const len = readVarLen(u8, p, end);
        if (len.bad) break;
        p = len.p + len.v;
      } else if (st >= 0xF0) {
        // System common and real-time. Their payloads are fixed and small; the
        // trap is treating them as channel messages and skipping two bytes,
        // which desyncs the reader and silently drops every note after them.
        p += st === 0xF2 ? 2 : (st === 0xF1 || st === 0xF3) ? 1 : 0;
      } else {
        const hi = st & 0xF0, n = (hi === 0xC0 || hi === 0xD0) ? 1 : 2;
        if (hi === 0x90 && p + 1 < end && u8[p + 1] > 0) ticks.push(abs);
        p += n;
      }
    }
    off = end;
  }

  ticks.sort((a, b) => a - b);
  return {
    fileName, ppq: division, ticks, noteCount: ticks.length,
    bpm: bpm ? Math.round(bpm * 100) / 100 : null,
    ranStatus,
  };
}

export function regionsFromTicks(ticks, ppq) {
  const tpm = ppq * 4; let snapped = 0;
  let measures = ticks.map(t => { const m = Math.round(t / tpm); if (Math.abs(t - m * tpm) > 0) snapped++; return m; });
  measures = [...new Set(measures)].sort((a, b) => a - b);
  if (measures.length < 2) return { error: 'MIDI must contain at least 2 notes (section starts + song end)' };
  const regions = [];
  for (let i = 0; i < measures.length - 1; i++) {
    const idx = i + 1, len = measures[i + 1] - measures[i];
    regions.push({ idx, start: measures[i], end: measures[i + 1], len, name: '', ...bankPattern(idx), scale: scaleFor(len) });
  }
  return { regions, snapped, totalMeasures: measures[measures.length - 1] };
}

export function bankPattern(idx) { const bank = 2 + Math.floor((idx - 1) / 16), pattern = ((idx - 1) % 16) + 1; return { bank, pattern, bp: 'B' + bank + ' P' + pattern }; }

/**
 * How many trig keys one bar is worth, per pattern scale. A section has to fit
 * in 64 steps, so the longer it is the coarser the grid gets.
 */
const SCALES = [
  { upToBars: 4, mult: '1x', stepsPerBar: 16 },
  { upToBars: 8, mult: '1/2x', stepsPerBar: 8 },
  { upToBars: 16, mult: '1/4x', stepsPerBar: 4 },
  { upToBars: 32, mult: '1/8x', stepsPerBar: 2 },
];

export function scaleFor(bars) {
  const scale = SCALES.find(s => bars <= s.upToBars);
  if (!scale) return { ok: false, mult: '—', steps: 0, LEN: 0, MAX: 0, label: '> 32 bars', master: '—' };
  const LEN = scale.stepsPerBar * bars, MAX = Math.ceil(LEN / 16) * 16;
  return {
    ok: true,
    mult: scale.mult,
    steps: scale.stepsPerBar,
    LEN,
    MAX,
    label: `${LEN}/${MAX} · ${scale.mult}`,
    master: `MASTER: ${String(LEN).padStart(4, '0')} · ${scale.mult}`,
  };
}

export const trigStep = (measureInRegion, steps) => measureInRegion * steps + 1; // measureInRegion 0-based
