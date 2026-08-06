// Direct-to-disk delivery for a generated project (File System Access API).
//
// The zip and this path consume the very same `entries`, so a CF card written
// here holds byte-identical files to what unzipping would have produced — only
// the transport differs. Nothing here touches file *contents*.
//
// The API's types are not in the default TS lib set, so the handles are
// described by the minimal typedefs below rather than by loosening jsconfig.

/** @typedef {{ write(data: BufferSource): Promise<void>, close(): Promise<void> }} WritableLike */
/** @typedef {{ createWritable(): Promise<WritableLike>, getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> }} FileHandleLike */
/**
 * @typedef {{
 *   name: string,
 *   getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike>,
 *   getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>,
 * }} DirHandleLike
 */
/** @typedef {{ name: string, data: Uint8Array }} Entry */

/** True when the browser can be asked for a writable directory (Chrome/Edge). */
export const canWriteToFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/**
 * Split an entry name ('FOLDER/sub/file.wav') into the directories to walk and
 * the file to create. Pure, because getting this wrong would scatter a project
 * across a CF card — or, with '..', outside the folder the user picked.
 */
export function splitEntryPath(name) {
  const parts = String(name).split('/').filter(p => p !== '' && p !== '.');
  if (parts.some(p => p === '..')) throw new Error(`refusing to write outside the picked folder: ${name}`);
  const file = parts.pop();
  if (!file) throw new Error(`entry has no file name: ${name}`);
  return { dirs: parts, file };
}

/** Walk (and optionally create) a chain of subdirectories, memoising each level. */
async function dirFor(root, dirs, cache, create) {
  let handle = root, path = '';
  for (const dir of dirs) {
    path += `${dir}/`;
    let next = cache.get(path);
    if (!next) {
      next = await handle.getDirectoryHandle(dir, { create });
      cache.set(path, next);
    }
    handle = next;
  }
  return handle;
}

/**
 * Ask the user for a directory to write into. Rejects with the picker's own
 * AbortError when they cancel — the caller decides that is not a failure.
 * @returns {Promise<DirHandleLike>}
 */
export function pickDirectory() {
  const picker = /** @type {(opts?: { mode?: string }) => Promise<DirHandleLike>} */ (
    /** @type {any} */ (window).showDirectoryPicker
  );
  return picker({ mode: 'readwrite' });
}

/**
 * Write every entry below `root`, creating the folders its name implies. Picking
 * the CF card root therefore lays out FOLDER/... exactly as the zip would.
 * @param {DirHandleLike} root
 * @param {Entry[]} entries
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function writeEntries(root, entries, onProgress) {
  const cache = new Map();
  let done = 0;
  for (const entry of entries) {
    const { dirs, file } = splitEntryPath(entry.name);
    const dir = await dirFor(root, dirs, cache, true);
    const handle = await dir.getFileHandle(file, { create: true });
    const stream = await handle.createWritable();
    await stream.write(entry.data);
    await stream.close();
    if (onProgress) onProgress(++done, entries.length);
    else done++;
  }
  return done;
}

/**
 * Read the same entries back off disk, in the shape `verifyExport` consumes —
 * so the verification after a direct write runs on the bytes that actually
 * landed, not on the in-memory copy they were made from.
 * @param {DirHandleLike} root
 * @param {Entry[]} entries
 * @returns {Promise<Entry[]>}
 */
export async function readEntriesBack(root, entries) {
  const cache = new Map();
  const out = [];
  for (const entry of entries) {
    const { dirs, file } = splitEntryPath(entry.name);
    const dir = await dirFor(root, dirs, cache, false);
    const handle = await dir.getFileHandle(file);
    out.push({ name: entry.name, data: new Uint8Array(await (await handle.getFile()).arrayBuffer()) });
  }
  return out;
}
