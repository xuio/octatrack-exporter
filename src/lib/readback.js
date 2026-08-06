// Readback verification.
//
// Every format bug OSSC has shipped — slice numbers stored at the wrong scale,
// trig masks in the wrong byte order, a +12 dB gain default — looked correct in
// the writer and only showed up on the device. The readers below decode the
// bytes the writers just produced and `verifyExport` diffs that decode against
// what the pattern table says should be there, so the same class of mistake
// fails at build time instead of on a CF card.
//
// The decoders deliberately re-derive their own field positions and their own
// inverse of the trig-mask reversal rather than sharing them with the writers:
// a change made on one side and not the other is exactly what this is for. What
// they do share is `bankLayout`, which discovers section offsets in the user's
// own file by magic bytes — that is measurement, not an assumption.
import { bankLayout, CODE_MULT } from './bankFile.js';

const view = src => (src instanceof Uint8Array ? src : new Uint8Array(src));
const dvOf = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

// ---------------------------------------------------------------- .ot sidecar

export function readOt(src) {
  const u8 = view(src);
  if (u8.length !== 832) return { error: `.ot is ${u8.length} B, expected 832` };
  const dv = dvOf(u8);
  const count = dv.getUint32(826);
  const slices = [];
  for (let i = 0; i < Math.min(count, 64); i++) {
    const o = 58 + i * 12;
    slices.push({ start: dv.getUint32(o), end: dv.getUint32(o + 4), loop: dv.getUint32(o + 8) });
  }
  let sum = 0;
  for (let i = 16; i < 830; i++) sum += u8[i];
  return {
    tempo: dv.getUint32(23) / 24,
    stretch: dv.getUint32(35),
    loop: dv.getUint32(39),
    gain: dv.getUint16(43),
    quantize: u8[45],
    trimStart: dv.getUint32(46),
    trimEnd: dv.getUint32(50),
    sliceCount: count,
    slices,
    checksumOk: (sum & 0xFFFF) === dv.getUint16(830),
  };
}

// -------------------------------------------------------------- markers.work

const MARKERS_SLOT_SIZE = 784;
const MARKERS_STATIC_FIRST = 136;   // 128 flex + 8 recorder slots precede the static ones
const MARKERS_SIZE = 22 + 264 * MARKERS_SLOT_SIZE + 2;

export function readMarkersSlot(src, slot0) {
  const u8 = view(src);
  if (u8.length !== MARKERS_SIZE) return { error: `markers.work is ${u8.length} B, expected ${MARKERS_SIZE}` };
  if (slot0 < 0 || slot0 > 127) return { error: `static slot ${slot0} out of range` };
  const dv = dvOf(u8);
  const off = 22 + (MARKERS_STATIC_FIRST + slot0) * MARKERS_SLOT_SIZE;
  const count = dv.getUint32(off + 780);
  const slices = [];
  for (let i = 0; i < Math.min(count, 64); i++) {
    const o = off + 12 + i * 12;
    slices.push({ start: dv.getUint32(o), end: dv.getUint32(o + 4), loop: dv.getUint32(o + 8) });
  }
  return { trimStart: dv.getUint32(off), trimEnd: dv.getUint32(off + 4), sliceCount: count, slices };
}

export function markersChecksumOk(src) {
  const u8 = view(src);
  let sum = 0;
  for (let i = 16; i < u8.length - 2; i++) sum = (sum + u8[i]) & 0xFFFF;
  return u8[u8.length - 2] === (sum >> 8) && u8[u8.length - 1] === (sum & 255);
}

// ---------------------------------------------------------------- bank??.work

export function bankChecksumOk(src) {
  const u8 = view(src);
  let sum = 0;
  for (let i = 20; i < u8.length - 2; i++) sum = (sum + u8[i]) & 0xFFFF;
  return u8[u8.length - 2] === (sum >> 8) && u8[u8.length - 1] === (sum & 255);
}

