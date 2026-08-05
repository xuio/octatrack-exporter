import React from 'react';
import * as core from './lib/index.js';
import Header from './components/Header.jsx';
import FilesStep from './components/FilesStep.jsx';
import TempoStep from './components/TempoStep.jsx';
import RegionsStep from './components/RegionsStep.jsx';
import ResultsStep from './components/ResultsStep.jsx';
import ExportStep from './components/ExportStep.jsx';
import ProjectStep from './components/ProjectStep.jsx';

const SR = 44100;
const PREF_KEY = 'ossc.prefs.v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
export const THEMES = [
  { id: 'nocturne', label: 'Nocturne', note: 'blurple on graphite' },
  { id: 'cobalt', label: 'Cobalt', note: 'deep blue console' },
  { id: 'ember', label: 'Ember', note: 'warm amber' },
  { id: 'moss', label: 'Moss', note: 'tape-machine green' },
  { id: 'orchid', label: 'Orchid', note: 'magenta on charcoal' },
  { id: 'graphite', label: 'Graphite', note: 'near-neutral' },
  { id: 'paper', label: 'Paper', note: 'light' },
];

export default class App extends React.Component {
  static defaultProps = { defaultThresholdDb: -60, waveStyle: 'spectral', showScopes: true };

  constructor(props) {
    super(props);
    const p = loadPrefs();
    this.state = {
      step: 'files', stems: [], midi: null, filesError: '', demoLoading: false,
      bpm: '', bpmSource: '', bpmError: '', abbrev: '', threshold: p.threshold ?? props.defaultThresholdDb ?? -60, thDraft: null, bpmDraft: null,
      regions: null, regionsMeta: null, analyzing: false, progress: '',
      analysis: null, view: 'tl', ppm: 16, sel: null, playing: false, loopRegionIdx: null,
      waveStyle: p.waveStyle ?? props.waveStyle ?? 'spectral', scopeMode: p.scopeMode ?? (props.showScopes ? 'scope' : 'off'),
      startMeasure: 1, vol: 0.85, showWarn: false, zipBusy: false, project: null, projBusy: false, projReport: null,
      edits: {}, past: [], future: [], follow: p.follow ?? true, railW: p.railW ?? 232, laneH: p.laneH ?? 50,
      scrollX: 0, viewW: 0, zipName: '', projName: '', theme: p.theme || 'nocturne',
    };
    document.documentElement.setAttribute('data-theme', this.state.theme);
  }

  core = core;
  ids = 1; sources = []; buffers = {}; gains = {}; blobCache = {}; analysers = {}; meterEls = {}; scopeEls = {}; envs = {};
  bandCache = new Map(); pathCache = new Map();

