// The whole export path in one pass: demo stems and MIDI → analysis → slices →
// a rewritten project folder, with the readback verifier running on the result.
// Everything upstream is the code the app actually calls, so a change that makes
// the writers and the pattern table disagree fails here rather than on a device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDemo, parseMidi, parseWav, regionsFromTicks, boundariesFor,
  measurePeaks, buildStemSlices, dbToLin,
} from '../src/lib/index.js';
import { buildProject, verifyEntries } from '../src/export/projectBuild.js';
import { decodeExport } from '../src/export/patternDecode.js';
import { writeEntries, readEntriesBack } from '../src/export/dirWrite.js';
import { makeBank, makeMarkers, fakeDir, bankGeometry } from './fixtures.js';

const PROJECT_TEXT = '[META]\r\nTYPE=OCTATRACK DPS-1 PROJECT\r\n[/META]\r\n\r\n'
  + '[SETTINGS]\r\nTEMPOx24=2880\r\n[/SETTINGS]\r\n\r\n############################\r\n\r\n';

/** Run the app's analysis pipeline over the demo song. */
function analyzeDemo(threshold = -45) {
  const demo = makeDemo('shake');
  const midi = parseMidi(demo.midi.data, demo.midi.name);
  const stems = demo.files.map((f, i) => ({ id: i + 1, name: `S${i + 1}`, ...parseWav(f.data, f.name) }));
  const { regions, totalMeasures } = regionsFromTicks(midi.ticks, midi.ppq);
  const bounds = boundariesFor(midi.bpm, totalMeasures);
  const regs = regions.filter(r => r.start < totalMeasures);

  const tracks = new Map();
  for (const stem of stems) {
    const peaks = measurePeaks(stem.chL, stem.chR, bounds);
    tracks.set(stem.id, buildStemSlices(peaks, regs, bounds, dbToLin(threshold), {}));
  }
  return { stems, tracks, regions: regs, bpm: midi.bpm };
}

/** A project folder in the shape buildProject reads: `rel` plus lazy bytes. */
function fakeProject(files) {
  return {
    folder: 'DEMO',
    fileList: Object.entries(files).map(([rel, data]) => ({ rel, bytes: async () => data })),
  };
}

const encode = text => new Uint8Array([...text].map(c => c.charCodeAt(0)));
const texts = report => report.map(r => r.text);