/**
 * Decode one pattern: its scale block and, for all eight audio tracks, the
 * length, tempo multiplier and every trig with the slice it plays.
 */
export function readBankPattern(src, patternIdx) {
  const layout = bankLayout(view(src));
  if (layout.error) return { error: layout.error };
  const { u8, psize, plockRel } = layout;
  const base = layout.patternAt(patternIdx);
  const so = layout.scaleAt(base);

  const tracks = [];
  for (let t = 0; t < 8; t++) {
    const o = layout.trackAt(base, t);
    const trigs = [];
    for (let step = 1; step <= 64; step++) {
      // Step n (1-based) sits in half-page (n-1)>>3, and the device stores the
      // half-pages in reverse order, so its bits are in file byte 7 − halfPage.
      const s = step - 1;
      const halfPage = (s / 8) | 0;
      if (!((u8[o + 9 + (7 - halfPage)] >> (s % 8)) & 1)) continue;
      const p = o + plockRel + s * 32;
      const knob = u8[p + 1];
      trigs.push({
        step,
        // STRT is a 0–127 knob at two ticks per slice; an odd value means the
        // trig does not land cleanly on a slice boundary.
        slice: knob % 2 === 0 ? knob / 2 : null,
        knob,
        trkDefault: u8[p + 31] === 255,
      });
    }
    tracks.push({
      trackIdx: t,
      LEN: u8[o + 89],
      multCode: u8[o + 90],
      mult: CODE_MULT[u8[o + 90]] || null,
      trigs,
    });
  }

  return {
    patternIdx,
    masterLenMult: u8[so],
    masterLen: u8[so + 1],
    masterScale: u8[so + 2],
    tempo: ((u8[base + psize - 2] << 8) | u8[base + psize - 1]) / 24,
    tracks,
  };
}

// ------------------------------------------------------------------- verifier

const pad2 = n => String(n).padStart(2, '0');
const trigKey = t => `${t.step}:${t.slice}`;

/**
 * Decode the generated files and diff them against what was asked for.
 *
 * `banks` is the same job structure the bank writer consumed, `stems` the same
 * slice lists the .ot and markers writers consumed — so a disagreement means a
 * writer did not do what the caller asked, which is the only thing this can
 * usefully prove without a device.
 */
