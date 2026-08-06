import {
  decodeLatin1, encodeLatin1, writeStaticSlots, writeMarkersSlots, writeBankPatterns, bankPattern,
  verifyExport,
} from '../lib/index.js';
import { stemEntries } from './stemFiles.js';
import { stemFileBase } from './naming.js';
import { patternSheetHtml } from './patternSheet.js';

const pad2 = n => String(n).padStart(2, '0');

/**
 * Group every slice into the pattern that trigs it. A slice always lives inside
 * one section, so this is one trig per stem per pattern — but the grouping is
 * kept explicit because that is the contract the bank writer expects.
 */
function bankJobs(regions, stems, tracks, report) {
  const jobs = {};
  for (const region of regions) {
    if (!region.scale.ok) {
      report.push({ warn: true, text: `Region ${region.idx} > 32 bars — pattern ${region.bp} not programmed` });
      continue;
    }
    const trackJobs = [];
    stems.slice(0, 8).forEach((stem, i) => {
      const track = tracks.get(stem.id);
      const trigs = (track ? track.slices : [])
        .filter(s => s.trigRegionIdx === region.idx && s.num <= 64)
        .map(s => ({ step: s.trig, slice: s.num - 1 }));
      if (trigs.length) trackJobs.push({ trackIdx: i, trigs });
    });
    const bank = 2 + Math.floor((region.idx - 1) / 16);
    (jobs[bank] ??= []).push({
      patternIdx: (region.idx - 1) % 16,
      LEN: region.scale.LEN,
      mult: region.scale.mult,
      tracks: trackJobs,
    });
  }
  return jobs;
}

/**
 * Rewrites a copy of the user's project: audio + .ot beside it, Static slots and
 * tempo in project.work, slice grids in markers.work, trigs and scales in the
 * banks. Anything whose structure does not verify is copied through untouched,
 * and the part region (where scenes live) is checked byte-identical after every
 * bank write.
 */
