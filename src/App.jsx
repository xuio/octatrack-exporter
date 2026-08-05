import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/header/Header.jsx';
import FilesStep from './components/steps/FilesStep.jsx';
import TempoStep from './components/steps/TempoStep.jsx';
import RegionsStep from './components/steps/RegionsStep.jsx';
import ResultsStep from './components/steps/ResultsStep.jsx';
import ExportStep from './components/steps/ExportStep.jsx';
import ProjectStep from './components/steps/ProjectStep.jsx';
import DropOverlay from './components/ui/DropOverlay.jsx';

import { usePrefs } from './state/usePrefs.js';
import { useStems, validateStems } from './state/useStems.js';
import { useRegions, useAnalysisBase, useTracks } from './state/useAnalysis.js';
import { useSliceEdits } from './state/useSliceEdits.js';
import { useTransport } from './state/useTransport.js';
import { useMixer } from './state/useMixer.js';
import { useFileDrop } from './state/useFileDrop.js';
import { useProjectFolder } from './state/useProjectFolder.js';
import { useDragResize } from './state/useDragResize.js';
import { useExports } from './state/useExports.js';
import { WaveformCache } from './waveform/WaveformCache.js';

import { isStemDrop } from './lib/index.js';
import { stemFileBase, stemsZipName, projectFolderName, sanitize } from './export/naming.js';

