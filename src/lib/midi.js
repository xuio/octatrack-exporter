// Arrangement MIDI: note-on ticks mark section starts (+ one final note = song
// end). Regions map to Octatrack patterns from Bank 2 with a scale that fits
// the section length into one pattern.

export function parseMidi(buf, fileName) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'MThd') throw new Error(fileName + ': not a MIDI file');
  const ntrks = dv.getUint16(10), division = dv.getUint16(12);
  if (division & 0x8000) throw new Error(fileName + ': SMPTE time division not supported');
  let off = 8 + dv.getUint32(4), bpm = null;
  const ticks = [];
  for (let t = 0; t < ntrks && off + 8 <= u8.length; t++) {
    if (tag(off) !== 'MTrk') break;
    const end = off + 8 + dv.getUint32(off + 4); let p = off + 8, abs = 0, run = 0;
    while (p < end) {
      let d = 0, b; do { b = u8[p++]; d = (d << 7) | (b & 127); } while (b & 128);
      abs += d; let st = u8[p];
      if (st < 0x80) st = run; else { p++; run = st; }
      if (st === 0xFF) { const type = u8[p++]; let len = 0; do { b = u8[p++]; len = (len << 7) | (b & 127); } while (b & 128); if (type === 0x51 && bpm === null) bpm = 60000000 / ((u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2]); p += len; }
      else if (st === 0xF0 || st === 0xF7) { let len = 0; do { b = u8[p++]; len = (len << 7) | (b & 127); } while (b & 128); p += len; }
      else { const hi = st & 0xF0, n = (hi === 0xC0 || hi === 0xD0) ? 1 : 2; if (hi === 0x90 && u8[p + 1] > 0) ticks.push(abs); p += n; }
    }
    off = end;
  }
  ticks.sort((a, b) => a - b);
  return { fileName, ppq: division, ticks, bpm: bpm ? Math.round(bpm * 100) / 100 : null, noteCount: ticks.length };
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