export async function buildProject({ project, stems, tracks, regions, bpm, abbrev, folder }) {
  const entries = [];
  const report = [];
  const slots = [];
  const markers = [];

  // What every stem is supposed to end up as. The writers below consume it, and
  // so does the readback pass at the end — one description, checked both ways.
  const exported = [];
  stems.forEach((stem, i) => {
    const track = tracks.get(stem.id);
    if (!track || !track.slices.length) {
      report.push({ warn: true, text: `${stem.name} has no slices — Static slot ${i + 1} left empty` });
      return;
    }
    const base = stemFileBase(stem, i, abbrev);
    exported.push({
      slot0: i,
      wav: `${base}.wav`,
      ot: `${base}.ot`,
      totalFrames: track.totalFrames,
      bytesPerFrame: stem.bytesPerFrame,
      slices: track.slices.slice(0, 64).map(s => ({ start: s.outStart, end: s.outEnd })),
    });
    slots.push({ slot: i + 1, path: `${base}.wav`, bpm });
    if (i < 128) markers.push(exported[exported.length - 1]);
  });
  entries.push(...stemEntries({ stems, tracks, bpm, abbrev, prefix: `${folder}/` }));

  if (stems.length > 8) report.push({ warn: true, text: 'Octatrack has 8 audio tracks — stems 9+ are not programmed' });

  // Which tracks OSSC is allowed to set the per-track scale on: only the ones it
  // actually put a stem on. Everything else — a track kept for remixing at its
  // own bar length, and above all track 8, the master track — keeps the scale the
  // user's project already had.
  const scaleTracks = exported.map(s => s.slot0).filter(i => i < 7);
  if (exported.some(s => s.slot0 === 7)) {
    report.push({ warn: true, text: 'Stem 8 lands on track 8, the master track — its trigs are written but its scale is left untouched; set SCALE TRACK length and tempo multiplier on track 8 by hand' });
  }

  const jobs = bankJobs(regions, stems, tracks, report);
  const pending = new Set(Object.keys(jobs).map(Number));
  const written = {};   // banks that were actually programmed, for the readback pass
  let slotsWritten = false, banksWritten = 0, trigsWritten = 0, sawMarkers = false, markersWritten = false;

  for (const file of project.fileList) {
    const rel = file.rel;
    const bytes = await file.bytes();
    const bankMatch = rel.match(/^bank(\d+)\.work$/i);

    if (/^project\.work$/i.test(rel)) {
      const res = writeStaticSlots(decodeLatin1(bytes), slots, bpm);
      if (res.error) {
        report.push({ warn: true, text: `${res.error} — project.work copied unchanged` });
        entries.push({ name: `${folder}/${rel}`, data: bytes });
      } else {
        if (res.removed) report.push({ warn: true, text: `${res.removed} existing Static assignment(s) in slots 1–${slots.length} replaced` });
        entries.push({ name: `${folder}/${rel}`, data: encodeLatin1(res.text) });
        slotsWritten = true;
      }
    } else if (/^markers\.work$/i.test(rel)) {
      sawMarkers = true;
      const res = writeMarkersSlots(bytes, markers);
      if (res.error) {
        report.push({ warn: true, text: `markers.work: ${res.error} — copied unchanged; slices won't appear until each slot's sample is reloaded once on the device (the .ot beside each WAV carries them)` });
        entries.push({ name: `${folder}/${rel}`, data: bytes });
      } else {
        entries.push({ name: `${folder}/${rel}`, data: res.bytes });
        markersWritten = true;
        report.push({ text: `markers.work: trim + 64-slice grid written for ${res.slotsWritten} Static slots, checksum updated — slices appear on the device immediately` });
      }
    } else if (bankMatch && jobs[Number(bankMatch[1])]) {
      const res = writeBankPatterns(bytes, jobs[Number(bankMatch[1])], bpm, scaleTracks);
      if (res.error) {
        report.push({ warn: true, text: `${rel}: ${res.error} — copied unchanged; program its patterns from the sheet` });
        entries.push({ name: `${folder}/${rel}`, data: bytes });
      } else {
        let partsIntact = true;
        for (let i = res.partsStart; i < bytes.length - 2; i++) {
          if (bytes[i] !== res.bytes[i]) { partsIntact = false; break; }
        }
        entries.push({ name: `${folder}/${rel}`, data: partsIntact ? res.bytes : bytes });
        if (!partsIntact) {
          report.push({ warn: true, text: `${rel}: internal safety check tripped (parts region would have changed) — copied unchanged` });
        } else {
          banksWritten++;
          trigsWritten += res.trigsWritten;
          pending.delete(Number(bankMatch[1]));
          written[Number(bankMatch[1])] = jobs[Number(bankMatch[1])];
          report.push({ text: `${rel}: ${res.patternsWritten} patterns written — trigs + slice p-locks (samples via TRK DEFAULT, no sample locks) + per-track scales on the ${scaleTracks.length} stem track(s) only (all other tracks' scales untouched), master length INF · structure verified against this file (pattern ${res.psize} B · track section ${res.attSize} B) · parts/scenes byte-identical · checksum updated` });
        }
      }
    } else {
      entries.push({ name: `${folder}/${rel}`, data: bytes });
    }
  }

  if (!sawMarkers) report.push({ warn: true, text: "markers.work not found in the project folder — slices won't appear until each slot's sample is reloaded once on the device" });
  for (const bank of pending) {
    if (!project.fileList.some(f => new RegExp(`^bank${pad2(bank)}\\.work$`, 'i').test(f.rel))) {
      report.push({ warn: true, text: `bank${pad2(bank)}.work not found — its regions were not programmed` });
    }
  }

  entries.push({
    name: 'PATTERNS.html',
    data: new TextEncoder().encode(patternSheetHtml({ stems, tracks, regions, bpm, abbrev, withSetup: true })),
  });

  // Read the generated files back and diff them against what was asked for. This
  // cannot prove the device agrees with our reading of the format, but it does
  // prove the writers did what this build intended — which is where every format
  // bug so far has actually been.
  const verifyInputs = { folder, bpm, stems: exported, banks: written, markersWritten, scaleTracks };
  const check = verifyEntries(entries, verifyInputs);
  for (const problem of check.problems) {
    report.push({ warn: true, text: `Readback check: ${problem}` });
  }
  report.unshift(check.ok
    ? { text: `Readback verified: ${verifyCountsText(check.counts)} and every checksum decode back to exactly what the pattern table shows` }
    : { warn: true, text: `Readback found ${check.problems.length} mismatch(es) between the generated files and the pattern table — see below before loading this on the device` });

  report.unshift({ text: 'PATTERNS.html reference sheet added (verification aid + manual fallback)' });
  report.unshift({ text: `${banksWritten ? `${banksWritten} bank(s) pattern-programmed with ${trigsWritten} trigs; ` : ''}all other bank files copied byte-identical — parts and scenes untouched in every bank` });
  if (slotsWritten) report.unshift({ text: `${slots.length} Static sample slots written into project.work (timestretch off, ${bpm} BPM, trig quantize direct)` });
  report.unshift({ text: `${slots.length * 2} audio + .ot files added inside the project folder (no set-level AUDIO pool)` });

  // `verify` is the same result the lines above are worded from, handed out
  // structurally so the UI can show counts and per-trig mismatches without
  // parsing prose; `verifyInputs` lets a later copy of the same files (the ones
  // that landed on a card, say) be checked against the identical expectations.
  return { entries, report, verify: check, verifyInputs };
}

/**
 * Run the readback pass over one set of entries. Both the build itself and the
 * on-disk re-check go through here, so neither can drift from the other.
 */
export function verifyEntries(entries, verifyInputs) {
  return verifyExport({ entries, ...verifyInputs });
}

export const verifyCountsText = counts =>
  `${counts.trigs} trigs across ${counts.patterns} patterns, ${counts.slices} slices`;

export { bankPattern };
