// bank??.work pattern writer.
// Layout facts from ot-tools-io (GPL v3) docs/source — facts only, no code ported;
// several details corrected by on-device verification (see docs/notes-formats.md).
// All offsets are runtime-verified against the user's own bank file via the PTRN/TRAC
// section magics before a single byte is written. Parts (where scenes live) are never touched.
const BANK_HDR = [70, 79, 82, 77, 0, 0, 0, 0, 68, 80, 83, 49, 66, 65, 78, 75, 0, 0, 0, 0, 0];

export function writeBankPatterns(src, jobs, bpm) {
  const u8 = new Uint8Array(src);
  for (let i = 0; i < 21; i++) if (u8[i] !== BANK_HDR[i]) return { error: 'bank header mismatch' };
  if (u8[21] !== 23) return { error: 'bank data version ' + u8[21] + ' — verified for version 23 (OS 1.40) only' };
  // locate the 16 patterns via their PTRN....... magic
  const ptrn = [];
  for (let i = 22; i < u8.length - 8 && ptrn.length < 17; i++)
    if (u8[i] === 0x50 && u8[i + 1] === 0x54 && u8[i + 2] === 0x52 && u8[i + 3] === 0x4E && !u8[i + 4] && !u8[i + 5] && !u8[i + 6] && !u8[i + 7]) ptrn.push(i);
  if (ptrn.length < 16 || ptrn[0] !== 22) return { error: 'pattern sections not found where expected' };
  const psize = ptrn[1] - ptrn[0];
  for (let k = 1; k < 16; k++) if (ptrn[k] !== 22 + k * psize) return { error: 'pattern spacing inconsistent' };
  // audio track sections ("TRAC") inside pattern 1
  const a0 = 22 + 8;
  if (!(u8[a0] === 0x54 && u8[a0 + 1] === 0x52 && u8[a0 + 2] === 0x41 && u8[a0 + 3] === 0x43)) return { error: 'first audio track section not at expected offset' };
  let attSize = -1;
  for (let i = a0 + 4; i < 22 + psize - 4; i++) if (u8[i] === 0x54 && u8[i + 1] === 0x52 && u8[i + 2] === 0x41 && u8[i + 3] === 0x43 && u8[i + 8] === 1) { attSize = i - a0; break; }
  if (attSize < 2210) return { error: 'audio track section size not derivable' };
  for (let t = 0; t < 8; t++) { const o = a0 + t * attSize; if (!(u8[o] === 0x54 && u8[o + 3] === 0x43) || u8[o + 8] !== t) return { error: 'audio track section layout mismatch (track ' + (t + 1) + ')' }; }
  // known interior: hdr4+unk4+id1 + masks80 + perTrackScale2 + swing1 + patSettings5 + unk1 = 97; tail: plocks 64×32 + unknown 64×1 + trig-cond 64×R
  const rSize = (attSize - 2210) / 64;
  if (!Number.isInteger(rSize) || rSize < 1 || rSize > 8) return { error: 'unexpected audio track section size ' + attSize };
  const plockRel = attSize - 64 * rSize - 64 - 2048;
  const MASK_BYTE = [7, 6, 5, 4, 3, 2, 1, 0]; // half-page → file byte: fully reversed (byte = 7 - halfpage) — DEVICE-VERIFIED; ot-tools-io's doc claiming h1-before-h2 on pages 2-4 is wrong
  const MULT = { '1x': 2, '1/2x': 4, '1/4x': 5, '1/8x': 6 };
  let trigsWritten = 0, patternsWritten = 0;
  for (const job of jobs) {
    const base = 22 + job.patternIdx * psize, multCode = MULT[job.mult];
    if (multCode === undefined || job.LEN < 2 || job.LEN > 64) continue;
    // pattern tail: scale(6) chain(2) unknown(1) part(1) tempo(2) — scale starts at end-12
    const so = base + psize - 12;
    // per-track mode; master length INF (mult=255, len=255) so each track loops on its own
    // SCALE TRACK length; master scale stays 1x (code 2). Track lengths are set per-track below.
    u8[so] = 255; u8[so + 1] = 255; u8[so + 2] = 2; u8[so + 5] = 1;
    if (bpm) { const t24 = Math.round(bpm * 24); u8[base + psize - 2] = t24 >> 8; u8[base + psize - 1] = t24 & 255; } // pattern tempo (used when pattern-tempo mode is on)
    for (let t = 0; t < 8; t++) {
      const o = base + 8 + t * attSize;
      u8[o + 89] = job.LEN; u8[o + 90] = multCode; // per-track len + scale
      const tj = job.tracks.find(x => x.trackIdx === t);
      if (!tj) continue;
      const mask = new Uint8Array(8);
      for (const tr of tj.trigs) { const s = tr.step - 1; if (s >= 0 && s < 64) mask[MASK_BYTE[s >> 3]] |= 1 << (s & 7); }
      for (let b = 0; b < 8; b++) u8[o + 9 + b] = mask[b]; // trigger trig mask
      for (const tr of tj.trigs) {
        const s = tr.step - 1; if (s < 0 || s > 63) continue;
        const p = o + plockRel + s * 32;
        u8[p + 1] = tr.slice * 2;  // machine param 2 (STRT) p-lock: 0-127 knob, 2 ticks per slice — slice N (0-based) = N*2
        u8[p + 31] = 255;          // no sample lock — trig plays the track's default sample (TRK DEFAULT)
        trigsWritten++;
      }
    }
    patternsWritten++;
  }
  let sum = 0;
  for (let i = 20; i < u8.length - 2; i++) sum = (sum + u8[i]) & 0xFFFF;
  u8[u8.length - 2] = sum >> 8; u8[u8.length - 1] = sum & 255; // big-endian checksum
  return { bytes: u8, psize, attSize, rSize, partsStart: 22 + 16 * psize, trigsWritten, patternsWritten };
}
