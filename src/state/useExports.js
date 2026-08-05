import { useCallback, useMemo, useState } from 'react';
import { makeZip, toCsv } from '../lib/index.js';
import { download, openHtml } from '../export/download.js';
import { stemEntries, stemChainBytes, otBytes } from '../export/stemFiles.js';
import { patternSheetHtml, patternCsvRows } from '../export/patternSheet.js';
import { buildProject } from '../export/projectBuild.js';
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

  const generateProject = useCallback(async () => {
    projectFolder.setBusy(true);
    projectFolder.setReport(null);
    await new Promise(r => setTimeout(r, 20));
    try {
      const folder = projectFolderName(projectName, projectFolder.project.folder);
      const { entries, report } = await buildProject({
        project: projectFolder.project, stems, tracks, regions, bpm, abbrev, folder,
      });
      download(`${folder}.zip`, makeZip(entries));
      projectFolder.setReport(report);
    } catch (err) {
      projectFolder.setReport([{ warn: true, text: `Generation failed: ${err.message}` }]);
    }
    projectFolder.setBusy(false);
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
