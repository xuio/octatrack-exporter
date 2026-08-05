import { useCallback, useState } from 'react';
import { readZip, normalizeProject, decodeLatin1, parseProjectText } from '../lib/index.js';

const OS_SUPPORTED = /^1\.40[ABC]$/;

/** Loads the user's Octatrack project from a picked folder, a dropped folder or a .zip. */
export function useProjectFolder() {
  const [project, setProject] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (items) => {
    const flat = [];
    for (const item of items) {
      if (!/\.zip$/i.test(item.path)) { flat.push(item); continue; }
      try {
        const entries = await readZip(await item.file.arrayBuffer());
        for (const entry of entries) flat.push({ path: entry.name, data: entry.data });
      } catch (err) {
        setProject(null);
        setReport([{ warn: true, text: `${item.path}: ${err.message}` }]);
        return;
      }
    }

    const normalized = normalizeProject(flat);
    if (!normalized) {
      setProject({
        folder: '—', files: flat.length, banks: [], os: 'not found', fileList: [],
        warn: 'No project.work found — is this an Octatrack project folder (or a zip of one)?',
      });
      setReport(null);
      return;
    }

    const fileList = normalized.files.map(f => ({
      rel: f.rel,
      bytes: async () => (f.data ? f.data : new Uint8Array(await f.file.arrayBuffer())),
    }));
    const banks = fileList.filter(f => /^bank\d+\.(work|strd)$/i.test(f.rel)).map(f => f.rel).sort();
    const projectWork = fileList.find(f => /^project\.work$/i.test(f.rel));

    let os = 'not found', warn = '';
    if (projectWork) {
      const info = parseProjectText(decodeLatin1(await projectWork.bytes()));
      os = info.osVersion || 'unreadable';
      if (!/OCTATRACK/i.test(info.projType)) {
        warn = 'project.work does not look like an Octatrack project file — generation may produce an unusable copy.';
      } else if (!OS_SUPPORTED.test(os)) {
        warn = `Project OS ${os} — slot writing verified for OS 1.40 A/B/C only; verify on device.`;
      }
    }

    setProject({ folder: normalized.folder, files: fileList.length, banks, os, warn, fileList });
    setReport(null);
  }, []);

  const clear = useCallback(() => { setProject(null); setReport(null); }, []);

  return { project, report, busy, setReport, setBusy, load, clear };
}
