// The directory-write path with the File System Access handles faked out: the
// real picker cannot be driven from Node (or headless Chrome), so what is proven
// here is the plumbing — that entry names become the same nested layout an unzip
// would produce, that the bytes are handed over untouched, and that the readback
// finds the same files again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEntryPath, writeEntries, readEntriesBack } from '../src/export/dirWrite.js';
import { fakeDir } from './fixtures.js';

test('entry names split into the directories to walk and the file to create', () => {
  assert.deepEqual(splitEntryPath('OSSC/bank02.work'), { dirs: ['OSSC'], file: 'bank02.work' });
  assert.deepEqual(splitEntryPath('PATTERNS.html'), { dirs: [], file: 'PATTERNS.html' });
  assert.deepEqual(splitEntryPath('A/B/C/x.wav'), { dirs: ['A', 'B', 'C'], file: 'x.wav' });
  assert.deepEqual(splitEntryPath('./A//x.wav'), { dirs: ['A'], file: 'x.wav' });
});

test('a path that would escape the picked folder is refused', () => {
  assert.throws(() => splitEntryPath('../evil.work'), /outside the picked folder/);
  assert.throws(() => splitEntryPath('OSSC/../../evil.work'), /outside the picked folder/);
  assert.throws(() => splitEntryPath(''), /no file name/);
});

test('writing lays out the same nesting an unzip would, with byte-identical data', async () => {
  const root = fakeDir('CARD');
  const entries = [
    { name: 'OSSC/project.work', data: new Uint8Array([1, 2, 3]) },
    { name: 'OSSC/bank02.work', data: new Uint8Array([4, 5]) },
    { name: 'PATTERNS.html', data: new Uint8Array([6]) },
  ];
  const seen = [];
  const written = await writeEntries(root, entries, (done, total) => seen.push(`${done}/${total}`));

  assert.equal(written, 3);
  assert.deepEqual(seen, ['1/3', '2/3', '3/3']);
  assert.deepEqual([...root.dirs.keys()], ['OSSC']);
  assert.deepEqual([...root.files.keys()], ['PATTERNS.html']);
  const folder = root.dirs.get('OSSC');
  assert.deepEqual([...folder.files.keys()], ['project.work', 'bank02.work']);
  assert.deepEqual([...folder.files.get('project.work')], [1, 2, 3]);
});

test('reading back returns the on-disk bytes under the original entry names', async () => {
  const root = fakeDir('CARD');
  const entries = [
    { name: 'OSSC/AUDIO/kick.wav', data: new Uint8Array([9, 9, 9]) },
    { name: 'OSSC/markers.work', data: new Uint8Array([7]) },
  ];
  await writeEntries(root, entries);

  const back = await readEntriesBack(root, entries);
  assert.deepEqual(back.map(e => e.name), entries.map(e => e.name));
  assert.deepEqual([...back[0].data], [9, 9, 9]);

  // and a file that never made it to disk is an error, not a silent pass
  await assert.rejects(readEntriesBack(root, [{ name: 'OSSC/missing.work', data: new Uint8Array() }]));
});
