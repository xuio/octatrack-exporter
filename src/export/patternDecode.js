// Decode what is *in* a set of bank files, for display.
//
// This is deliberately not a re-print of the intent: every trig shown here was
// read back out of the written (or loaded) bytes with `readBankPattern`. When an
// intended job is supplied the two are merged step by step so a disagreement is
// visible per chip rather than as one line of prose.
import { readBankPattern, readMarkersSlot, markersChecksumOk } from '../lib/index.js';

const pad2 = n => String(n).padStart(2, '0');
export const bankFileName = bank => `bank${pad2(bank)}.work`;

/**
 * @typedef {{ step: number, slice: number|null, want: number|null,
 *   state: 'plain'|'ok'|'wrong'|'extra'|'missing' }} Chip
 */

/**
 * One chip per step that either was found in the file or was asked for.
 * `want` null (decode-only mode) means there is nothing to compare against.
 */
function mergeTrigs(got, want) {
  const gotBy = new Map(got.map(t => [t.step, t]));
  const wantBy = want ? new Map(want.map(t => [t.step, t])) : null;
  const steps = [...new Set([...gotBy.keys(), ...(wantBy ? wantBy.keys() : [])])].sort((a, b) => a - b);
  return steps.map(step => {
    const g = gotBy.get(step);
    const w = wantBy ? wantBy.get(step) : null;
    if (!wantBy) return { step, slice: g.slice, want: null, state: 'plain' };
    if (!g) return { step, slice: null, want: w.slice, state: 'missing' };
    if (!w) return { step, slice: g.slice, want: null, state: 'extra' };
    return { step, slice: g.slice, want: w.slice, state: g.slice === w.slice ? 'ok' : 'wrong' };
  });
}

/**
 * Decode one bank file. With `jobs` only the programmed patterns are decoded and
 * merged against them; without, all 16 are scanned and the empty ones dropped.
 */
export function decodeBank(bytes, { bank, name = null, jobs = null }) {
  const file = name || bankFileName(bank);
  const idxs = jobs
    ? [...jobs].map(j => j.patternIdx).sort((a, b) => a - b)
    : Array.from({ length: 16 }, (_, i) => i);
  const patterns = [];

  for (const patternIdx of idxs) {
    const read = readBankPattern(bytes, patternIdx);
    // A layout that does not verify makes every offset below meaningless, so the
    // whole bank is reported as skipped rather than half-decoded.
    if (read.error) return { bank, name: file, error: read.error, patterns: [] };

    const job = jobs ? jobs.find(j => j.patternIdx === patternIdx) : null;
    const tracks = [];
    for (const track of read.tracks) {
      const want = job ? (job.tracks.find(x => x.trackIdx === track.trackIdx) || { trigs: [] }).trigs : null;
      const chips = mergeTrigs(track.trigs, want);
      if (!chips.length) continue;
      tracks.push({
        trackIdx: track.trackIdx,
        LEN: track.LEN,
        mult: track.mult,
        wantLEN: job ? job.LEN : null,
        wantMult: job ? job.mult : null,
        scaleOk: job ? track.LEN === job.LEN && track.mult === job.mult : true,
        chips,
      });
    }
    if (!jobs && !tracks.length) continue;
    patterns.push({
      bank,
      patternIdx,
      tempo: read.tempo,
      masterScale: read.masterScale,
      tracks,
      ok: tracks.every(t => t.scaleOk && t.chips.every(c => c.state === 'ok' || c.state === 'plain')),
    });
  }
  return { bank, name: file, error: null, patterns };
}

/**
 * Decode the banks a build actually programmed, straight out of its entries.
 * `banks` is the same job structure the bank writer and the verifier consumed.
 */
export function decodeExport({ entries, folder, banks }) {
  const files = new Map(entries.map(e => [e.name, e.data]));
  return Object.entries(banks || {})
    .map(([bank, jobs]) => {
      const name = bankFileName(Number(bank));
      const bytes = files.get(folder ? `${folder}/${name}` : name);
      return bytes ? decodeBank(bytes, { bank: Number(bank), name, jobs }) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.bank - b.bank);
}

/**
 * Decode a project the user loaded, without generating anything: every bank's
 * programmed patterns plus a summary of the slice grids in markers.work.
 */
export async function inspectProject(project) {
  const banks = [];
  for (const file of project.fileList) {
    const match = file.rel.match(/^bank(\d+)\.work$/i);
    if (!match) continue;
    banks.push(decodeBank(await file.bytes(), { bank: Number(match[1]), name: file.rel }));
  }
  banks.sort((a, b) => a.bank - b.bank);

  const markersFile = project.fileList.find(f => /^markers\.work$/i.test(f.rel));
  let markers = null;
  if (markersFile) {
    const bytes = await markersFile.bytes();
    const probe = readMarkersSlot(bytes, 0);
    if (probe.error) {
      markers = { error: probe.error, slots: [], checksumOk: false };
    } else {
      const slots = [];
      for (let slot0 = 0; slot0 < 128; slot0++) {
        const read = readMarkersSlot(bytes, slot0);
        if (read.error || !read.sliceCount) continue;
        slots.push({ slot: slot0 + 1, sliceCount: read.sliceCount, trimStart: read.trimStart, trimEnd: read.trimEnd });
      }
      markers = { error: null, slots, checksumOk: markersChecksumOk(bytes) };
    }
  }
  return { banks, markers };
}
