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
import { useStems, validateStems, normalizeStemName } from './state/useStems.js';
import { useRegions, useAnalysisBase, useTracks } from './state/useAnalysis.js';
import { useHistory } from './state/useHistory.js';
import { useSliceEdits } from './state/useSliceEdits.js';
import { useTransport } from './state/useTransport.js';
import { useMixer } from './state/useMixer.js';
import { useFileDrop } from './state/useFileDrop.js';
import { useProjectFolder } from './state/useProjectFolder.js';
import { useDragResize } from './state/useDragResize.js';
import { useSession } from './state/useSession.js';
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
  const [regionNameHints, setRegionNameHints] = useState(null);
  const regions = useRegions({ midi, bpm, nameHints: regionNameHints ?? stemsApi.demoNames.current });
  const analysis = useAnalysisBase();
  const history = useHistory();
  const edits = useSliceEdits(history);
  const { tracks, warnings } = useTracks({ base: analysis.base, stems, threshold: prefs.threshold, edits: edits.edits });
  const transport = useTransport({ stems, mixer: mixer.state, tracks, base: analysis.base, volume: prefs.volume ?? 0.85 });
  const projectFolder = useProjectFolder();
  const resize = useDragResize(setPrefs);

  // The bits of the editor's view the session remembers. Zoom, scroll and the
  // selection live inside the results step, which reports them up here; the
  // loop and the start bar are the transport's, which App already owns.
  const [editorView, setEditorView] = useState(null);
  const [pendingView, setPendingView] = useState(null);
  const sessionView = useMemo(() => (editorView ? {
    ppm: editorView.ppm,
    scrollX: editorView.scrollX,
    // By index, never by id — ids are per-load counters (see useSession).
    selected: editorView.selected
      ? { stemIndex: stems.findIndex(s => s.id === editorView.selected.stemId), regionIdx: editorView.selected.regionIdx }
      : null,
    loop: transport.loopRegionIdx != null ? { regionIdx: transport.loopRegionIdx } : transport.loopBars,
    startBar: transport.startBar,
  } : null), [editorView, stems, transport.loopRegionIdx, transport.loopBars, transport.startBar]);

  const session = useSession({
    stems, midi, bpm, abbrev, regions: regions.regions, edits: edits.edits, view: sessionView,
  });

  // Renames go on the same undo stack as clip edits. Both live in state this
  // component does not own, which is why history records how to reverse them
  // rather than snapshotting a document.
  const renameStem = useCallback((id, name) => {
    const before = stems.find(s => s.id === id)?.name;
    const after = normalizeStemName(name);
    stemsApi.rename(id, after);
    if (before !== undefined && before !== after) {
      history.record('rename track', () => stemsApi.rename(id, before), () => stemsApi.rename(id, after));
    }
  }, [stems, stemsApi, history]);

  /**
   * Dragging a track to another slot. Only the array order changes — that is
   * read at export time for the Octatrack slot numbers, and nothing derived
   * from the stems is order-sensitive, so the analysis and the edits stay put.
   */
  const reorderStems = useCallback((from, to) => {
    if (from === to) return;
    stemsApi.reorder(from, to);
    history.record('reorder tracks', () => stemsApi.reorder(to, from), () => stemsApi.reorder(from, to));
  }, [stemsApi, history]);

  const setRegionName = useCallback((idx, name) => {
    regions.rename(idx, name);
    analysis.renameRegion(idx, name);
  }, [regions, analysis]);

  const renameRegion = useCallback((idx, name) => {
    const before = (analysis.base?.regs || regions.regions || []).find(r => r.idx === idx)?.name ?? '';
    setRegionName(idx, name);
    if (before !== name) {
      history.record('rename section', () => setRegionName(idx, before), () => setRegionName(idx, name));
    }
  }, [analysis.base, regions.regions, setRegionName, history]);

  /** Put back the tempo, names and slice edits saved for exactly these files. */
  const restoreSession = useCallback(() => {
    const snapshot = session.restore();
    if (!snapshot) return;
    if (snapshot.bpm) { setBpm(snapshot.bpm); setBpmSource('restored from your previous session'); }
    if (snapshot.abbrev) setAbbrev(snapshot.abbrev);
    snapshot.names.forEach((name, i) => { if (name && stems[i]) stemsApi.rename(stems[i].id, name); });
    if (snapshot.regionNames) setRegionNameHints(snapshot.regionNames);
    // Parked rather than applied: zoom, scroll and the selection only exist
    // once the analysis does, so the results step puts them back when it mounts.
    setPendingView(snapshot.view);
    edits.replace(snapshot.edits);
  }, [session, stems, stemsApi, edits]);

  /** Wipe everything and go back to an empty first screen. */
  const clearAll = useCallback(() => {
    transport.stop();
    stemsApi.clear();
    regions.reset();
    analysis.reset();
    edits.clearAll();
    history.clear();
    mixer.clear();
    projectFolder.clear();
    session.clear();
    setRegionNameHints(null);
    setEditorView(null); setPendingView(null);
    setBpm(''); setBpmSource(''); setAbbrev(''); setZipName(''); setProjectName('');
    setStep('files');
  }, [transport, stemsApi, regions, analysis, edits, history, mixer, projectFolder, session]);

  // Loading a different set of stems invalidates everything derived from the
  // old one. Keyed on the *set* of ids — sorted, not in array order — so that
  // renaming or reordering, both of which the analysis survives, does not throw
  // it away. (Joining them in array order made a rail drag look like a new
  // stem set and silently reset the analysis, edits, history and the step.)
  const stemSetKey = stems.map(s => s.id).sort((a, b) => a - b).join(',');
  useEffect(() => {
    regions.reset();
    analysis.reset();
    edits.clearAll();
    history.clear();
    setStep(current => (current === 'files' ? current : 'files'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemSetKey]);

  // ---------- intake ----------
  const dropTarget = step === 'files' ? 'files' : step === 'project' ? 'project' : null;
  const dragging = useFileDrop(dropTarget, (items) => {
    if (dropTarget === 'project') { projectFolder.load(items); return; }
    const usable = isStemDrop(items);
    if (!usable.length) {
      stemsApi.setError('Nothing usable in that drop — need .wav/.aif/.flac stems, a .mid, or a .zip/folder containing them.');
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
    // Edits are keyed by stem and section, so they survive a re-analysis on
    // purpose — a restored session, or a tempo correction, keeps its trims.
    // Loading a different set of stems is what clears them (see below).
    transport.setStartBar(1);
    setStep('results');
  }, [analysis, stems, regions, bpm, waveforms, transport]);

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
        hasWork={stems.length > 0 || !!analysis.base}
        onStep={setStep}
        onTheme={theme => setPrefs({ theme })}
        onClearAll={clearAll}
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
          session={session.offer}
          onRestoreSession={restoreSession}
          onDismissSession={session.dismiss}
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
          history={history}
          transport={transport}
          prefs={prefs}
          setPrefs={setPrefs}
          waveforms={waveforms}
          pendingView={pendingView}
          onViewState={setEditorView}
          onViewRestored={() => setPendingView(null)}
          onRenameStem={renameStem}
          onRenameRegion={renameRegion}
          onReorderStem={reorderStems}
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
