// Drag-and-drop intake. A drop can carry loose files, whole folders (Chrome/
// Safari expose these through the entries API) or archives; all three are
// flattened to { path, file } so callers see one shape.

// NOTE: DataTransfer contents are only readable synchronously during the drop
// event, so entries (and the plain-file fallback) are captured before the first
// await. Call this as the very first thing in a drop handler.
export function captureDrop(dt) {
  const items = dt.items ? [...dt.items] : [];
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  const files = [...(dt.files || [])];
  return { entries, files };
}

export async function filesFromDataTransfer(dtOrCapture) {
  const cap = dtOrCapture && dtOrCapture.entries ? dtOrCapture : captureDrop(dtOrCapture);
  if (!cap.entries.length) return cap.files.map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
  const out = [];
  await Promise.all(cap.entries.map(e => walkEntry(e, '', out)));
  // a browser that gave us entries but no readable files still has dt.files
  if (!out.length) return cap.files.map(f => ({ path: f.webkitRelativePath || f.name, file: f }));
  return out;
}

export const STEM_RE = /\.(wav|aiff?|flac|mid|midi|zip)$/i;
export const isStemDrop = items => items.filter(i => STEM_RE.test(i.path) && !i.path.split('/').pop().startsWith('.') && !i.path.includes('__MACOSX'));

function walkEntry(entry, prefix, out) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => { out.push({ path: prefix + entry.name, file: f }); resolve(); }, resolve);
    } else if (entry.isDirectory) {
      const reader = entry.createReader(), kids = [];
      const readBatch = () => reader.readEntries(async batch => {
        if (!batch.length) {
          await Promise.all(kids.map(k => walkEntry(k, prefix + entry.name + '/', out)));
          resolve();
          return;
        }
        kids.push(...batch);
        readBatch();
      }, resolve);
      readBatch();
    } else resolve();
  });
}

// Normalize a set of paths into an Octatrack project: the directory holding
// project.work becomes the root, so it works for a picked folder, a dropped
// folder, and a zip made either from or inside the project directory.
export function normalizeProject(items) {
  const hit = items.find(i => /(^|\/)project\.work$/i.test(i.path));
  if (!hit) return null;
  const root = hit.path.replace(/project\.work$/i, '');
  const folder = root ? root.replace(/\/$/, '').split('/').pop() : '';
  const files = items
    .filter(i => i.path.startsWith(root) && !i.path.split('/').pop().startsWith('.') && !i.path.includes('__MACOSX'))
    .map(i => ({ ...i, rel: i.path.slice(root.length) }))
    .filter(i => i.rel && !i.rel.endsWith('/'));
  return { folder: folder || 'PROJECT', files };
}