test('a generated project verifies against its own pattern table', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  const { entries, report } = await buildProject({
    project: fakeProject({
      'project.work': encode(PROJECT_TEXT),
      'markers.work': makeMarkers(),
      'bank02.work': makeBank(),
      'bank03.work': makeBank(),
    }),
    stems, tracks, regions, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  const problems = report.filter(r => r.warn).map(r => r.text);
  assert.deepEqual(problems.filter(t => /Readback/.test(t)), [], 'no readback mismatches');
  assert.match(texts(report).join('\n'), /Readback verified: \d+ trigs across \d+ patterns/);

  // and the files themselves are all there, inside the project folder
  const names = entries.map(e => e.name);
  assert.ok(names.includes('DEMO/project.work'));
  assert.ok(names.includes('DEMO/markers.work'));
  assert.ok(names.includes('DEMO/bank02.work'));
  assert.ok(names.includes('PATTERNS.html'));
  assert.equal(names.filter(n => n.endsWith('.wav')).length, stems.length);
  assert.equal(names.filter(n => n.endsWith('.ot')).length, stems.length);
  assert.ok(names.every(n => !n.includes('AUDIO/')), 'nothing goes in the set-level AUDIO pool');
});

test('a full build leaves the scale of every track it did not fill alone', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  assert.equal(stems.length, 5, 'the demo is five stems, so tracks 6-8 are the user\'s');
  const source = makeBank();
  const { entries, verifyInputs } = await buildProject({
    project: fakeProject({
      'project.work': encode(PROJECT_TEXT),
      'markers.work': makeMarkers(),
      'bank02.work': source.slice(),
      'bank03.work': makeBank(),
    }),
    stems, tracks, regions, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  assert.deepEqual(verifyInputs.scaleTracks, [0, 1, 2, 3, 4]);
  const written = entries.find(e => e.name === 'DEMO/bank02.work').data;
  const { trackAt } = bankGeometry();
  for (let idx = 0; idx < 16; idx++) {
    for (let t = 5; t < 8; t++) {
      const o = trackAt(idx, t);
      assert.deepEqual(
        [written[o + 89], written[o + 90]], [source[o + 89], source[o + 90]],
        `P${idx + 1} T${t + 1} scale changed`,
      );
    }
  }
  // the stem tracks did get the section scale, in every programmed pattern
  const patterns = verifyInputs.banks[2];
  assert.ok(patterns.length > 0);
  for (const job of patterns) {
    for (let t = 0; t < 5; t++) {
      const o = trackAt(job.patternIdx, t);
      assert.equal(written[o + 89], job.LEN, `P${job.patternIdx + 1} T${t + 1} length`);
    }
  }
});

/** The demo project every delivery test below is built from. */
const demoFiles = () => ({
  'project.work': encode(PROJECT_TEXT),
  'markers.work': makeMarkers(),
  'bank02.work': makeBank(),
  'bank03.work': makeBank(),
});

test('the structured verify result says the same thing as the report prose', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  const { report, verify, verifyInputs } = await buildProject({
    project: fakeProject(demoFiles()), stems, tracks, regions, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  assert.equal(verify.ok, true);
  assert.deepEqual(verify.problems, []);
  assert.ok(verify.counts.trigs > 0 && verify.counts.patterns > 0);
  // the headline line is worded from exactly these counts
  assert.ok(texts(report).includes(
    `Readback verified: ${verify.counts.trigs} trigs across ${verify.counts.patterns} patterns, `
    + `${verify.counts.slices} slices and every checksum decode back to exactly what the pattern table shows`,
  ));
  assert.equal(report.filter(r => r.warn && /Readback check/.test(r.text)).length, 0);
  // and the inputs handed out are enough to re-run the identical check later
  assert.deepEqual(Object.keys(verifyInputs).sort(), ['banks', 'bpm', 'folder', 'markersWritten', 'scaleTracks', 'stems']);
});

test('a mismatch shows up per trig in the structured verify result', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  const broken = regions.map((r, i) => (i === 1 ? { ...r, scale: { ...r.scale, LEN: 128 } } : r));
  const { verify } = await buildProject({
    project: fakeProject(demoFiles()), stems, tracks, regions: broken, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  assert.equal(verify.ok, false);
  assert.ok(verify.problems.length > 0);
});

test('the decoded pattern table is read out of the written bank bytes', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  const { entries, verify, verifyInputs } = await buildProject({
    project: fakeProject(demoFiles()), stems, tracks, regions, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  const banks = decodeExport({ entries, folder: 'DEMO', banks: verifyInputs.banks });
  // the demo arrangement fits in one bank; bank03 is copied through, not programmed
  assert.deepEqual(banks.map(b => b.name), ['bank02.work']);
  assert.ok(banks.every(b => !b.error));

  const chips = banks.flatMap(b => b.patterns.flatMap(p => p.tracks.flatMap(t => t.chips)));
  assert.equal(chips.length, verify.counts.trigs, 'one chip per verified trig');
  assert.ok(chips.every(c => c.state === 'ok'), 'every decoded trig matches its intended slice');
  assert.ok(banks.every(b => b.patterns.every(p => p.ok && p.tracks.every(t => t.scaleOk))));
});

test('entries delivered through the folder path verify identically on the way back', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  const { entries, verify, verifyInputs } = await buildProject({
    project: fakeProject(demoFiles()), stems, tracks, regions, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  const root = fakeDir('CARD');
  assert.equal(await writeEntries(root, entries), entries.length);
  assert.ok(root.dirs.has('DEMO'), 'the project folder is created inside the picked directory');

  const disk = await readEntriesBack(root, entries);
  const check = verifyEntries(disk, verifyInputs);
  assert.deepEqual(check.problems, []);
  assert.deepEqual(check.counts, verify.counts, 'what is on disk verifies exactly as the build did');
});

test('a pattern the bank writer silently skipped is caught, not shipped empty', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();

  // The bank writer walks away from a job whose length it cannot represent. That
  // is the right call, but on its own it is silent — the section would simply
  // have no trigs on the device. The readback pass is what turns it into a
  // reported problem.
  const broken = regions.map((r, i) => (i === 1 ? { ...r, scale: { ...r.scale, LEN: 128 } } : r));

  const { report } = await buildProject({
    project: fakeProject({
      'project.work': encode(PROJECT_TEXT),
      'markers.work': makeMarkers(),
      'bank02.work': makeBank(),
      'bank03.work': makeBank(),
    }),
    stems, tracks, regions: broken, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  const problems = report.filter(r => r.warn).map(r => r.text);
  assert.ok(
    problems.some(t => /Readback check.*P2/.test(t)),
    `expected pattern 2 to be reported, got:\n${problems.join('\n')}`,
  );
});

test('an unreadable bank is copied through untouched instead of being corrupted', async () => {
  const { stems, tracks, regions, bpm } = analyzeDemo();
  const damaged = makeBank();
  damaged[21] = 99;                                  // a bank version OSSC was never verified against
  const { entries, report } = await buildProject({
    project: fakeProject({
      'project.work': encode(PROJECT_TEXT),
      'markers.work': makeMarkers(),
      'bank02.work': damaged,
    }),
    stems, tracks, regions, bpm, abbrev: 'DEMO', folder: 'DEMO',
  });

  const out = entries.find(e => e.name === 'DEMO/bank02.work').data;
  assert.deepEqual([...out], [...damaged], 'byte-identical to what came in');
  assert.match(report.filter(r => r.warn).map(r => r.text).join('\n'), /copied unchanged/);
});
