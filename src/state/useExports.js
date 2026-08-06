import { useCallback, useMemo, useState } from 'react';
import { makeZip, toCsv } from '../lib/index.js';
import { download, openHtml } from '../export/download.js';
import { stemEntries, stemChainBytes, otBytes } from '../export/stemFiles.js';
import { patternSheetHtml, patternCsvRows } from '../export/patternSheet.js';
import { buildProject, verifyEntries, verifyCountsText } from '../export/projectBuild.js';
import { decodeExport } from '../export/patternDecode.js';
import { pickDirectory, writeEntries, readEntriesBack } from '../export/dirWrite.js';
import { stemFileBase, stemsZipName, projectFolderName, sanitize } from '../export/naming.js';

/** Every "save something to disk" action, in one place. */
export function useExports({ stems, tracks, regions, bpm, abbrev, zipName, projectName, projectFolder }) {
  const [zipBusy, setZipBusy] = useState(false);

  const sheetHtml = useCallback(
    (withSetup) => patternSheetHtml({ stems, tracks, regions, bpm, abbrev, withSetup }),
    [stems, tracks, regions, bpm, abbrev],
  );

  const downloadStemsZip = useCallback(async () => {
    setZipBusy(true);
    await new Promise(r => setTimeout(r, 20));   // let the button repaint first
    download(`${stemsZipName(zipName, abbrev)}.zip`, makeZip(stemEntries({ stems, tracks, bpm, abbrev })));
    setZipBusy(false);
  }, [stems, tracks, bpm, abbrev, zipName]);

  const downloadWav = useCallback((stem, index) => {
    const track = tracks.get(stem.id);
    download(`${stemFileBase(stem, index, abbrev)}.wav`,
      new Blob([stemChainBytes(stem, track.slices, track.totalFrames)], { type: 'audio/wav' }));
  }, [tracks, abbrev]);

  const downloadOt = useCallback((stem, index) => {
    const track = tracks.get(stem.id);
    download(`${stemFileBase(stem, index, abbrev)}.ot`,
      new Blob([otBytes(bpm, track.totalFrames, track.slices)], { type: 'application/octet-stream' }));
  }, [tracks, abbrev, bpm]);

  const downloadCsv = useCallback(() => {
    download(`${sanitize(abbrev, 'OSSC')} patterns.csv`,
      new Blob([toCsv(patternCsvRows({ stems, tracks, regions }))], { type: 'text/csv' }));
  }, [stems, tracks, regions, abbrev]);

  const printSheet = useCallback(() => openHtml(sheetHtml(false)), [sheetHtml]);

  /**
   * Build the project copy once and hand back the two ways to deliver it. The
   * build is not written anywhere by itself: the caller holds this object and
   * drops it when anything upstream changes, so a zip and a folder write in the
   * same session are always the same bytes.
   */
  const generateProject = useCallback(async () => {
    const setReport = projectFolder.setReport;
    projectFolder.setBusy(true);
    setReport(null);
    await new Promise(r => setTimeout(r, 20));
    let build = null;
    try {
      const folder = projectFolderName(projectName, projectFolder.project.folder);
      const { entries, report, verify, verifyInputs } = await buildProject({
        project: projectFolder.project, stems, tracks, regions, bpm, abbrev, folder,
      });
      setReport(report);
      build = {
        folder, entries, verify,
        banks: decodeExport({ entries, folder, banks: verifyInputs.banks }),

        downloadZip: () => download(`${folder}.zip`, makeZip(entries)),

        /**
         * Write the entries into a directory the user picks — the CF card root,
         * or any parent — then read every file back off disk and re-run the same
         * readback pass on those bytes, because "written" and "written correctly"
         * are not the same claim.
         */
        writeToFolder: async () => {
          let root;
          try {
            root = await pickDirectory();
          } catch (err) {
            if (err.name === 'AbortError') return { status: 'cancelled' };
            if (err.name === 'NotAllowedError') {
              return { status: 'denied', message: 'Folder access was not granted — pick it again, or use the .zip.' };
            }
            return { status: 'error', message: err.message };
          }
          try {
            const written = await writeEntries(root, entries);
            const disk = await readEntriesBack(root, entries);
            const check = verifyEntries(disk, verifyInputs);
            const lines = check.problems.map(p => ({ warn: true, text: `On-disk check: ${p}` }));
            lines.unshift(check.ok
              ? { text: `Verified on disk: ${written} files written; ${verifyCountsText(check.counts)} and every checksum read back off the disk exactly as intended` }
              : { warn: true, text: `${written} files written, but reading them back off the disk found ${check.problems.length} mismatch(es) — see below before loading this on the device` });
            setReport(prev => [...(prev || []), ...lines]);
            return {
              status: 'ok', written, verify: check,
              banks: decodeExport({ entries: disk, folder, banks: verifyInputs.banks }),
            };
          } catch (err) {
            setReport(prev => [...(prev || []), { warn: true, text: `Folder write failed: ${err.message}` }]);
            return { status: 'error', message: err.message };
          }
        },
      };
    } catch (err) {
      setReport([{ warn: true, text: `Generation failed: ${err.message}` }]);
    }
    projectFolder.setBusy(false);
    return build;
  }, [projectFolder, projectName, stems, tracks, regions, bpm, abbrev]);

  const summary = useMemo(() => {
    let bytes = 0, files = 0;
    for (const stem of stems) {
      const track = tracks.get(stem.id);
      if (!track || !track.slices.length) continue;
      bytes += 44 + track.totalFrames * stem.bytesPerFrame + 832;
      files += 2;
    }
    return `${files} files · ${(bytes / 1048576).toFixed(1)} MB total`;
  }, [stems, tracks]);

  return { zipBusy, summary, downloadStemsZip, downloadWav, downloadOt, downloadCsv, printSheet, generateProject };
}