export default function App() {
  const [prefs, setPrefs] = usePrefs();
  const [step, setStep] = useState('files');
  const [bpm, setBpm] = useState('');
  const [bpmSource, setBpmSource] = useState('');
  const [abbrev, setAbbrev] = useState('');
  const [zipName, setZipName] = useState('');
  const [projectName, setProjectName] = useState('');

  const waveforms = useRef(new WaveformCache()).current;

  // ---------- material ----------
  const stemsApi = useStems({
    onLoaded: ({ tempo, abbrev: demoAbbrev }) => {
      if (tempo) { setBpm(tempo.bpm); setBpmSource(tempo.source); }
      if (demoAbbrev !== undefined) setAbbrev(demoAbbrev);
    },
  });
  const { stems, midi } = stemsApi;
  const mixer = useMixer(stems);
  const regions = useRegions({ midi, bpm, demoNames: stemsApi.demoNames.current });
  const analysis = useAnalysisBase();
  const edits = useSliceEdits();
  const { tracks, warnings } = useTracks({ base: analysis.base, stems, threshold: prefs.threshold, edits: edits.edits });
  const transport = useTransport({ stems, mixer: mixer.state, tracks, base: analysis.base, volume: prefs.volume ?? 0.85 });
  const projectFolder = useProjectFolder();
  const resize = useDragResize(setPrefs);

  // Loading a different set of stems invalidates everything derived from the
  // old one. Keyed on the ids rather than the array so renaming or reordering
  // — which the analysis survives — does not throw it away.
  const stemSetKey = stems.map(s => s.id).join(',');
  useEffect(() => {
    regions.reset();
    analysis.reset();
    edits.clearAll();
    setStep(current => (current === 'files' ? current : 'files'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemSetKey]);

  // ---------- intake ----------
  const dropTarget = step === 'files' ? 'files' : step === 'project' ? 'project' : null;
  const dragging = useFileDrop(dropTarget, (items) => {
    if (dropTarget === 'project') { projectFolder.load(items); return; }
    const usable = isStemDrop(items);
    if (!usable.length) {
      stemsApi.setError('Nothing usable in that drop — need .wav, .mid or a .zip/folder containing them.');
      return;
    }
    stemsApi.addFiles(usable.map(i => i.file).filter(Boolean));
  });

  // ---------- navigation ----------
  const stepEnabled = useCallback((id) => ({
    files: true,
    tempo: stems.length > 0 && !!midi,
    regions: !!regions.regions,
    results: !!analysis.base,
    export: !!analysis.base,
    project: !!analysis.base,
  })[id], [stems, midi, regions.regions, analysis.base]);

  const analyze = useCallback(async () => {
    const base = await analysis.run({ stems, regions: regions.regions, meta: regions.meta, bpm: parseFloat(bpm) });
    waveforms.reset(base.bounds);
    edits.clearAll();
    transport.setStartBar(1);
    setStep('results');
  }, [analysis, stems, regions, bpm, waveforms, edits, transport]);

  // ---------- naming ----------
  const names = useMemo(() => {
    const first = stems[0] || { name: 'DRUMS' };
    return {
      wav: `${stemFileBase(first, 0, abbrev)}.wav`,
      ot: `${stemFileBase(first, 0, abbrev)}.ot`,
      zip: `${stemsZipName(zipName, abbrev)}.zip`,
      project: projectFolderName(projectName, projectFolder.project?.folder),
    };
  }, [stems, abbrev, zipName, projectName, projectFolder.project]);

  const exports = useExports({
    stems, tracks, regions: analysis.base?.regs || [], bpm: parseFloat(bpm),
    abbrev, zipName, projectName, projectFolder,
  });

  const summary = [sanitize(abbrev), stems.length ? `${stems.length} stems` : '', bpm ? `${parseFloat(bpm)} BPM` : '']
    .filter(Boolean).join(' · ');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <DropOverlay visible={dragging} target={dropTarget} />

      <Header
        step={step}
        enabled={stepEnabled}
        summary={summary}
        theme={prefs.theme}
        onStep={setStep}
        onTheme={theme => setPrefs({ theme })}
        naming={{
          abbrev, zipName, projectName, previews: names,
          zipPlaceholder: stemsZipName('', abbrev),
          projectPlaceholder: projectFolderName('', projectFolder.project?.folder),
          onAbbrev: e => setAbbrev(e.target.value),
          onZipName: e => setZipName(e.target.value),
          onProjectName: e => setProjectName(e.target.value),
        }}
      />

      {step === 'files' && (
        <FilesStep
          stems={stems}
          midi={midi}
          error={stemsApi.error}
          reading={stemsApi.reading}
          demoLoading={stemsApi.demoLoading}
          dragging={dragging}
          canContinue={stems.length > 0 && !!midi}
          hint={!stems.length ? 'waiting for stems…'
            : !midi ? 'waiting for the arrangement MIDI…'
              : (stems.length < 5 || stems.length > 6) ? `${stems.length} stems (typically 5–6)` : ''}
          onFiles={files => stemsApi.addFiles(files)}
          onLoadDemo={stemsApi.loadDemo}
          onRemoveMidi={stemsApi.removeMidi}
          onRename={stemsApi.rename}
          onMove={stemsApi.move}
          onRemove={stemsApi.remove}
          onContinue={() => {
            const error = validateStems(stems, midi);
            if (error) stemsApi.setError(error);
            else { stemsApi.setError(''); setStep('tempo'); }
          }}
        />
      )}

      {step === 'tempo' && (
        <TempoStep
          bpm={bpm}
          bpmSource={bpmSource}
          error={regions.error}
          midi={midi}
          abbrev={abbrev}
          onBpm={setBpm}
          onAbbrev={setAbbrev}
          onConfirm={() => { if (regions.confirm()) setStep('regions'); }}
        />
      )}

      {step === 'regions' && regions.regions && (
        <RegionsStep
          regions={regions.regions}
          meta={regions.meta}
          analyzing={analysis.analyzing}
          progress={analysis.progress}
          hasAnalysis={!!analysis.base}
          onRename={regions.rename}
          onAnalyze={analyze}
        />
      )}

      {step === 'results' && analysis.base && (
        <ResultsStep
          base={analysis.base}
          stems={stems}
          mixer={mixer.state}
          tracks={tracks}
          warnings={warnings}
          edits={edits}
          transport={transport}
          prefs={prefs}
          setPrefs={setPrefs}
          waveforms={waveforms}
          onRenameStem={stemsApi.rename}
          onRenameRegion={(idx, name) => { regions.rename(idx, name); analysis.renameRegion(idx, name); }}
          onMute={mixer.toggleMute}
          onSolo={mixer.toggleSolo}
          onResize={resize.start}
          onExport={() => setStep('export')}
          onExportCsv={exports.downloadCsv}
          onPrint={exports.printSheet}
        />
      )}

      {step === 'export' && analysis.base && (
        <ExportStep
          stems={stems}
          tracks={tracks}
          abbrev={abbrev}
          zipName={zipName}
          zipNamePlaceholder={stemsZipName('', abbrev)}
          warnings={warnings.filter(w => /no slices|64/.test(w))}
          busy={exports.zipBusy}
          summary={exports.summary}
          onAbbrev={e => setAbbrev(e.target.value)}
          onZipName={e => setZipName(e.target.value)}
          onDownloadWav={exports.downloadWav}
          onDownloadOt={exports.downloadOt}
          onZip={exports.downloadStemsZip}
          onExportCsv={exports.downloadCsv}
          onPrint={exports.printSheet}
          onProject={() => setStep('project')}
        />
      )}

      {step === 'project' && analysis.base && (
        <ProjectStep
          project={projectFolder.project}
          dragging={dragging}
          stemCount={stems.length}
          regionCount={analysis.base.regs.length}
          folderName={projectName}
          folderPlaceholder={projectFolderName('', projectFolder.project?.folder)}
          busy={projectFolder.busy}
          report={projectFolder.report}
          onFiles={files => projectFolder.load(files.map(f => ({ path: f.webkitRelativePath || f.name, file: f })))}
          onFolderName={e => setProjectName(e.target.value)}
          onGenerate={exports.generateProject}
        />
      )}
    </div>
  );
}