export function verifyExport({ entries, folder, bpm, banks, stems, markersWritten = true }) {
  const problems = [];
  const files = new Map(entries.map(e => [e.name, e.data]));
  const at = name => files.get(folder ? `${folder}/${name}` : name);
  const counts = { patterns: 0, trigs: 0, slices: 0, slots: 0 };

  // --- per-stem: the .ot sidecar and the audio it describes
  for (const stem of stems) {
    const ot = at(stem.ot);
    if (!ot) { problems.push(`${stem.ot} is missing from the export`); continue; }
    const read = readOt(ot);
    if (read.error) { problems.push(`${stem.ot}: ${read.error}`); continue; }
    if (!read.checksumOk) problems.push(`${stem.ot}: checksum does not match its contents`);
    if (read.gain !== 48) problems.push(`${stem.ot}: gain reads ${read.gain}, expected 48 (0 dB)`);
    if (read.stretch !== 0) problems.push(`${stem.ot}: timestretch is on`);
    if (read.trimEnd !== stem.totalFrames) problems.push(`${stem.ot}: trim end ${read.trimEnd}, expected ${stem.totalFrames}`);
    if (bpm && Math.abs(read.tempo - bpm) > 0.05) problems.push(`${stem.ot}: tempo reads ${read.tempo}, expected ${bpm}`);

    const want = stem.slices.slice(0, 64);
    if (read.sliceCount !== want.length) {
      problems.push(`${stem.ot}: ${read.sliceCount} slices, expected ${want.length}`);
    } else {
      const bad = want.findIndex((s, i) => read.slices[i].start !== s.start || read.slices[i].end !== s.end);
      if (bad >= 0) {
        problems.push(`${stem.ot}: slice ${bad + 1} reads ${read.slices[bad].start}–${read.slices[bad].end}, expected ${want[bad].start}–${want[bad].end}`);
      }
      counts.slices += want.length;
    }

    const wav = at(stem.wav);
    if (!wav) problems.push(`${stem.wav} is missing from the export`);
    else if (wav.length !== 44 + stem.totalFrames * stem.bytesPerFrame) {
      problems.push(`${stem.wav}: ${wav.length} B does not match ${stem.totalFrames} frames at ${stem.bytesPerFrame} B/frame`);
    }
  }

  // --- markers.work: the same slice grids, in the file the device actually reads
  // Only worth reading back when the writer claimed to have written it — a
  // file copied through untouched is already reported by the builder.
  const markers = markersWritten ? at('markers.work') : null;
  if (markers) {
    if (!markersChecksumOk(markers)) problems.push('markers.work: checksum does not match its contents');
    for (const stem of stems) {
      const read = readMarkersSlot(markers, stem.slot0);
      if (read.error) { problems.push(`markers.work: ${read.error}`); continue; }
      const want = stem.slices.slice(0, 64);
      if (read.sliceCount !== want.length || read.trimEnd !== stem.totalFrames) {
        problems.push(`markers.work slot ${stem.slot0 + 1}: ${read.sliceCount} slices / trim ${read.trimEnd}, expected ${want.length} / ${stem.totalFrames}`);
        continue;
      }
      const bad = want.findIndex((s, i) => read.slices[i].start !== s.start || read.slices[i].end !== s.end);
      if (bad >= 0) problems.push(`markers.work slot ${stem.slot0 + 1}: slice ${bad + 1} reads ${read.slices[bad].start}–${read.slices[bad].end}, expected ${want[bad].start}–${want[bad].end}`);
      else counts.slots++;
    }
  }

  // --- banks: scales, per-track lengths and every trig with the slice it fires
  for (const [bank, jobs] of Object.entries(banks)) {
    const name = `bank${pad2(Number(bank))}.work`;
    const bytes = at(name);
    if (!bytes) continue;                       // an absent bank is reported by the builder
    if (!bankChecksumOk(bytes)) problems.push(`${name}: checksum does not match its contents`);

    for (const job of jobs) {
      const read = readBankPattern(bytes, job.patternIdx);
      if (read.error) { problems.push(`${name} P${job.patternIdx + 1}: ${read.error}`); break; }
      const where = `${name} P${job.patternIdx + 1}`;

      if (read.masterLen !== 255 || read.masterLenMult !== 255) problems.push(`${where}: master length is not INF`);
      if (read.masterScale !== 2) problems.push(`${where}: master scale is not 1x`);
      if (bpm && Math.abs(read.tempo - bpm) > 0.05) problems.push(`${where}: tempo reads ${read.tempo}, expected ${bpm}`);

      for (const track of read.tracks) {
        const label = `${where} T${track.trackIdx + 1}`;
        if (track.LEN !== job.LEN || track.mult !== job.mult) {
          problems.push(`${label}: scale reads ${track.LEN}/${track.mult || `code ${track.multCode}`}, expected ${job.LEN}/${job.mult}`);
        }
        const want = (job.tracks.find(x => x.trackIdx === track.trackIdx) || { trigs: [] }).trigs;
        const wantKeys = want.map(trigKey).sort();
        const gotKeys = track.trigs.map(trigKey).sort();
        if (wantKeys.join() !== gotKeys.join()) {
          problems.push(`${label}: trigs read [${gotKeys.join(' ')}], expected [${wantKeys.join(' ')}] (step:slice, 0-based slice)`);
        } else {
          counts.trigs += want.length;
        }
        const locked = track.trigs.find(t => !t.trkDefault);
        if (locked) problems.push(`${label}: step ${locked.step} carries a sample lock — trigs must play TRK DEFAULT`);
      }
      counts.patterns++;
    }
  }

  return { ok: problems.length === 0, problems, counts };
}