  componentDidMount() {
    this.meterRaf = requestAnimationFrame(this.meterTick);
    this.keyH = (e) => {
      if (this.state.step !== 'results' || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
      else if (e.code === 'Space') { e.preventDefault(); this.state.playing ? this.stop() : this.play(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.sel) { e.preventDefault(); this.deleteSelected(); }
    };
    window.addEventListener('keydown', this.keyH);
    // Drops are handled window-wide: dropping next to the dashed box (or on any
    // other part of the step) works, and a stray drop never makes the browser
    // navigate away from the app.
    this._dragDepth = 0;
    this.dragOverH = e => { if (this.dropStep()) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    this.dragEnterH = e => { if (!this.dropStep()) return; e.preventDefault(); if (++this._dragDepth === 1) this.setState({ dragging: true }); };
    this.dragLeaveH = e => { if (!this.dropStep()) return; if (--this._dragDepth <= 0) { this._dragDepth = 0; this.setState({ dragging: false }); } };
    this.dropH = e => {
      const step = this.dropStep(); if (!step) return;
      e.preventDefault();
      const cap = core.captureDrop(e.dataTransfer); // must read before any await
      this._dragDepth = 0; this.setState({ dragging: false });
      this.handleDrop(step, cap);
    };
    window.addEventListener('dragover', this.dragOverH);
    window.addEventListener('dragenter', this.dragEnterH);
    window.addEventListener('dragleave', this.dragLeaveH);
    window.addEventListener('drop', this.dropH);
  }
  componentWillUnmount() {
    window.removeEventListener('keydown', this.keyH);
    window.removeEventListener('dragover', this.dragOverH);
    window.removeEventListener('dragenter', this.dragEnterH);
    window.removeEventListener('dragleave', this.dragLeaveH);
    window.removeEventListener('drop', this.dropH);
    cancelAnimationFrame(this.meterRaf); this.stop();
  }
  dropStep() { const s = this.state.step; return s === 'files' || s === 'project' ? s : null; }
  async handleDrop(step, cap) {
    const items = await core.filesFromDataTransfer(cap);
    if (!items.length) return;
    if (step === 'project') return this.loadProject(items);
    const stems = core.isStemDrop(items);
    if (!stems.length) { this.setState({ filesError: 'Nothing usable in that drop — need .wav, .mid or a .zip/folder containing them.' }); return; }
    this.handleFiles(stems.map(i => i.file).filter(Boolean));
  }
  componentDidUpdate(_, prev) {
    if (prev.theme !== this.state.theme) { document.documentElement.setAttribute('data-theme', this.state.theme); this.cols = null; }
    const k = ['follow', 'railW', 'laneH', 'waveStyle', 'scopeMode', 'threshold', 'theme'];
    if (k.some(x => prev[x] !== this.state[x])) {
      const o = {}; k.forEach(x => o[x] = this.state[x]);
      try { localStorage.setItem(PREF_KEY, JSON.stringify(o)); } catch {}
    }
    this.syncOverview();
  }

  // ---------- canvases ----------
  sizeCanvas(el) {
    const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return null;
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
    const c = el.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, w, h };
  }
  analyserFor(id) {
    const ctx = this.ctx();
    if (!this.analysers[id]) {
      const an = ctx.createAnalyser();
      an.fftSize = 2048; an.smoothingTimeConstant = 0.72; an.minDecibels = -95; an.maxDecibels = -10;
      this.analysers[id] = an;
    }
    return this.analysers[id];
  }
  meterTick = () => {
    this.meterRaf = requestAnimationFrame(this.meterTick);
    if (this.state.step !== 'results') return;
    if (!this.cols) {
      const cs = getComputedStyle(document.documentElement);
      const g = (n, f) => (cs.getPropertyValue(n) || '').trim() || f;
      this.cols = { a5: g('--color-accent-500', '#968ae0'), a4: g('--color-accent-400', '#b5abfc'), a3: g('--color-accent-300', '#d2cefd'), a2: g('--color-accent-200', '#e7e5fe'), a8: g('--color-accent-800', '#423a6a'), n1: g('--color-neutral-100', '#f3f5fe'), n8: g('--color-neutral-800', '#3f424d'), n9: g('--color-neutral-900', '#292b31') };
    }
    const lvl = (an, key) => {
      let pk = 0;
      if (an) {
        const N = an.fftSize;
        if (!this.tdBuf || this.tdBuf.length !== N) this.tdBuf = new Float32Array(N);
        an.getFloatTimeDomainData(this.tdBuf);
        for (let i = 0; i < N; i++) { const v = Math.abs(this.tdBuf[i]); if (v > pk) pk = v; }
      }
      const e = this.envs[key] || (this.envs[key] = { env: 0, hold: 0, ht: 0, clip: false });
      e.env = Math.max(pk, e.env * 0.86);
      if (pk >= core.CLIP_AMP) e.clip = true;
      if (pk >= e.hold) { e.hold = pk; e.ht = 40; } else if (--e.ht <= 0) e.hold *= 0.94;
      return e;
    };
    for (const stem of this.state.stems) {
      const an = this.analysers[stem.id], e = lvl(an, stem.id);
      if (this.meterEls[stem.id]) this.drawMeter(this.meterEls[stem.id], e, false);
      const sm = this.state.scopeMode;
      if (sm && sm !== 'off' && this.scopeEls[stem.id]) (sm === 'fft' ? this.drawFft : this.drawScope).call(this, this.scopeEls[stem.id], an, stem.id);
    }
    if (this.masterMeterEl) this.drawMeter(this.masterMeterEl, lvl(this.masterAn, 'master'), true);
  };
  // dBFS-scaled meter: accent below −3 dBFS, red above it, a hard red 0 dBFS
  // line at the very top, tick marks down the scale and a latching clip flag.
  drawMeter(el, e, horiz) {
    const S = this.sizeCanvas(el); if (!S) return;
    const { c, w, h } = S;
    c.clearRect(0, 0, w, h);
    const v = core.meterPos(e.env), hp = core.meterPos(e.hold), red = core.dbPos(core.RED_DB);
    const RED = '#e0483c';
    const len = (p) => (horiz ? w : h) * p;
    // scale ticks
    c.fillStyle = 'color-mix(in srgb, #ffffff 18%, transparent)';
    for (const db of core.METER_TICKS) {
      const p = len(core.dbPos(db));
      if (horiz) c.fillRect(p, h - 2, 1, 2); else c.fillRect(0, h - p, 2, 1);
    }
    // level: accent part, then the red zone
    const drawSeg = (from, to, col) => {
      if (to <= from) return;
      c.fillStyle = col;
      if (horiz) c.fillRect(len(from), 0, len(to) - len(from), h - 2);
      else c.fillRect(2, h - len(to), w - 2, len(to) - len(from));
    };
    drawSeg(0, Math.min(v, red), this.cols.a5);
    drawSeg(red, v, RED);
    // peak hold
    if (hp > 0.01) {
      c.fillStyle = hp >= red ? RED : this.cols.n1;
      if (horiz) c.fillRect(Math.min(w - 1.5, len(hp)), 0, 1.5, h - 2);
      else c.fillRect(2, Math.max(0, h - len(hp) - 1.5), w - 2, 1.5);
    }
    // 0 dBFS line — solid when the meter has clipped
    c.fillStyle = e.clip ? RED : 'color-mix(in srgb, #e0483c 45%, transparent)';
    if (horiz) c.fillRect(w - 1.5, 0, 1.5, h); else c.fillRect(0, 0, w, 1.5);
  }
  // Oscilloscope: zero-crossing triggered (stable image) + min/max per pixel column.
  drawScope(el, an) {
    const S = this.sizeCanvas(el); if (!S) return;
    const { c, w, h } = S;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = this.cols.n8; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h / 2 + 0.5); c.lineTo(w, h / 2 + 0.5); c.stroke();
    if (!an) return;
    const N = an.fftSize;
    if (!this.tdBuf || this.tdBuf.length !== N) this.tdBuf = new Float32Array(N);
    an.getFloatTimeDomainData(this.tdBuf);
    const buf = this.tdBuf, half = N >> 1;
    let t0 = 0;
    for (let i = 1; i < half; i++) if (buf[i - 1] <= 0 && buf[i] > 0) { t0 = i; break; }
    const span = Math.max(2, Math.min(half, N - t0));
    const amp = h / 2 - 1;
    c.strokeStyle = this.cols.a4; c.lineWidth = 1; c.beginPath();
    for (let x = 0; x < w; x++) {
      const s0 = t0 + Math.floor(x * span / w), s1 = Math.max(s0 + 1, t0 + Math.floor((x + 1) * span / w));
      let mn = 1, mx = -1;
      for (let i = s0; i < s1 && i < N; i++) { const v = buf[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx < mn) continue;
      const y0 = h / 2 - mx * amp, y1 = h / 2 - mn * amp;
      c.moveTo(x + 0.5, y0); c.lineTo(x + 0.5, Math.max(y1, y0 + 0.7));
    }
    c.stroke();
  }
  // Spectrum: log-spaced bands from real dB values, with decaying peak caps.
  drawFft(el, an, key) {
    const S = this.sizeCanvas(el); if (!S) return;
    const { c, w, h } = S;
    c.clearRect(0, 0, w, h);
    if (!an || !this._ctx) return;
    const bins = an.frequencyBinCount;
    if (!this.fftF || this.fftF.length !== bins) this.fftF = new Float32Array(bins);
    an.getFloatFrequencyData(this.fftF);
    const nyq = this._ctx.sampleRate / 2, f0 = 30, f1 = Math.min(16000, nyq);
    const n = Math.max(10, Math.min(56, Math.floor(w / 2.5))), bw = w / n;
    const pk = this.envs['pk:' + key] && this.envs['pk:' + key].length === n ? this.envs['pk:' + key] : (this.envs['pk:' + key] = new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const fa = f0 * Math.pow(f1 / f0, i / n), fb = f0 * Math.pow(f1 / f0, (i + 1) / n);
      const b0 = Math.max(1, Math.floor(fa / nyq * bins)), b1 = Math.max(b0 + 1, Math.ceil(fb / nyq * bins));
      let m = -Infinity;
      for (let b = b0; b < b1 && b < bins; b++) if (this.fftF[b] > m) m = this.fftF[b];
      const v = Math.max(0, Math.min(1, (m + 92) / 78)); // −92…−14 dBFS → 0…1
      pk[i] = v >= pk[i] ? v : pk[i] * 0.93;
      const bh = v * (h - 2);
      if (bh > 0.4) {
        c.fillStyle = v > 0.78 ? this.cols.a2 : this.cols.a5;
        c.fillRect(i * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
      }
      if (pk[i] > 0.02) { c.fillStyle = this.cols.a3; c.fillRect(i * bw + 0.5, Math.max(0, h - pk[i] * (h - 2) - 1), Math.max(1, bw - 1), 1); }
    }
  }

  // ---------- files ----------
  async expandFiles(fileList, errs) {
    const out = [];
    for (const f of fileList) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const entries = core.audioEntries(await core.readZip(await f.arrayBuffer()));
          if (!entries.length) errs.push(f.name + ': no WAV or MIDI files inside');
          for (const e of entries) {
            const data = e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength);
            out.push({ name: e.name.split('/').pop(), arrayBuffer: () => Promise.resolve(data) });
          }
        } catch (err) { errs.push(f.name + ': ' + err.message); }
      } else out.push(f);
    }
    return out;
  }
  // `replace` starts from an empty set instead of the current one. It is passed
  // explicitly rather than read back from state, because a caller that just
  // called setState({stems: []}) would otherwise still see the old list here.
  async handleFiles(fileList, replace = false) {
    const errs = []; let st = replace ? [] : [...this.state.stems], midi = replace ? null : this.state.midi;
    this.setState({ reading: 'archive' });
    const files = await this.expandFiles(fileList, errs);
    for (const f of files) {
      try {
        this.setState({ reading: f.name });
        await new Promise(r => setTimeout(r, 20));
        const buf = await f.arrayBuffer();
        if (/\.(mid|midi)$/i.test(f.name)) midi = core.parseMidi(buf, f.name);
        else if (/\.wav$/i.test(f.name)) {
          const p = core.parseWav(buf, f.name);
          st.push({ id: this.ids++, name: f.name.replace(/\.wav$/i, '').replace(/[_-]?\d+$/, '').toUpperCase().slice(0, 20) || 'STEM', muted: false, solo: false, ...p });
        } else errs.push(f.name + ': unsupported type (need .wav, .mid or .zip)');
      } catch (err) { errs.push(err.message); }
    }
    let bpm = replace ? '' : this.state.bpm, bpmSource = replace ? '' : this.state.bpmSource;
    if (midi && !bpm) {
      const cand = (midi.fileName.match(/\d{2,3}(?:\.\d+)?/g) || []).map(Number).find(n => n >= 50 && n <= 250);
      if (cand) { bpm = String(cand); bpmSource = 'detected from file name “' + midi.fileName + '” — confirm before processing'; }
      else if (midi.bpm) { bpm = String(midi.bpm); bpmSource = 'from MIDI tempo event — confirm before processing'; }
      else { bpm = '120'; bpmSource = 'no tempo found — enter the session BPM'; }
    }
    this.setState({ stems: st, midi, filesError: errs.join('\n'), bpm, bpmSource, analysis: null, regions: null, reading: '', edits: {} });
  }
  validateFiles() {
    const { stems, midi } = this.state;
    if (!stems.length || !midi) return 'Need stems and a MIDI file.';
    const f0 = stems[0].frames, bad = stems.filter(s => s.frames !== f0);
    if (bad.length) return 'Stem lengths differ — all stems must start at bar 1 and share one length:\n' + stems.map(s => s.fileName + ' — ' + s.frames.toLocaleString() + ' samples').join('\n');
    if (midi.noteCount < 2) return 'MIDI has fewer than 2 notes — need one per section start plus one at the song end.';
    return '';
  }
  onLoadDemo = (id) => {
    this.setState({ demoLoading: true });
    setTimeout(async () => {
      const demo = core.makeDemo(id);
      this.demoNames = demo.regionNames;
      const files = demo.files.map(f => ({ name: f.name, arrayBuffer: () => Promise.resolve(f.data) }));
      files.push({ name: demo.midi.name, arrayBuffer: () => Promise.resolve(demo.midi.data) });
      this.setState({ abbrev: demo.abbrev, analysis: null, regions: null, edits: {}, past: [], future: [], sel: null });
      await this.handleFiles(files, true);
      this.setState({ demoLoading: false });
    }, 30);
  };
  applyThreshold(v) {
    if (!isFinite(v)) { this.setState({ thDraft: null }); return; }
    this.setState({ thDraft: null });
    this.queueThreshold(v);
  }
  // coalesce rapid changes (slider drag, typing, button mashing) into one re-trim per frame
  queueThreshold(v) {
    this._thT = Math.max(-120, Math.min(0, Math.round(v)));
    if (this._thQ) return;
    this._thQ = true;
    requestAnimationFrame(() => {
      this._thQ = false;
      this.setState({ threshold: this._thT }, () => this.rebuildSlices());
    });
  }

  // ---------- analysis ----------
  confirmTempo = () => {
    const bpm = parseFloat(this.state.bpm);
    if (!(bpm >= 30 && bpm <= 300)) { this.setState({ bpmError: 'BPM must be between 30 and 300.' }); return; }
    const r = core.regionsFromTicks(this.state.midi.ticks, this.state.midi.ppq);
    if (r.error) { this.setState({ bpmError: r.error }); return; }
    if (this.demoNames) r.regions.forEach((rg, i) => rg.name = this.demoNames[i] || '');
    this.setState({ bpmError: '', regions: r.regions, regionsMeta: { snapped: r.snapped, totalMeasures: r.totalMeasures }, analysis: null, step: 'regions' });
  };
  analyze = async () => {
    const bpm = parseFloat(this.state.bpm), { stems, regions, threshold } = this.state;
    this.setState({ analyzing: true, progress: 'Computing measure grid…' });
    await new Promise(r => setTimeout(r, 20));
    let total = this.state.regionsMeta.totalMeasures;
    const warnings = [];
    let bounds = core.boundariesFor(bpm, total);
    const frames = stems[0].frames;
    if (bounds[total] > frames) {
      let n = total; while (n > 0 && bounds[n] > frames) n--;
      warnings.push('MIDI song end (bar ' + (total + 1) + ') lies beyond the audio — analysis clamped to bar ' + (n + 1) + '. Check the BPM.');
      total = n; bounds = core.boundariesFor(bpm, total);
    } else if (frames - bounds[total] > core.spmFor(bpm)) {
      warnings.push('Audio continues ' + Math.floor((frames - bounds[total]) / core.spmFor(bpm)) + ' bars past the MIDI song end — the excess is ignored.');
    }
    const regs = regions.filter(r => r.start < total).map(r => r.end > total ? { ...r, end: total, len: total - r.start, scale: core.scaleFor(total - r.start) } : r);
    const thLin = core.dbToLin(threshold), stemData = [];
    for (let si = 0; si < stems.length; si++) {
      const s = stems[si];
      this.setState({ progress: 'Analyzing ' + s.name + ' (' + (si + 1) + '/' + stems.length + ')…' });
      await new Promise(r => setTimeout(r, 20));
      stemData.push({ id: s.id, peaks: core.measurePeaks(s.chL, s.chR, bounds) });
    }
    this.fillSlices(stemData, regs, bounds, thLin, warnings);
    if (regs.some(r => !r.scale.ok)) warnings.push('Regions over 32 bars cannot be represented as a single pattern — split them in the arrangement MIDI.');
    if ((this.state.regionsMeta.snapped || 0) > 0) warnings.push(this.state.regionsMeta.snapped + ' MIDI note(s) were not exactly on a bar line — snapped to the nearest measure.');
    if (regs.length > 32) warnings.push(regs.length + ' regions — patterns roll on past Bank 3 (' + core.bankPattern(regs.length).bp + ' last).');
    const fitPpm = Math.max(5, Math.min(30, Math.floor((window.innerWidth - 200) / total)));
    this.bandCache.clear(); this.pathCache.clear();
    this.setState({ analyzing: false, analysis: { bounds, total, regs, stemData, warnings, v: Date.now() }, step: 'results', ppm: fitPpm, sel: null, startMeasure: 1, loopRegionIdx: null });
    this.blobCache = {}; this.buffers = {};
  };
  fillSlices(stemData, regs, bounds, thLin, warnings) {
    const { stems, edits } = this.state;
    stemData.forEach(sd => {
      const s = stems.find(x => x.id === sd.id);
      const r = core.buildStemSlices(sd.peaks, regs, bounds, thLin, edits[sd.id] || {});
      sd.slices = r.slices; sd.ghosts = r.ghosts; sd.totalFrames = r.totalFrames;
      if (!r.slices.length) warnings.push(s.name + ' has no slices at this threshold — no files will be exported for it.');
      if (r.slices.length > 64) warnings.push(s.name + ': ' + r.slices.length + ' slices exceeds the Octatrack limit of 64 — the .ot file keeps the first 64.');
    });
  }
  rebuildSlices() {
    const a = this.state.analysis; if (!a) return;
    const warnings = a.warnings.filter(w => !/no slices at this threshold|exceeds the Octatrack limit/.test(w));
    this.fillSlices(a.stemData, a.regs, a.bounds, core.dbToLin(this.state.threshold), warnings);
    this.blobCache = {};
    this.setState({ analysis: { ...a, warnings, v: Date.now() } });
    this.queueReschedule();
  }
  // Edits made during playback take effect immediately: re-cue what is playing
  // from the current position. Coalesced so a drag doesn't thrash the graph.
  queueReschedule() {
    if (!this.state.playing || this._resQ) return;
    this._resQ = setTimeout(() => { this._resQ = null; this.rescheduleNow(); }, 90);
  }
  rescheduleNow() {
    if (!this.state.playing || !this._ctx) return;
    const ctx = this._ctx, tSwitch = ctx.currentTime + 0.05;
    for (const s of this.sources) { try { s.stop(tSwitch); } catch (e) {} }
    this.sources = []; clearTimeout(this._pump);
    if (this.loopInfo) {
      this.nextIter = Math.max(0, Math.floor((tSwitch - this.loopT0) * SR / this.loopInfo.len));
      this.pumpLoop();
    } else {
      const pos = this.start0 + (tSwitch - this.t0) * SR;
      this.start0 = pos; this.t0 = tSwitch;
      this.scheduleLinear(pos, tSwitch);
    }
  }

  // ---------- slice edits (with undo history) ----------
  applyEdits(edits, record = true) {
    this.setState(s => record ? { edits, past: [...s.past, s.edits].slice(-200), future: [] } : { edits },
      () => this.rebuildSlices());
  }
  setEdit(stemId, regionIdx, patch, record = true) {
    const edits = { ...this.state.edits }, forStem = { ...(edits[stemId] || {}) };
    const next = { ...(forStem[regionIdx] || {}), ...patch };
    if (next.del == null && next.a == null) delete forStem[regionIdx]; else forStem[regionIdx] = next;
    edits[stemId] = forStem;
    this.applyEdits(edits, record);
  }
  undo = () => {
    const { past, edits, future } = this.state;
    if (!past.length) return;
    this.setState({ edits: past[past.length - 1], past: past.slice(0, -1), future: [edits, ...future].slice(0, 200) },
      () => this.rebuildSlices());
  };
  redo = () => {
    const { future, edits, past } = this.state;
    if (!future.length) return;
    this.setState({ edits: future[0], future: future.slice(1), past: [...past, edits].slice(-200) },
      () => this.rebuildSlices());
  };
  editCount() { return Object.values(this.state.edits).reduce((n, m) => n + Object.keys(m).length, 0); }
  deleteSelected = () => { const s = this.state.sel; if (s) this.setEdit(s.stemId, s.regionIdx, { del: true, a: null, b: null }); };
  resetEdits = () => this.applyEdits({});
  startTrim = (stemId, regionIdx, side, e) => {
    e.stopPropagation(); e.preventDefault();
    const a = this.state.analysis, sd = a.stemData.find(x => x.id === stemId);
    const sl = sd && sd.slices.find(x => x.region.idx === regionIdx); if (!sl) return;
    // one history entry per drag, not per pixel
    const before = this.state.edits;
    const lim = core.trimLimits(sd.slices, regionIdx, a.regs);
    const st = { x0: e.clientX, a0: sl.aM, b0: sl.bM };
    let lastA = sl.aM, lastB = sl.bM;
    const move = (ev) => {
      const d = Math.round((ev.clientX - st.x0) / this.state.ppm);
      let a2 = st.a0, b2 = st.b0;
      if (side === 'l') a2 = Math.max(lim.minA, Math.min(st.b0, st.a0 + d));
      else b2 = Math.min(lim.maxB, Math.max(st.a0, st.b0 + d));
      if (a2 !== lastA || b2 !== lastB) { lastA = a2; lastB = b2; this.setEdit(stemId, regionIdx, { a: a2, b: b2, del: null }, false); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (lastA !== st.a0 || lastB !== st.b0) this.setState(s => ({ past: [...s.past, before].slice(-200), future: [] }));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ---------- playback ----------
  ctx() {
    if (!this._ctx) {
      this._ctx = new AudioContext({ sampleRate: SR });
      this.master = this._ctx.createGain(); this.master.gain.value = this.state.vol; this.master.connect(this._ctx.destination);
      this.masterAn = this._ctx.createAnalyser(); this.masterAn.fftSize = 2048; this.master.connect(this.masterAn);
    }
    return this._ctx;
  }
  bufferFor(stem) {
    if (!this.buffers[stem.id]) {
      const b = this.ctx().createBuffer(2, stem.frames, SR);
      b.copyToChannel(stem.chL, 0); b.copyToChannel(stem.chR, 1);
      this.buffers[stem.id] = b;
    }
    return this.buffers[stem.id];
  }
  audible(stem) { const anySolo = this.state.stems.some(s => s.solo); return anySolo ? stem.solo : !stem.muted; }
  ensureBus() {
    const ctx = this.ctx();
    if (!this.bus) {
      const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(this.master); this.bus = bus;
      this.gains = {};
    }
    for (const stem of this.state.stems) {
      if (!this.gains[stem.id]) { const g = ctx.createGain(); g.gain.value = this.audible(stem) ? 1 : 0; g.connect(this.bus); g.connect(this.analyserFor(stem.id)); this.gains[stem.id] = g; }
    }
  }
  // one-shot linear playback of every slice from `fromSample`, starting at `when`
  scheduleLinear(fromSample, when) {
    const a = this.state.analysis, ctx = this.ctx();
    for (const sd of a.stemData) {
      const stem = this.state.stems.find(s => s.id === sd.id), g = stem && this.gains[stem.id]; if (!g) continue;
      const buf = this.bufferFor(stem);
      for (const sl of sd.slices) {
        if (sl.end <= fromSample) continue;
        const skip = Math.max(0, fromSample - sl.start);
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g);
        src.onended = () => { const i = this.sources.indexOf(src); if (i >= 0) this.sources.splice(i, 1); };
        src.start(when + Math.max(0, sl.start - fromSample) / SR, (sl.start + skip) / SR, (sl.frames - skip) / SR);
        this.sources.push(src);
      }
    }
  }
  scheduleLoopIter(k) {
    const a = this.state.analysis, ctx = this.ctx(), { ls, le, len } = this.loopInfo, t0 = this.loopT0, now = ctx.currentTime;
    for (const sd of a.stemData) {
      const stem = this.state.stems.find(s => s.id === sd.id), g = stem && this.gains[stem.id]; if (!g) continue;
      const buf = this.bufferFor(stem);
      for (const sl of sd.slices) {
        const s = Math.max(sl.start, ls), e = Math.min(sl.end, le); if (e <= s) continue;
        let when = t0 + (k * len + (s - ls)) / SR, off = s / SR, dur = (e - s) / SR;
        if (when + dur <= now) continue;              // entirely in the past (mid-loop start)
        if (when < now) { const skip = now - when; off += skip; dur -= skip; when = now; }
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g);
        src.onended = () => { const i = this.sources.indexOf(src); if (i >= 0) this.sources.splice(i, 1); };
        src.start(when, off, dur);
        this.sources.push(src);
      }
    }
  }
  posSamples() {
    const a = this.state.analysis; if (!a) return 0;
    if (!this.state.playing || !this._ctx) return a.bounds[Math.max(0, this.state.startMeasure - 1)];
    if (this.loopInfo) {
      const { ls, len } = this.loopInfo, tl = this._ctx.currentTime - this.loopT0;
      return tl >= 0 ? ls + ((tl * SR) % len) : this.start0 + Math.max(0, this._ctx.currentTime - this.t0) * SR;
    }
    return this.start0 + Math.max(0, this._ctx.currentTime - this.t0) * SR;
  }
  startTicker() {
    cancelAnimationFrame(this.raf);
    const a = this.state.analysis, spm = core.spmFor(parseFloat(this.state.bpm)), endS = a.bounds[a.total];
    const tick = () => {
      if (!this.state.playing) return;
      const pos = this.posSamples();
      if (!this.loopInfo && pos >= endS) { this.stop(); return; }
      this.paintPlayhead(pos / spm);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  paintPlayhead(mf) {
    const a = this.state.analysis; if (!a) return;
    const px = mf * this.state.ppm;
    if (this.ph) this.ph.style.transform = 'translateX(' + px + 'px)';
    if (this.ovPh) this.ovPh.style.left = (mf / a.total * 100) + '%';
    if (this.pos) this.pos.textContent = String(Math.floor(mf) + 1).padStart(3, '0') + '.' + (Math.floor((mf % 1) * 4) + 1);
    if (this.state.follow && this.sc && this.state.playing) {
      const vw = this.sc.clientWidth, left = this.sc.scrollLeft;
      if (px < left + vw * 0.06 || px > left + vw * 0.84) {
        this.autoScroll = true;
        this.sc.scrollLeft = Math.max(0, px - vw * 0.25);
      }
    }
  }
  play = () => {
    const a = this.state.analysis; if (!a) return;
    this.stopSources(); const ctx = this.ctx(); ctx.resume();
    this.ensureBus();
    const t0 = ctx.currentTime + 0.12; this.t0 = t0;
    const lr = this.state.loopRegionIdx != null ? a.regs.find(r => r.idx === this.state.loopRegionIdx) : null;
    if (lr) {
      const ls = a.bounds[lr.start], le = a.bounds[lr.end];
      this.loopInfo = { ls, le, len: le - ls }; this.start0 = ls; this.loopT0 = t0; this.nextIter = 0;
    } else {
      this.loopInfo = null;
      const start0 = a.bounds[this.state.startMeasure - 1]; this.start0 = start0;
      this.scheduleLinear(start0, t0);
    }
    this.setState({ playing: true }, () => { this.pumpLoop(); this.startTicker(); });
  };
  pumpLoop() {
    if (!this.loopInfo || !this._ctx) return;
    const { len } = this.loopInfo, tl = this._ctx.currentTime - this.loopT0;
    while (this.nextIter * len / SR < tl + 1.2) { this.scheduleLoopIter(this.nextIter); this.nextIter++; }
    clearTimeout(this._pump);
    this._pump = setTimeout(() => this.pumpLoop(), 200);
  }
  stopSources(fade) {
    if (this._ctx && this.sources.length) {
      const srcs = this.sources; this.sources = [];
      if (fade) { const t = this._ctx.currentTime; srcs.forEach(s => { try { s.stop(t + 0.02); } catch (e) {} }); }
      else srcs.forEach(s => { try { s.stop(); } catch (e) {} });
    }
    clearTimeout(this._pump);
  }
  stop = () => {
    this.stopSources(true);
    this.loopInfo = null;
    cancelAnimationFrame(this.raf);
    if (this.state.playing) this.setState({ playing: false });
    const spm = core.spmFor(parseFloat(this.state.bpm) || 120);
    const a = this.state.analysis;
    if (a) this.paintPlayhead(a.bounds[Math.max(0, this.state.startMeasure - 1)] / spm);
  };
  // Switch from looping to linear playback without a gap, continuing where we are.
  releaseLoop = () => {
    if (!this.state.playing || !this.loopInfo) { this.setState({ loopRegionIdx: null }); return; }
    const a = this.state.analysis, ctx = this.ctx(), tSwitch = ctx.currentTime + 0.06;
    const { ls, len } = this.loopInfo;
    const pos = ls + (((tSwitch - this.loopT0) * SR) % len);
    for (const s of this.sources) { try { s.stop(tSwitch); } catch (e) {} }
    this.sources = []; clearTimeout(this._pump);
    this.loopInfo = null; this.start0 = pos; this.t0 = tSwitch;
    this.scheduleLinear(pos, tSwitch);
    const spm = core.spmFor(parseFloat(this.state.bpm));
    this.setState({ loopRegionIdx: null, startMeasure: Math.min(a.total, Math.floor(pos / spm) + 1) });
  };
  seekTo = (sample, keepPlaying) => {
    const a = this.state.analysis; if (!a) return;
    const spm = core.spmFor(parseFloat(this.state.bpm));
    const bar = Math.max(0, Math.min(a.total - 1, Math.floor(sample / spm)));
    if (keepPlaying && this.state.playing) {
      const ctx = this.ctx(), tSwitch = ctx.currentTime + 0.06;
      for (const s of this.sources) { try { s.stop(tSwitch); } catch (e) {} }
      this.sources = []; clearTimeout(this._pump);
      if (this.loopInfo && sample >= this.loopInfo.ls && sample < this.loopInfo.le) {
        this.loopT0 = tSwitch - (sample - this.loopInfo.ls) / SR; this.nextIter = 0;
        this.setState({ startMeasure: bar + 1 }, () => this.pumpLoop());
      } else {
        this.loopInfo = null; this.start0 = sample; this.t0 = tSwitch;
        this.scheduleLinear(sample, tSwitch);
        this.setState({ startMeasure: bar + 1, loopRegionIdx: null });
      }
    } else {
      this.setState({ startMeasure: bar + 1 }, () => this.paintPlayhead(sample / spm));
    }
  };
  audition = (sel) => {
    const a = this.state.analysis, sd = a.stemData.find(x => x.id === sel.stemId);
    const sl = sd && sd.slices.find(x => x.region.idx === sel.regionIdx); if (!sl) return;
    this.stop(); const ctx = this.ctx(); ctx.resume();
    this.ensureBus();
    const stem = this.state.stems.find(s => s.id === sel.stemId);
    const src = ctx.createBufferSource(); src.buffer = this.bufferFor(stem); src.connect(this.gains[stem.id]);
    src.start(ctx.currentTime + 0.05, sl.start / SR, sl.frames / SR);
    this.sources.push(src);
  };
  updateGains() { if (!this._ctx) return; const t = this._ctx.currentTime; for (const s of this.state.stems) if (this.gains[s.id]) this.gains[s.id].gain.setTargetAtTime(this.audible(s) ? 1 : 0, t, 0.015); }

  // ---------- timeline interaction ----------
  barFromClientX(clientX, el) {
    const a = this.state.analysis, rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(a.total - 0.001, (clientX - rect.left) / this.state.ppm));
  }
  scrub(getBar, e) {
    const a = this.state.analysis; if (!a) return;
    e.preventDefault();
    const spm = core.spmFor(parseFloat(this.state.bpm));
    const wasPlaying = this.state.playing;
    if (wasPlaying) { this.stopSources(true); cancelAnimationFrame(this.raf); this.loopInfo = null; }
    let bar = getBar(e);
    this.paintPlayhead(bar);
    const move = (ev) => { bar = getBar(ev); this.paintPlayhead(bar); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const m = Math.max(0, Math.min(a.total - 1, Math.floor(bar)));
      if (wasPlaying) {
        this.setState({ playing: false, startMeasure: m + 1, loopRegionIdx: null }, () => this.play());
      } else {
        this.setState({ startMeasure: m + 1, loopRegionIdx: null }, () => this.paintPlayhead(a.bounds[m] / spm));
      }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  onScroll = () => {
    if (this._scrollQ) return;
    this._scrollQ = true;
    requestAnimationFrame(() => {
      this._scrollQ = false;
      if (!this.sc) return;
      const sx = this.sc.scrollLeft, vw = this.sc.clientWidth;
      this.syncOverview();
      if (Math.abs(sx - this.state.scrollX) > 24 || vw !== this.state.viewW) this.setState({ scrollX: sx, viewW: vw });
    });
  };
  syncOverview() {
    const a = this.state.analysis;
    if (!a || !this.sc || !this.ovVp) return;
    const w = a.total * this.state.ppm || 1;
    this.ovVp.style.left = Math.max(0, Math.min(100, this.sc.scrollLeft / w * 100)) + '%';
    this.ovVp.style.width = Math.max(1.5, Math.min(100, this.sc.clientWidth / w * 100)) + '%';
  }
  zoomAt(clientX, factor) {
    const a = this.state.analysis; if (!a || !this.sc) return;
    const ppm = this.state.ppm, next = Math.max(2, Math.min(160, ppm * factor));
    if (next === ppm) return;
    const rect = this.sc.getBoundingClientRect();
    const cx = Math.max(0, Math.min(rect.width, (clientX ?? rect.left + rect.width / 2) - rect.left));
    const barAt = (this.sc.scrollLeft + cx) / ppm;
    this.setState({ ppm: next }, () => {
      if (!this.sc) return;
      this.autoScroll = true;
      this.sc.scrollLeft = Math.max(0, barAt * next - cx);
      this.syncOverview();
      this.setState({ scrollX: this.sc.scrollLeft, viewW: this.sc.clientWidth });
    });
  }
  // Trackpad pinch arrives as wheel+ctrlKey; horizontal wheel means the user is
  // driving the view, so stop following the playhead.
  attachScroll = (el) => {
    if (this.sc === el) return;
    if (this.sc && this._wheelH) this.sc.removeEventListener('wheel', this._wheelH);
    this.sc = el;
    if (!el) return;
    this._wheelH = (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoomAt(e.clientX, Math.exp(-e.deltaY * 0.01)); return; }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && this.state.follow && this.state.playing) this.setState({ follow: false });
    };
    el.addEventListener('wheel', this._wheelH, { passive: false });
    this.syncOverview();
    if (!this.state.viewW) this.setState({ viewW: el.clientWidth });
  };

  // ---------- waveform cache ----------
  bandsFor(stem, sl, buckets) {
    const k = stem.id + ':' + sl.aM + ':' + sl.bM + ':' + buckets;
    let b = this.bandCache.get(k);
    if (!b) { if (this.bandCache.size > 400) this.bandCache.clear(); b = core.waveBands(stem.chL, stem.chR, sl.start, sl.end, buckets); this.bandCache.set(k, b); }
    return b;
  }
  pathsFor(stem, sl, buckets, style) {
    const k = stem.id + ':' + sl.aM + ':' + sl.bM + ':' + buckets + ':' + style;
    let p = this.pathCache.get(k);
    if (!p) { if (this.pathCache.size > 400) this.pathCache.clear(); p = core.wavePaths(this.bandsFor(stem, sl, buckets), style, 32); this.pathCache.set(k, p); }
    return p;
  }

  // ---------- export ----------
  download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  fileBase(stem, i) { const ab = ((this.state.abbrev || 'Song').trim() || 'Song').replace(/[\\/:*?"<>|]/g, ''); return (i + 1) + ' ' + stem.name.replace(/[\\/:*?"<>|]/g, '') + ' ' + ab; }
  safeName(s, fallback) { const v = (s || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\.zip$/i, ''); return v || fallback; }
  stemsZipName() { return this.safeName(this.state.zipName, ((this.state.abbrev || 'OSSC').trim() || 'OSSC') + ' stems'); }
  projFolderName() { return this.safeName(this.state.projName, (this.state.project ? this.state.project.folder : 'PROJECT') + ' OSSC'); }
  sheetHtml(withSetup) {
    const a = this.state.analysis, S = this.state;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const title = esc((S.abbrev || 'OSSC').trim() || 'OSSC') + ' — Octatrack pattern map · ' + parseFloat(S.bpm) + ' BPM';
    let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title><style>body{font:12px/1.5 system-ui,sans-serif;color:#1c1e2a;margin:28px}h1{font-size:16px;font-weight:600;margin:0 0 14px}h2{font-size:13px;font-weight:600;margin:20px 0 8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #c8ccd8;padding:5px 8px;text-align:left;font-size:11px;vertical-align:top}th{background:#eef0f6}td small,p small{color:#666}@media print{body{margin:8mm}}</style></head><body><h1>' + title + '</h1>';
    if (withSetup) {
      h += '<h2>Static sample slots (written into project.work)</h2><table><tr><th>Slot</th><th>Track</th><th>File</th><th>Slices</th></tr>';
      S.stems.forEach((stem, i) => { const sd = a.stemData.find(x => x.id === stem.id); if (!sd || !sd.slices.length) return; h += '<tr><td>' + (i + 1) + '</td><td>T' + (i + 1) + ' ' + esc(stem.name) + '</td><td>' + esc(this.fileBase(stem, i)) + '.wav</td><td>' + Math.min(64, sd.slices.length) + '</td></tr>'; });
      h += '</table><p><small>Trigs, slice p-locks and per-track scales (master length INF, master scale 1x) are pre-programmed into the bank files. Trigs carry no sample locks — each track plays its default sample. One-time device step: on each used track in the part, assign a STATIC machine and set its default sample (TRK DEFAULT) to the slot in the table above. If a track shows no slices, reload the slot&#39;s sample once — the .ot file beside each WAV carries the slice grid. The table below is a reference (and the manual recipe for any bank that failed verification).</small></p><h2>Patterns (Bank 2 onward — Bank 1 untouched)</h2>';
    }
    h += '<table><tr><th></th>';
    for (const r of a.regs) h += '<th>' + esc(String(r.idx).padStart(2, '0') + ' ' + (r.name || '')) + '<small>' + esc(r.bp + ' · ' + r.len + ' bars · ' + r.scale.label + ' · ' + r.scale.master) + '</small></th>';
    h += '</tr>';
    for (const stem of S.stems) {
      const sd = a.stemData.find(x => x.id === stem.id); if (!sd) continue;
      h += '<tr><th>' + esc(stem.name) + '</th>';
      for (const r of a.regs) {
        const sl = sd.slices.find(x => x.region.idx === r.idx);
        h += '<td>' + (sl ? 'Slice ' + sl.num + (sl.trig !== 1 ? '<small style="display:block">song bar ' + (sl.aM + 1) + ' = pattern bar ' + (sl.aM - r.start + 1) + ' · trig step ' + sl.trig + '</small>' : '') : '—') + '</td>';
      }
      h += '</tr>';
    }
    h += '</table><p style="color:#666;font-size:10px;margin-top:12px">Generated by OSSC — patterns start at Bank 2; Bank 1 reserved for your intro.</p></body></html>';
    return h;
  }
  printTable = () => { if (this.state.analysis) window.open(URL.createObjectURL(new Blob([this.sheetHtml(false)], { type: 'text/html' })), '_blank'); };
  generateProject = async () => {
    const S = this.state, a = S.analysis, p = S.project;
    if (!a || !p || !p.fileList) return;
    this.setState({ projBusy: true, projReport: null });
    await new Promise(r => setTimeout(r, 20));
    try {
      const entries = [], rep = [], folder = this.projFolderName(), slotEntries = [], markerEntries = [];
      let sawMarkers = false;
      S.stems.forEach((stem, i) => {
        const sd = a.stemData.find(x => x.id === stem.id);
        if (!sd || !sd.slices.length) { rep.push({ warn: 1, text: stem.name + ' has no slices — Static slot ' + (i + 1) + ' left empty' }); return; }
        const base = this.fileBase(stem, i);
        entries.push({ name: folder + '/' + base + '.wav', data: this.stemWavBytes(sd, stem) });
        entries.push({ name: folder + '/' + base + '.ot', data: core.writeOt(parseFloat(S.bpm), sd.totalFrames, sd.slices.map(s => ({ start: s.outStart, end: s.outEnd }))) });
        slotEntries.push({ slot: i + 1, path: base + '.wav', bpm: parseFloat(S.bpm) });
        if (i < 128) markerEntries.push({ slot0: i, totalFrames: sd.totalFrames, slices: sd.slices.slice(0, 64).map(s => ({ start: s.outStart, end: s.outEnd })) });
      });
      const bankJobs = {};
      if (S.stems.length > 8) rep.push({ warn: 1, text: 'Octatrack has 8 audio tracks — stems 9+ are not programmed' });
      for (const r of a.regs) {
        if (!r.scale.ok) { rep.push({ warn: 1, text: 'Region ' + r.idx + ' > 32 bars — pattern ' + r.bp + ' not programmed' }); continue; }
        // a slice trimmed across a section boundary is trigged from the pattern
        // that owns its first bar, which may not be its own section
        const tracks = [];
        S.stems.slice(0, 8).forEach((stem, i) => {
          const sd2 = a.stemData.find(x => x.id === stem.id);
          const trigs = (sd2 ? sd2.slices : []).filter(sl => sl.trigRegionIdx === r.idx && sl.num <= 64)
            .map(sl => ({ step: sl.trig, slice: sl.num - 1 }));
          if (trigs.length) tracks.push({ trackIdx: i, trigs });
        });
        const bankNo = 2 + Math.floor((r.idx - 1) / 16);
        (bankJobs[bankNo] = bankJobs[bankNo] || []).push({ patternIdx: (r.idx - 1) % 16, LEN: r.scale.LEN, mult: r.scale.mult, tracks });
      }
      let banks = 0, slotsOk = false, banksWritten = 0, trigsTotal = 0;
      const banksNeeded = new Set(Object.keys(bankJobs).map(Number));
      for (const f of p.fileList) {
        const rel = f.rel;
        const buf = await f.bytes();
        const bm = rel.match(/^bank(\d+)\.work$/i);
        if (/^project\.work$/i.test(rel)) {
          const res = core.writeStaticSlots(core.decodeLatin1(buf), slotEntries, parseFloat(S.bpm));
          if (res.error) { rep.push({ warn: 1, text: res.error + ' — project.work copied unchanged' }); entries.push({ name: folder + '/' + rel, data: buf }); }
          else {
            if (res.removed) rep.push({ warn: 1, text: res.removed + ' existing Static assignment(s) in slots 1–' + slotEntries.length + ' replaced' });
            entries.push({ name: folder + '/' + rel, data: core.encodeLatin1(res.text) }); slotsOk = true;
          }
        } else if (/^markers\.work$/i.test(rel)) {
          sawMarkers = true;
          const res = core.writeMarkersSlots(buf, markerEntries);
          if (res.error) {
            rep.push({ warn: 1, text: 'markers.work: ' + res.error + ' — copied unchanged; slices won\'t appear until each slot\'s sample is reloaded once on the device (the .ot beside each WAV carries them)' });
            entries.push({ name: folder + '/' + rel, data: buf });
          } else {
            entries.push({ name: folder + '/' + rel, data: res.bytes });
            rep.push({ text: 'markers.work: trim + 64-slice grid written for ' + res.slotsWritten + ' Static slots, checksum updated — slices appear on the device immediately' });
          }
        } else if (bm && bankJobs[parseInt(bm[1], 10)]) {
          const res = core.writeBankPatterns(buf, bankJobs[parseInt(bm[1], 10)], parseFloat(S.bpm));
          if (res.error) {
            rep.push({ warn: 1, text: rel + ': ' + res.error + ' — copied unchanged; program its patterns from the sheet' });
            entries.push({ name: folder + '/' + rel, data: buf });
          } else {
            let same = true;
            for (let i = res.partsStart; i < buf.length - 2; i++) if (buf[i] !== res.bytes[i]) { same = false; break; }
            entries.push({ name: folder + '/' + rel, data: same ? res.bytes : buf });
            if (!same) rep.push({ warn: 1, text: rel + ': internal safety check tripped (parts region would have changed) — copied unchanged' });
            else {
              banksWritten++; trigsTotal += res.trigsWritten; banksNeeded.delete(parseInt(bm[1], 10));
              rep.push({ text: rel + ': ' + res.patternsWritten + ' patterns written — trigs + slice p-locks (samples via TRK DEFAULT, no sample locks) + per-track scales, master length INF · structure verified against this file (pattern ' + res.psize + ' B · track section ' + res.attSize + ' B) · parts/scenes byte-identical · checksum updated' });
            }
          }
          banks++;
        } else {
          entries.push({ name: folder + '/' + rel, data: buf });
          if (/^bank\d+\.(work|strd)$/i.test(rel)) banks++;
        }
      }
      if (!sawMarkers) rep.push({ warn: 1, text: 'markers.work not found in the project folder — slices won\'t appear until each slot\'s sample is reloaded once on the device' });
      banksNeeded.forEach(n => { if (!p.fileList.some(f => new RegExp('^bank' + String(n).padStart(2, '0') + '\\.work$', 'i').test(f.rel))) rep.push({ warn: 1, text: 'bank' + String(n).padStart(2, '0') + '.work not found — its regions were not programmed' }); });
      entries.push({ name: 'PATTERNS.html', data: new TextEncoder().encode(this.sheetHtml(true)) });
      rep.unshift({ text: 'PATTERNS.html reference sheet added (verification aid + manual fallback)' });
      rep.unshift({ text: (banksWritten ? banksWritten + ' bank(s) pattern-programmed with ' + trigsTotal + ' trigs; ' : '') + 'all other bank files copied byte-identical — parts and scenes untouched in every bank' });
      if (slotsOk) rep.unshift({ text: slotEntries.length + ' Static sample slots written into project.work (timestretch off, ' + parseFloat(S.bpm) + ' BPM, trig quantize direct)' });
      rep.unshift({ text: slotEntries.length * 2 + ' audio + .ot files added inside the project folder (no set-level AUDIO pool)' });
      this.download(folder + '.zip', core.makeZip(entries));
      this.setState({ projBusy: false, projReport: rep });
    } catch (err) { this.setState({ projBusy: false, projReport: [{ warn: 1, text: 'Generation failed: ' + err.message }] }); }
  };
  stemWavBytes(sd, stem) {
    const bpf = stem.bytesPerFrame, out = new Uint8Array(sd.totalFrames * bpf); let o = 0;
    for (const sl of sd.slices) { out.set(stem.pcm.subarray(sl.start * bpf, sl.end * bpf), o); o += sl.frames * bpf; }
    return core.encodeWav(out, stem.bits);
  }
  buildWav(sd, stem) {
    const key = 'w' + stem.id + this.state.analysis.v;
    if (!this.blobCache[key]) this.blobCache[key] = new Blob([this.stemWavBytes(sd, stem)], { type: 'audio/wav' });
    return this.blobCache[key];
  }
  buildOt(sd) { return new Blob([core.writeOt(parseFloat(this.state.bpm), sd.totalFrames, sd.slices.map(s => ({ start: s.outStart, end: s.outEnd })))], { type: 'application/octet-stream' }); }
  exportZip = async () => {
    this.setState({ zipBusy: true }); await new Promise(r => setTimeout(r, 20));
    const a = this.state.analysis, entries = [];
    this.state.stems.forEach((stem, i) => {
      const sd = a.stemData.find(x => x.id === stem.id); if (!sd || !sd.slices.length) return;
      const base = this.fileBase(stem, i);
      entries.push({ name: base + '.wav', data: this.stemWavBytes(sd, stem) });
      entries.push({ name: base + '.ot', data: core.writeOt(parseFloat(this.state.bpm), sd.totalFrames, sd.slices.map(s => ({ start: s.outStart, end: s.outEnd }))) });
    });
    this.download(this.stemsZipName() + '.zip', core.makeZip(entries));
    this.setState({ zipBusy: false });
  };
  exportCsv = () => {
    const a = this.state.analysis, rows = [];
    rows.push(['', ...a.regs.map(r => String(r.idx).padStart(2, '0') + (r.name ? ' ' + r.name : ''))]);
    rows.push(['Pattern', ...a.regs.map(r => r.bp)]);
    rows.push(['Length (bars)', ...a.regs.map(r => r.len)]);
    rows.push(['Scale', ...a.regs.map(r => r.scale.label)]);
    rows.push(['Master', ...a.regs.map(r => r.scale.master)]);
    for (const stem of this.state.stems) {
      const sd = a.stemData.find(x => x.id === stem.id);
      rows.push([stem.name, ...a.regs.map(r => {
        const sl = sd.slices.find(s => s.region.idx === r.idx);
        return sl ? 'Slice ' + sl.num + (sl.trig !== 1 ? ' · song bar ' + (sl.aM + 1) + ' = pattern bar ' + (sl.aM - r.start + 1) + ' · trig step ' + sl.trig : '') : '';
      })]);
    }
    this.download(((this.state.abbrev || 'OSSC').trim()) + ' patterns.csv', new Blob([core.toCsv(rows)], { type: 'text/csv' }));
  };

  // ---------- project ----------
  // Accepts a picked folder, a dropped folder, or a .zip of either.
  async loadProject(items) {
    let flat = [];
    for (const it of items) {
      if (/\.zip$/i.test(it.path)) {
        try {
          const entries = await core.readZip(await it.file.arrayBuffer());
          for (const e of entries) flat.push({ path: e.name, data: e.data });
        } catch (err) { this.setState({ project: null, projReport: [{ warn: 1, text: it.path + ': ' + err.message }] }); return; }
      } else flat.push(it);
    }
    const norm = core.normalizeProject(flat);
    if (!norm) {
      this.setState({ project: { folder: '—', files: flat.length, banks: [], os: 'not found', warn: 'No project.work found — is this an Octatrack project folder (or a zip of one)?', fileList: [] }, projReport: null });
      return;
    }
    const fileList = norm.files.map(f => ({ rel: f.rel, bytes: async () => f.data ? f.data : new Uint8Array(await f.file.arrayBuffer()) }));
    const banks = fileList.filter(f => /^bank\d+\.(work|strd)$/i.test(f.rel)).map(f => f.rel).sort();
    const pw = fileList.find(f => /^project\.work$/i.test(f.rel));
    let os = 'not found', warn = '';
    if (pw) {
      const pi = core.parseProjectText(core.decodeLatin1(await pw.bytes()));
      os = pi.osVersion || 'unreadable';
      if (!/OCTATRACK/i.test(pi.projType)) warn = 'project.work does not look like an Octatrack project file — generation may produce an unusable copy.';
      else if (!/^1\.40[ABC]$/.test(os)) warn = 'Project OS ' + os + ' — slot writing verified for OS 1.40 A/B/C only; verify on device.';
    }
    this.setState({ project: { folder: norm.folder, files: fileList.length, banks, os, warn, fileList }, projName: '', projReport: null });
  }
  onProjectInput = async (e) => {
    const files = [...e.target.files];
    if (files.length) await this.loadProject(files.map(f => ({ path: f.webkitRelativePath || f.name, file: f })));
    e.target.value = '';
  };
  onProjectDrop = async (e) => {
    e.preventDefault();
    this.setState({ projDropping: false });
    const items = await core.filesFromDataTransfer(e.dataTransfer);
    if (items.length) await this.loadProject(items);
  };

  // ---------- resizing ----------
  startResize = (axis, e) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, w0 = this.state.railW, h0 = this.state.laneH;
    const move = (ev) => {
      if (axis === 'rail') this.setState({ railW: Math.max(110, Math.min(460, w0 + ev.clientX - x0)) });
      else this.setState({ laneH: Math.max(28, Math.min(220, h0 + ev.clientY - y0)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; };
    document.body.style.cursor = axis === 'rail' ? 'col-resize' : 'ns-resize';
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ---------- view model ----------
  buildVals() {
    const S = this.state, set = (p) => this.setState(p);
    const bpm = parseFloat(S.bpm) || 0, spm = bpm ? core.spmFor(bpm) : 0;
    const steps = [['files', '1 Files', true], ['tempo', '2 Tempo', S.stems.length && S.midi], ['regions', '3 Regions', S.regions], ['results', '4 Results', S.analysis], ['export', '5 Export', S.analysis], ['project', '6 Project', S.analysis]];
    const vals = {
      metaLabel: S.abbrev || S.midi ? [(S.abbrev || '').trim(), S.stems.length ? S.stems.length + ' stems' : '', bpm ? bpm + ' BPM' : ''].filter(Boolean).join(' · ') : '',
      stepsVm: steps.map(([id, label, en]) => ({ label, cls: S.step === id ? 'on' : '', disabled: !en, onClick: () => en && set({ step: id }) })),
      isFiles: S.step === 'files', isTempo: S.step === 'tempo', isRegions: S.step === 'regions', isResults: S.step === 'results', isExport: S.step === 'export', isProject: S.step === 'project',
      theme: S.theme,
      themes: THEMES.map(t => ({ ...t, on: S.theme === t.id, onClick: () => set({ theme: t.id }) })),
    };
    // files
    // window-level handlers do the real work; these keep the box highlighted
    vals.onDragOver = e => e.preventDefault();
    vals.onDragLeave = e => e.preventDefault();
    vals.onDrop = e => e.preventDefault();
    vals.dropping = !!S.dragging;
    vals.dragging = !!S.dragging;
    vals.fileInputRef = el => this.fi = el;
    vals.onPickFiles = () => this.fi && this.fi.click();
    vals.onFileInput = e => { this.handleFiles([...e.target.files]); e.target.value = ''; };
    vals.demoLoading = S.demoLoading;
    vals.demoLead = S.demoLoading ? 'Synthesizing demo song…' : 'No files handy? Load a demo:';
    vals.demosVm = core.DEMO_LIST.map(d => ({ label: d.label + ' · ' + d.bpm, onClick: () => this.onLoadDemo(d.id) }));
    vals.isReading = !!S.reading; vals.readingLabel = 'Reading ' + (S.reading || '') + '…';

    vals.hasFilesError = !!S.filesError; vals.filesError = S.filesError;
    vals.hasMidi = !!S.midi;
    if (S.midi) { vals.midiName = S.midi.fileName; vals.midiSummary = S.midi.noteCount + ' notes · ' + S.midi.ppq + ' ppq' + (S.midi.bpm ? ' · tempo event ' + S.midi.bpm + ' BPM' : ' · no tempo event') + ' → ' + Math.max(0, S.midi.noteCount - 1) + ' regions'; }
    vals.onRemoveMidi = () => set({ midi: null, regions: null, analysis: null });
    vals.hasStems = S.stems.length > 0; vals.noStems = !S.stems.length;
    vals.stemCountLabel = S.stems.length ? '· ' + S.stems.length + ' loaded' : '';
    vals.stemsVm = S.stems.map((s, i) => ({
      num: i + 1, name: s.name, fileName: s.fileName,
      props: (s.frames / SR / 60 | 0) + ':' + String((s.frames / SR % 60) | 0).padStart(2, '0') + ' · ' + s.bits + '-bit · ' + s.frames.toLocaleString() + ' smp',
      hasWarn: s.warnings.length > 0, warnText: s.warnings.join('; '),
      first: i === 0, last: i === S.stems.length - 1,
      onName: e => { const st = [...S.stems]; st[i] = { ...st[i], name: e.target.value.toUpperCase() }; set({ stems: st }); },
      onUp: () => { const st = [...S.stems]; [st[i - 1], st[i]] = [st[i], st[i - 1]]; set({ stems: st }); },
      onDown: () => { const st = [...S.stems]; [st[i + 1], st[i]] = [st[i], st[i + 1]]; set({ stems: st }); },
      onRemove: () => set({ stems: S.stems.filter(x => x.id !== s.id), analysis: null }),
    }));
    vals.cantContinueFiles = !(S.stems.length && S.midi);
    vals.filesHint = !S.stems.length ? 'waiting for stems…' : !S.midi ? 'waiting for the arrangement MIDI…' : (S.stems.length < 5 || S.stems.length > 6) ? S.stems.length + ' stems (typically 5–6)' : '';
    vals.onContinueFiles = () => { const err = this.validateFiles(); if (err) set({ filesError: err }); else set({ filesError: '', step: 'tempo' }); };
    // tempo
    vals.bpmStr = S.bpmDraft != null ? S.bpmDraft : S.bpm;
    vals.onBpm = e => set({ bpmDraft: e.target.value });
    vals.onBpmCommit = e => { const v = e.target.value.trim(); if (v && isFinite(parseFloat(v)) && v !== S.bpm) set({ bpm: v, bpmDraft: null, analysis: null, regions: null }); else set({ bpmDraft: null }); };
    vals.onBpmKey = e => { if (e.key === 'Enter') e.target.blur(); };
    vals.bpmSource = S.bpmSource; vals.hasBpmError = !!S.bpmError; vals.bpmError = S.bpmError;
    vals.spmLabel = spm ? spm.toFixed(2) : '—';
    vals.songLenLabel = S.midi && spm ? (() => { const tm = Math.round(S.midi.ticks[S.midi.ticks.length - 1] / (S.midi.ppq * 4)); const sec = tm * spm / SR; return tm + ' bars · ' + (sec / 60 | 0) + ':' + String(Math.round(sec % 60)).padStart(2, '0'); })() : '—';
    vals.regionCountLabel = S.midi ? String(Math.max(0, S.midi.noteCount - 1)) : '—';
    vals.abbrev = S.abbrev; vals.onAbbrev = e => set({ abbrev: e.target.value });
    vals.onConfirmTempo = this.confirmTempo;
    // regions
    if (S.regions) {
      vals.regionsVm = S.regions.map((r, i) => ({
        num: String(r.idx).padStart(2, '0'), name: r.name, ph: 'Region ' + r.idx, bp: r.bp,
        startBar: r.start + 1, len: r.len, scale: r.scale.label, master: r.scale.master, tooLong: !r.scale.ok,
        onName: e => { const rs = [...S.regions]; rs[i] = { ...rs[i], name: e.target.value }; set({ regions: rs }); },
      }));
      const notices = [];
      if (S.regionsMeta.snapped) notices.push({ text: S.regionsMeta.snapped + ' note(s) snapped to the nearest bar line' });
      if (S.regions.length > 32) notices.push({ text: S.regions.length + ' regions — numbering rolls into further banks' });
      vals.regionNotices = notices; vals.hasRegionNotices = notices.length > 0;
    }
    vals.onAnalyze = this.analyze; vals.analyzing = S.analyzing; vals.progress = S.progress;
    vals.analyzeLabel = S.analyzing ? 'Analyzing…' : (S.analysis ? 'Re-analyze stems' : 'Analyze stems →');
    // results
    const a = S.analysis;
    if (a) {
      const ppm = S.ppm;
      vals.tlWidth = Math.ceil(a.total * ppm) + 2;
      vals.laneH = S.laneH; vals.railW = S.railW;
      vals.playing = S.playing; vals.onPlay = this.play; vals.onStop = this.stop;
      vals.playCls = S.playing ? 'on' : '';
      vals.onToStart = () => { this.stop(); set({ startMeasure: 1 }); if (this.sc) this.sc.scrollLeft = 0; };
      vals.onZoomFit = () => { const w = (this.sc ? this.sc.clientWidth : window.innerWidth - 200) - 10; set({ ppm: Math.max(2, Math.min(30, Math.floor(w / a.total))) }); };
      vals.onDeselect = () => S.sel && set({ sel: null });
      vals.regionLines = a.regs.map(r => ({ left: r.start * ppm }));
      vals.onPrint = this.printTable;
      vals.posRef = el => this.pos = el;
      vals.playheadRef = el => this.ph = el;
      vals.scrollRef = this.attachScroll;
      vals.onScroll = this.onScroll;
      vals.posLabel = String(S.startMeasure).padStart(3, '0') + '.1';
      vals.playheadPx = (S.startMeasure - 1) * ppm;
      vals.startMeasure = S.startMeasure;
      vals.follow = S.follow; vals.followCls = S.follow ? 'on' : '';
      vals.onToggleFollow = () => set({ follow: !S.follow });
      vals.vol = S.vol; vals.onVol = e => { const v = parseFloat(e.target.value); set({ vol: v }); if (this.master && this._ctx) this.master.gain.setTargetAtTime(v, this._ctx.currentTime, 0.02); };
      vals.thresholdStr = S.thDraft != null ? S.thDraft : String(S.threshold);
      vals.thresholdVal = S.threshold;
      vals.onThresholdSlide = e => { const v = parseFloat(e.target.value); if (isFinite(v)) { set({ thDraft: null }); this.queueThreshold(v); } };
      vals.onThresholdDraft = e => { const raw = e.target.value; set({ thDraft: raw }); const v = parseFloat(raw); if (isFinite(v) && v <= 0 && v >= -120) this.queueThreshold(v); };
      vals.onThresholdCommit = e => this.applyThreshold(parseFloat(e.target.value));
      vals.onThresholdKey = e => { if (e.key === 'Enter') e.target.blur(); };
      vals.onThDown = () => this.applyThreshold((this._thQ ? this._thT : S.threshold) - 3);
      vals.onThUp = () => this.applyThreshold((this._thQ ? this._thT : S.threshold) + 3);
      const sm = S.scopeMode || 'off';
      vals.scopesOn = sm !== 'off';
      vals.scopeW = Math.max(40, Math.min(200, S.railW - 148)); // leave room for the track name
      vals.scopeCls = sm === 'scope' ? 'on' : ''; vals.fftCls = sm === 'fft' ? 'on' : '';
      vals.onToggleScopes = () => set({ scopeMode: sm === 'scope' ? 'off' : 'scope' });
      vals.onToggleFft = () => set({ scopeMode: sm === 'fft' ? 'off' : 'fft' });
      vals.masterMeterRef = el => this.masterMeterEl = el;
      vals.wvSpec = S.waveStyle === 'spectral'; vals.wvBand = S.waveStyle === 'band'; vals.wvBars = S.waveStyle === 'bars';
      vals.onWvSpec = () => set({ waveStyle: 'spectral' }); vals.onWvBand = () => set({ waveStyle: 'band' }); vals.onWvBars = () => set({ waveStyle: 'bars' });
      vals.onZoomIn = () => this.zoomAt(null, 1.4);
      vals.onZoomOut = () => this.zoomAt(null, 1 / 1.4);
      vals.onRailResize = e => this.startResize('rail', e);
      vals.onLaneResize = e => this.startResize('lane', e);
      vals.hasWarnings = a.warnings.length > 0; vals.warnCount = a.warnings.length;
      vals.onToggleWarn = () => set({ showWarn: !S.showWarn }); vals.showWarn = S.showWarn && a.warnings.length > 0;
      vals.warningsVm = a.warnings.map(w => ({ text: w }));
      vals.viewTl = S.view === 'tl'; vals.viewTable = S.view === 'table';
      vals.onViewTl = () => set({ view: 'tl' }); vals.onViewTable = () => set({ view: 'table' });
      vals.goExport = () => set({ step: 'export' });
      vals.editCount = this.editCount();
      vals.onResetEdits = this.resetEdits;
      vals.canUndo = S.past.length > 0; vals.canRedo = S.future.length > 0;
      vals.onUndo = this.undo; vals.onRedo = this.redo;
      vals.meterTicks = core.MASTER_TICKS.map(db => ({ db, pct: core.dbPos(db) * 100, label: db === 0 ? '0' : String(db) }));
      const selKey = S.sel ? S.sel.stemId + ':' + S.sel.regionIdx : '';
      const selRegionIdx = S.sel ? S.sel.regionIdx : -1;
      vals.regionBlocks = a.regs.map(r => {
        const looped = S.loopRegionIdx === r.idx;
        return {
          left: r.start * ppm, width: r.len * ppm,
          title: String(r.idx).padStart(2, '0') + ' ' + (r.name || '').toUpperCase(),
          sub: r.bp + ' · ' + r.len + ' · ' + r.scale.label,
          bg: looped ? 'color-mix(in srgb,var(--color-accent-900) 70%,transparent)' : r.idx === selRegionIdx ? 'color-mix(in srgb,var(--color-accent-900) 45%,transparent)' : 'transparent',
          loopCls: looped ? 'on' : '',
          onLoop: (e) => {
            e.stopPropagation();
            if (S.loopRegionIdx === r.idx) { this.releaseLoop(); return; }
            const ls = a.bounds[r.start], le = a.bounds[r.end];
            if (this.state.playing && !this.loopInfo && this._ctx) {
              const posS = this.start0 + Math.max(0, this._ctx.currentTime - this.t0) * SR;
              if (posS >= ls && posS < le) {
                // playhead is inside this section: keep playing, wrap at its end
                this.loopInfo = { ls, le, len: le - ls };
                this.loopT0 = this.t0 + (le - this.start0) / SR;
                this.nextIter = 0;
                for (const s of this.sources) { try { s.stop(this.loopT0); } catch (err) {} }
                this.setState({ loopRegionIdx: r.idx }, () => this.pumpLoop());
                return;
              }
            }
            this.stop();
            this.setState({ loopRegionIdx: r.idx, startMeasure: r.start + 1 }, () => setTimeout(() => this.play(), 20));
          },
        };
      });
      const loopReg = S.loopRegionIdx != null ? a.regs.find(r => r.idx === S.loopRegionIdx) : null;
      vals.hasLoop = !!loopReg;
      if (loopReg) vals.loopLabel = String(loopReg.idx).padStart(2, '0') + (loopReg.name ? ' ' + loopReg.name.toUpperCase() : '') + ' (' + loopReg.bp + ')';
      vals.onClearLoop = this.releaseLoop;
      const tickStep = ppm >= 22 ? 1 : ppm >= 11 ? 2 : ppm >= 6 ? 4 : 8, ticks = [];
      for (let m = 0; m < a.total; m += tickStep) ticks.push({ n: m + 1, left: m * ppm });
      vals.barTicks = ticks;
      vals.rulerGrid = 'repeating-linear-gradient(to right, color-mix(in srgb,var(--color-neutral-800) 55%,transparent) 0 1px, transparent 1px ' + ppm + 'px)';
      vals.laneGrid = vals.rulerGrid;
      vals.onRulerDown = e => this.scrub(ev => this.barFromClientX(ev.clientX, e.currentTarget), e);
      vals.onPlayheadDown = e => { const el = this.sc.firstChild; this.scrub(ev => this.barFromClientX(ev.clientX, el), e); };
      // overview strip
      vals.ovRegions = a.regs.map(r => ({
        k: r.idx, left: r.start / a.total * 100, width: r.len / a.total * 100,
        label: String(r.idx).padStart(2, '0') + (r.name ? ' ' + r.name.toUpperCase() : ''),
        bg: S.loopRegionIdx === r.idx ? 'color-mix(in srgb,var(--color-accent-900) 80%,transparent)' : r.idx % 2 ? 'color-mix(in srgb,var(--color-surface) 60%,transparent)' : 'transparent',
      }));
      vals.ovRef = el => { this.ov = el; };
      vals.ovVpRef = el => { this.ovVp = el; this.syncOverview(); };
      vals.ovPhRef = el => { this.ovPh = el; };
      vals.onOvDown = e => {
        const bar = ev => { const rect = this.ov.getBoundingClientRect(); return Math.max(0, Math.min(a.total - 0.001, (ev.clientX - rect.left) / rect.width * a.total)); };
        // centre the viewport on the grabbed spot as well as seeking there
        this.scrub(bar, e);
        if (this.sc) { const px = bar(e) * ppm; this.autoScroll = true; this.sc.scrollLeft = Math.max(0, px - this.sc.clientWidth / 2); this.syncOverview(); }
      };
      // lanes
      const visA = (S.scrollX / ppm) - 2, visB = ((S.scrollX + (S.viewW || 1200)) / ppm) + 2;
      vals.lanes = S.stems.map(stem => {
        const sd = a.stemData.find(x => x.id === stem.id);
        const anySolo = S.stems.some(x => x.solo);
        return {
          id: stem.id, name: stem.name, mCls: stem.muted ? 'on' : '', sCls: stem.solo ? 'on' : '',
          meterRef: el => { if (el) this.meterEls[stem.id] = el; },
          scopeRef: el => { if (el) this.scopeEls[stem.id] = el; },
          op: (anySolo ? stem.solo : !stem.muted) ? 1 : 0.35,
          onMute: () => { const st = S.stems.map(x => x.id === stem.id ? { ...x, muted: !x.muted } : x); set({ stems: st }); this.updateGains(); },
          // plain click solos this track alone; shift-click adds to the solo group
          onSolo: (e) => {
            const soloed = S.stems.filter(x => x.solo);
            const only = soloed.length === 1 && soloed[0].id === stem.id;
            const st = S.stems.map(x => ({ ...x, solo: e.shiftKey ? (x.id === stem.id ? !x.solo : x.solo) : (x.id === stem.id ? !only : false) }));
            set({ stems: st }); this.updateGains();
          },
          ghosts: (sd ? sd.ghosts : []).map(g => ({
            k: g.region.idx, left: g.region.start * ppm, width: Math.max(4, g.region.len * ppm - 2),
            tip: (g.deleted ? 'Deleted' : 'Below threshold') + ' — click to add a slice for ' + (g.region.name || 'region ' + g.region.idx),
            onClick: (e) => { e.stopPropagation(); this.setEdit(stem.id, g.region.idx, { del: null, a: g.region.start, b: g.region.end - 1 }); set({ sel: { stemId: stem.id, regionIdx: g.region.idx } }); },
          })),
          slices: (sd ? sd.slices : []).map(sl => {
            const isSel = selKey === stem.id + ':' + sl.region.idx;
            const bars = sl.bM - sl.aM + 1, px = bars * ppm;
            const visible = sl.bM + 1 >= visA && sl.aM <= visB;
            const P = visible ? this.pathsFor(stem, sl, core.bucketTier(px), S.waveStyle) : null;
            const F = S.waveStyle === 'band' ? ['var(--color-accent-500)', 'none', 'none', 0.92]
              : S.waveStyle === 'bars' ? ['var(--color-accent-500)', 'none', 'var(--color-neutral-100)', 1]
              : ['var(--color-accent-400)', 'var(--color-accent-800)', 'var(--color-neutral-100)', 1];
            return {
              key: sl.region.idx, num: sl.num, left: sl.aM * ppm, width: Math.max(3, px - 2), edited: sl.edited,
              vb: '0 0 ' + core.bucketTier(px) + ' 32', hasWave: !!P,
              p1: P ? P.p1 : '', p2: P ? P.p2 : '', p3: P ? P.p3 : '', f1: F[0], f2: F[1], f3: F[2], o1: F[3],
              border: isSel ? 'var(--color-accent-400)' : 'var(--color-accent-700)',
              glow: isSel ? '0 0 0 1px var(--color-accent-400), 0 0 10px color-mix(in srgb,var(--color-accent) 35%,transparent)' : 'none',
              tip: stem.name + ' slice ' + sl.num + ' · bars ' + (sl.aM + 1) + '–' + (sl.bM + 1) + (sl.edited ? ' (trimmed)' : '') + ' — drag the edges to trim, double-click to audition',
              selected: isSel,
              onClick: (e) => { e.stopPropagation(); set({ sel: { stemId: stem.id, regionIdx: sl.region.idx } }); },
              onDbl: (e) => { e.stopPropagation(); this.audition({ stemId: stem.id, regionIdx: sl.region.idx }); },
              onTrimL: (e) => this.startTrim(stem.id, sl.region.idx, 'l', e),
              onTrimR: (e) => this.startTrim(stem.id, sl.region.idx, 'r', e),
            };
          }),
        };
      });
      // selection detail
      vals.hasSel = false; vals.noSel = true;
      if (S.sel) {
        const sd = a.stemData.find(x => x.id === S.sel.stemId), stem = S.stems.find(x => x.id === S.sel.stemId);
        const sl = sd && sd.slices.find(x => x.region.idx === S.sel.regionIdx);
        if (sl && stem) {
          vals.hasSel = true; vals.noSel = false;
          vals.selTitle = stem.name + ' · Slice ' + sl.num;
          vals.selRegion = String(sl.region.idx).padStart(2, '0') + (sl.region.name ? ' ' + sl.region.name.toUpperCase() : '') + ' (' + sl.region.bp + ')';
          vals.selFromBar = sl.aM + 1;
          vals.selPatternBar = sl.aM - sl.trigRegion.start + 1;
          vals.selTrig = sl.trig;
          vals.selMovedTrig = sl.movedTrig;
          vals.selTrigPattern = sl.trigRegion.bp;
          vals.selEdited = sl.edited;
          vals.selSamples = (sl.bM - sl.aM + 1) + ' bars · smp ' + sl.start.toLocaleString() + '–' + sl.end.toLocaleString();
          vals.onAudition = () => this.audition(S.sel);
          vals.onDeleteSel = this.deleteSelected;
          vals.onResetSel = () => this.setEdit(S.sel.stemId, S.sel.regionIdx, { del: null, a: null, b: null });
          vals.onNudge = (side, d) => {
            const lim = core.trimLimits(sd.slices, S.sel.regionIdx, a.regs);
            const patch = side === 'l'
              ? { a: Math.max(lim.minA, Math.min(sl.bM, sl.aM + d)), b: sl.bM }
              : { a: sl.aM, b: Math.min(lim.maxB, Math.max(sl.aM, sl.bM + d)) };
            this.setEdit(S.sel.stemId, S.sel.regionIdx, { ...patch, del: null });
          };
        }
      }
      // table view
      if (S.view === 'table') {
        const cell = (l1, l2, c1) => ({ l1, l2: l2 || '', hasL2: !!l2, c1: c1 || 'var(--color-neutral-300)' });
        const rows = [
          { label: 'Region', cells: a.regs.map(r => cell(String(r.idx).padStart(2, '0') + ' ' + (r.name || ''), r.bp, 'var(--color-neutral-200)')) },
          { label: 'Length', cells: a.regs.map(r => cell(r.len + ' bars')) },
          { label: 'Scale', cells: a.regs.map(r => cell(r.scale.label)) },
          { label: 'Master', cells: a.regs.map(r => cell(r.scale.master, '', 'var(--color-neutral-500)')) },
        ];
        for (const stem of S.stems) {
          const sd = a.stemData.find(x => x.id === stem.id);
          rows.push({ label: stem.name, cells: a.regs.map(r => {
            const sl = sd.slices.find(x => x.region.idx === r.idx);
            return sl ? cell('Slice ' + sl.num, sl.trig !== 1 ? 'from bar ' + (sl.aM + 1) + ' · step ' + sl.trig : '', 'var(--color-accent-300)') : cell('—', '', 'var(--color-neutral-700)');
          }) });
        }
        vals.tableRows = rows;
      } else vals.tableRows = [];
      vals.onCsv = this.exportCsv;
      // export
      vals.namingPreview = '1 ' + (S.stems[0] ? S.stems[0].name : 'DRUMS') + ' ' + ((S.abbrev || 'Song').trim()) + '.wav / .ot';
      const notices = a.warnings.filter(w => /no slices|64/.test(w)).map(t => ({ text: t }));
      vals.exportNotices = notices; vals.hasExportNotices = notices.length > 0;
      vals.fileCards = S.stems.map((stem, i) => {
        const sd = a.stemData.find(x => x.id === stem.id), n = sd ? sd.slices.length : 0;
        const base = this.fileBase(stem, i);
        const bytes = 44 + (sd ? sd.totalFrames : 0) * stem.bytesPerFrame;
        return {
          num: i + 1, stemName: stem.name,
          sliceLabel: n ? n + (n > 64 ? ' slices (64 kept)' : ' slices') : 'no slices — skipped',
          wavName: base + '.wav', otName: base + '.ot',
          size: bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024 | 0) + ' KB',
          onWav: () => n && this.download(base + '.wav', this.buildWav(sd, stem)),
          onOt: () => n && this.download(base + '.ot', this.buildOt(sd)),
        };
      });
      const totB = vals.fileCards.reduce((s, f) => { const sd = a.stemData.find(x => x.id === S.stems[f.num - 1].id); return s + (sd && sd.slices.length ? 44 + sd.totalFrames * S.stems[f.num - 1].bytesPerFrame + 832 : 0); }, 0);
      const nF = vals.fileCards.filter(f => !/no slices/.test(f.sliceLabel)).length;
      vals.exportSummary = nF * 2 + ' files · ' + (totB / 1048576).toFixed(1) + ' MB total';
      vals.onZip = this.exportZip; vals.zipBusy = S.zipBusy;
      vals.zipLabel = S.zipBusy ? 'Packing ZIP…' : 'Download all (ZIP)';
      vals.zipName = S.zipName; vals.zipNamePh = this.stemsZipName();
      vals.onZipName = e => set({ zipName: e.target.value });
      vals.goProject = () => set({ step: 'project' });
    }
    // project
    vals.dirInputRef = el => this.di = el;
    vals.zipInputRef = el => this.zi = el;
    vals.onPickProject = () => this.di && this.di.click();
    vals.onPickProjectZip = () => this.zi && this.zi.click();
    vals.onProjectInput = this.onProjectInput;
    vals.onProjectDrop = e => e.preventDefault();
    vals.onProjectDragOver = e => e.preventDefault();
    vals.onProjectDragLeave = e => e.preventDefault();
    vals.projDropping = !!S.dragging;
    vals.projName = S.projName; vals.projNamePh = this.projFolderName();
    vals.onProjName = e => set({ projName: e.target.value });
    vals.hasProject = !!S.project; vals.noProject = !S.project;
    if (S.project) {
      const p = S.project;
      vals.projFolder = p.folder; vals.projOs = p.os; vals.projFiles = String(p.files); vals.projBanks = p.banks.length ? p.banks.length + ' (' + p.banks.slice(0, 3).join(', ') + (p.banks.length > 3 ? '…' : '') + ')' : 'none found';
      vals.hasProjWarn = !!p.warn; vals.projWarn = p.warn;
      const nRegs = a ? a.regs.length : 0;
      vals.projPlan = [
        { target: 'project folder', tag: 'AUTO', tagCls: 'tag-accent', change: S.stems.length + ' stem WAVs + .ot slice files placed inside the project folder (no set-level AUDIO pool)' },
        { target: 'project.work', tag: 'AUTO', tagCls: 'tag-accent', change: S.stems.length + ' Static sample slots written (1–' + S.stems.length + ', stem order = track order; timestretch off, project BPM, trig quantize direct)' },
        { target: 'markers.work', tag: 'AUTO', tagCls: 'tag-accent', change: 'trim + 64-slice grid written per Static slot — this is the file the device reads slot slices from, so they appear without reloading samples' },
        { target: 'bank02+.work', tag: 'AUTO', tagCls: 'tag-accent', change: nRegs + ' patterns written in place: one trig per stem-slice with a slice p-lock (no sample locks — tracks play their default sample), per-track scale, master length INF at master scale 1x (§6); checksum recomputed. Structure is verified against your own file first — any mismatch falls back to an untouched copy.' },
        { target: 'parts / scenes · bank01', tag: 'VERIFIED', tagCls: 'tag-neutral', change: 'never rewritten — byte-identity of the part data (where scenes live) is checked after every bank write' },
        { target: 'on device, once', tag: 'MANUAL', tagCls: 'tag-neutral', change: 'on tracks 1–' + Math.min(8, S.stems.length) + ' in the part, assign a STATIC machine and set its default sample (TRK DEFAULT) to the matching slot — slices are p-locked per trig, so nothing else is needed' },
        { target: 'PATTERNS.html', tag: 'SHEET', tagCls: 'tag-neutral', change: 'printable reference of everything written, and the manual fallback if a bank fails verification' },
      ];
      vals.onGenerateProject = this.generateProject; vals.projBusy = S.projBusy;
      vals.generateLabel = S.projBusy ? 'Generating…' : 'Generate project copy (ZIP)';
      vals.hasProjReport = !!S.projReport;
      vals.projReport = (S.projReport || []).map(r => ({ text: r.text, mark: r.warn ? '◆' : '✓', c: r.warn ? 'var(--color-accent-300)' : 'var(--color-accent-500)' }));
    }
    return vals;
  }

  render() {
    const vals = this.buildVals();
    const dropStep = this.dropStep();
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {this.state.dragging && dropStep && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)', border: '2px dashed var(--color-accent)', pointerEvents: 'none' }}>
            <div style={{ fontSize: 17, color: 'var(--color-accent-200)', textAlign: 'center', lineHeight: 1.7 }}>
              {dropStep === 'project' ? 'Drop the Octatrack project folder or .zip' : 'Drop stems, a folder, or a .zip'}
              <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>anywhere on this pane</div>
            </div>
          </div>
        )}
        <Header vals={vals} />
        {vals.isFiles && <FilesStep vals={vals} />}
        {vals.isTempo && <TempoStep vals={vals} />}
        {vals.isRegions && <RegionsStep vals={vals} />}
        {vals.isResults && <ResultsStep vals={vals} />}
        {vals.isExport && <ExportStep vals={vals} />}
        {vals.isProject && <ProjectStep vals={vals} />}
      </div>
    );
  }
}
