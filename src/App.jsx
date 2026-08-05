import React from 'react';
import * as core from './lib/index.js';
import Header from './components/Header.jsx';
import FilesStep from './components/FilesStep.jsx';
import TempoStep from './components/TempoStep.jsx';
import RegionsStep from './components/RegionsStep.jsx';
import ResultsStep from './components/ResultsStep.jsx';
import ExportStep from './components/ExportStep.jsx';
import ProjectStep from './components/ProjectStep.jsx';

export default class App extends React.Component {
  static defaultProps = { defaultThresholdDb: -60, waveStyle: 'spectral', showScopes: true, compactLanes: false };

  state = {
    step: 'files', stems: [], midi: null, filesError: '', demoLoading: false,
    bpm: '', bpmSource: '', bpmError: '', abbrev: '', threshold: null, thDraft: null, bpmDraft: null,
    regions: null, regionsMeta: null, analyzing: false, progress: '',
    analysis: null, view: 'tl', ppm: 16, sel: null, playing: false, loopRegionIdx: null, waveStyle: 'spectral',
    startMeasure: 1, vol: 0.85, showWarn: false, zipBusy: false, project: null, projBusy: false, projReport: null,
  };
  core = core;
  ids = 1; sources = []; buffers = {}; gains = {}; blobCache = {}; analysers = {}; meterEls = {}; scopeEls = {}; envs = {};

  componentDidMount() {
    if (this.state.threshold === null) this.setState({ threshold: this.props.defaultThresholdDb ?? -60, waveStyle: this.props.waveStyle ?? 'spectral', scopeMode: (this.props.showScopes ?? false) ? 'scope' : 'off' });
    this.meterRaf = requestAnimationFrame(this.meterTick);
    this.keyH = (e) => {
      if (e.code === 'Space' && this.state.step === 'results' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); this.state.playing ? this.stop() : this.play(); }
    };
    window.addEventListener('keydown', this.keyH);
  }
  componentWillUnmount() { window.removeEventListener('keydown', this.keyH); cancelAnimationFrame(this.meterRaf); this.stop(); }

  // ---------- meters & scopes ----------
  analyserFor(id) { const ctx = this.ctx(); if (!this.analysers[id]) { const an = ctx.createAnalyser(); an.fftSize = 1024; this.analysers[id] = an; } return this.analysers[id]; }
  meterTick = () => {
    this.meterRaf = requestAnimationFrame(this.meterTick);
    if (this.state.step !== 'results') return;
    if (!this.cols) {
      const cs = getComputedStyle(document.documentElement);
      const g = (n, f) => (cs.getPropertyValue(n) || '').trim() || f;
      this.cols = { a5: g('--color-accent-500', '#968ae0'), a4: g('--color-accent-400', '#b5abfc'), a2: g('--color-accent-200', '#e7e5fe'), n1: g('--color-neutral-100', '#f3f5fe'), n8: g('--color-neutral-800', '#3f424d') };
    }
    const buf = this.anBuf || (this.anBuf = new Float32Array(1024));
    const lvl = (an, key) => {
      let pk = 0;
      if (an) { an.getFloatTimeDomainData(buf); for (let i = 0; i < 1024; i++) { const v = Math.abs(buf[i]); if (v > pk) pk = v; } }
      const e = this.envs[key] || (this.envs[key] = { env: 0, hold: 0, ht: 0 });
      e.env = Math.max(pk, e.env * 0.86);
      if (pk >= e.hold) { e.hold = pk; e.ht = 40; } else if (--e.ht <= 0) e.hold *= 0.94;
      return e;
    };
    for (const stem of this.state.stems) {
      const an = this.analysers[stem.id], e = lvl(an, stem.id);
      if (this.meterEls[stem.id]) this.drawMeter(this.meterEls[stem.id], e, false);
      const sm = this.state.scopeMode;
      if (sm && sm !== 'off' && this.scopeEls[stem.id]) (sm === 'fft' ? this.drawFft : this.drawScope).call(this, this.scopeEls[stem.id], an);
    }
    if (this.masterMeterEl) this.drawMeter(this.masterMeterEl, lvl(this.masterAn, 'master'), true);
  };
  drawMeter(el, e, horiz) {
    const c = el.getContext('2d'), w = el.width, h = el.height;
    c.clearRect(0, 0, w, h);
    const v = Math.min(1, Math.sqrt(e.env)), hp = Math.min(1, Math.sqrt(e.hold));
    c.fillStyle = this.cols.a5;
    if (horiz) {
      c.fillRect(0, 0, w * v, h);
      if (v > 0.75) { c.fillStyle = this.cols.a2; c.fillRect(w * 0.75, 0, w * (v - 0.75), h); }
      if (hp > 0.02) { c.fillStyle = this.cols.n1; c.fillRect(Math.min(w - 1.5, w * hp), 0, 1.5, h); }
    } else {
      c.fillRect(0, h - h * v, w, h * v);
      if (v > 0.75) { c.fillStyle = this.cols.a2; c.fillRect(0, h - h * v, w, h * (v - 0.75)); }
      if (hp > 0.02) { c.fillStyle = this.cols.n1; c.fillRect(0, Math.max(0, h - h * hp - 1.5), w, 1.5); }
    }
  }
  drawScope(el, an) {
    const c = el.getContext('2d'), w = el.width, h = el.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = this.cols.n8; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h / 2 + 0.5); c.lineTo(w, h / 2 + 0.5); c.stroke();
    if (!an) return;
    const buf = this.anBuf; an.getFloatTimeDomainData(buf);
    c.strokeStyle = this.cols.a4; c.beginPath();
    for (let x = 0; x < w; x++) { const y = h / 2 - buf[(x * 1024 / w) | 0] * (h / 2 - 1); x ? c.lineTo(x + 0.5, y) : c.moveTo(0.5, y); }
    c.stroke();
  }
  drawFft(el, an) {
    const c = el.getContext('2d'), w = el.width, h = el.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = this.cols.n8; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, h - 0.5); c.lineTo(w, h - 0.5); c.stroke();
    if (!an) return;
    if (!this.fftBuf) this.fftBuf = new Uint8Array(512);
    an.getByteFrequencyData(this.fftBuf);
    const n = 18, bw = w / n;
    for (let i = 0; i < n; i++) {
      // log-spaced bins: bar i covers analyser bins 512^(i/n) .. 512^((i+1)/n)
      const b0 = Math.floor(Math.pow(512, i / n)), b1 = Math.max(b0 + 1, Math.floor(Math.pow(512, (i + 1) / n)));
      let m = 0; for (let b = b0; b < b1 && b < 512; b++) m = Math.max(m, this.fftBuf[b]);
      const v = m / 255, bh = v * (h - 3);
      if (bh < 0.5) continue;
      c.fillStyle = this.cols.a5; c.fillRect(i * bw + 0.5, h - 1 - bh, bw - 1, bh);
      if (v > 0.72) { c.fillStyle = this.cols.a2; c.fillRect(i * bw + 0.5, h - 1 - bh, bw - 1, bh - 0.72 * (h - 3)); }
    }
  }

  // ---------- files ----------
  async handleFiles(fileList) {
    const errs = []; let st = [...this.state.stems], midi = this.state.midi;
    for (const f of fileList) {
      try {
        this.setState({ reading: f.name });
        await new Promise(r => setTimeout(r, 25));
        const buf = await f.arrayBuffer();
        if (/\.(mid|midi)$/i.test(f.name)) midi = core.parseMidi(buf, f.name);
        else if (/\.wav$/i.test(f.name)) {
          const p = core.parseWav(buf, f.name);
          st.push({ id: this.ids++, name: f.name.replace(/\.wav$/i, '').replace(/[_-]?\d+$/, '').toUpperCase().slice(0, 20) || 'STEM', muted: false, solo: false, ...p });
        } else errs.push(f.name + ': unsupported type (need .wav or .mid)');
      } catch (err) { errs.push(err.message); }
    }
    let bpm = this.state.bpm, bpmSource = this.state.bpmSource;
    if (midi && !bpm) {
      const cand = (midi.fileName.match(/\d{2,3}(?:\.\d+)?/g) || []).map(Number).find(n => n >= 50 && n <= 250);
      if (cand) { bpm = String(cand); bpmSource = 'detected from file name “' + midi.fileName + '” — confirm before processing'; }
      else if (midi.bpm) { bpm = String(midi.bpm); bpmSource = 'from MIDI tempo event — confirm before processing'; }
      else { bpm = '120'; bpmSource = 'no tempo found — enter the session BPM'; }
    }
    this.setState({ stems: st, midi, filesError: errs.join('\n'), bpm, bpmSource, analysis: null, regions: null, reading: '' });
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
      this.setState({ stems: [], midi: null, bpm: '', abbrev: demo.abbrev, analysis: null, regions: null });
      await this.handleFiles(files);
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
      this.setState({ threshold: this._thT });
      this.reapplyThreshold(this._thT);
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
      const peaks = core.measurePeaks(s.chL, s.chR, bounds);
      stemData.push({ id: s.id, peaks });
    }
    this.buildSlices(stemData, regs, bounds, thLin, warnings);
    if (regs.some(r => !r.scale.ok)) warnings.push('Regions over 32 bars cannot be represented as a single pattern — split them in the arrangement MIDI.');
    if ((this.state.regionsMeta.snapped || 0) > 0) warnings.push(this.state.regionsMeta.snapped + ' MIDI note(s) were not exactly on a bar line — snapped to the nearest measure.');
    if (regs.length > 32) warnings.push(regs.length + ' regions — patterns roll on past Bank 3 (' + core.bankPattern(regs.length).bp + ' last).');
    const fitPpm = Math.max(5, Math.min(30, Math.floor((window.innerWidth - 200) / total)));
    this.setState({ analyzing: false, analysis: { bounds, total, regs, stemData, warnings, v: Date.now() }, step: 'results', ppm: fitPpm, sel: null, startMeasure: 1, loopRegionIdx: null });
    this.blobCache = {}; this.buffers = {};
  };
  buildSlices(stemData, regs, bounds, thLin, warnings) {
    const { stems } = this.state;
    stemData.forEach((sd) => {
      const s = stems.find(x => x.id === sd.id), slices = [];
      for (const r of regs) {
        const t = core.trimRegion(sd.peaks, r.start, r.end, thLin);
        if (!t) continue;
        const start = bounds[t.a], end = bounds[t.b + 1];
        slices.push({ region: r, aM: t.a, bM: t.b, start, end, frames: end - start, trig: core.trigStep(t.a - r.start, r.scale.steps) });
      }
      let out = 0;
      slices.forEach((sl, i) => {
        sl.num = i + 1; sl.outStart = out; out += sl.frames; sl.outEnd = out;
        const buckets = Math.min(560, Math.max(32, (sl.bM - sl.aM + 1) * 16));
        sl.vb = '0 0 ' + buckets + ' 32';
        sl.bands = core.waveBands(s.chL, s.chR, sl.start, sl.end, buckets);
        sl._pc = {};
      });
      sd.slices = slices; sd.totalFrames = out;
      if (!slices.length) warnings.push(s.name + ' is entirely silent at this threshold — no files will be exported for it.');
      if (slices.length > 64) warnings.push(s.name + ': ' + slices.length + ' slices exceeds the Octatrack limit of 64 — the .ot file keeps the first 64.');
    });
  }
  reapplyThreshold = (th) => {
    const a = this.state.analysis; if (!a) return;
    const warnings = a.warnings.filter(w => !/silent at this threshold|exceeds the Octatrack limit/.test(w));
    this.buildSlices(a.stemData, a.regs, a.bounds, core.dbToLin(th), warnings);
    this.blobCache = {};
    this.setState({ analysis: { ...a, warnings, v: Date.now() }, sel: null });
  };

  // ---------- playback ----------
  ctx() {
    if (!this._ctx) {
      this._ctx = new AudioContext({ sampleRate: 44100 });
      this.master = this._ctx.createGain(); this.master.gain.value = this.state.vol; this.master.connect(this._ctx.destination);
      this.masterAn = this._ctx.createAnalyser(); this.masterAn.fftSize = 1024; this.master.connect(this.masterAn);
    }
    return this._ctx;
  }
  bufferFor(stem) {
    if (!this.buffers[stem.id]) {
      const b = this.ctx().createBuffer(2, stem.frames, 44100);
      b.copyToChannel(stem.chL, 0); b.copyToChannel(stem.chR, 1);
      this.buffers[stem.id] = b;
    }
    return this.buffers[stem.id];
  }
  audible(stem) { const anySolo = this.state.stems.some(s => s.solo); return anySolo ? stem.solo : !stem.muted; }
  scheduleLoopIter(k) {
    const a = this.state.analysis, ctx = this.ctx(), { ls, le, len } = this.loopInfo, t0 = this.loopT0;
    for (const sd of a.stemData) {
      const stem = this.state.stems.find(s => s.id === sd.id), g = stem && this.gains[stem.id]; if (!g) continue;
      const buf = this.bufferFor(stem);
      for (const sl of sd.slices) {
        const s = Math.max(sl.start, ls), e = Math.min(sl.end, le); if (e <= s) continue;
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g);
        src.onended = () => { const i = this.sources.indexOf(src); if (i >= 0) this.sources.splice(i, 1); };
        src.start(t0 + (k * len + (s - ls)) / 44100, s / 44100, (e - s) / 44100);
        this.sources.push(src);
      }
    }
  }
  play = () => {
    const a = this.state.analysis; if (!a) return;
    this.stop(); const ctx = this.ctx(); ctx.resume();
    const t0 = ctx.currentTime + 0.12; this.t0 = t0; this.gains = {};
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.linearRampToValueAtTime(1, t0 + 0.015); bus.connect(this.master); this.bus = bus;
    for (const stem of this.state.stems) { const g = ctx.createGain(); g.gain.value = this.audible(stem) ? 1 : 0; g.connect(bus); g.connect(this.analyserFor(stem.id)); this.gains[stem.id] = g; }
    const lr = this.state.loopRegionIdx != null ? a.regs.find(r => r.idx === this.state.loopRegionIdx) : null;
    if (lr) {
      const ls = a.bounds[lr.start], le = a.bounds[lr.end];
      this.loopInfo = { ls, le, len: le - ls }; this.start0 = ls; this.loopT0 = t0; this.nextIter = 0;
    } else {
      this.loopInfo = null;
      const start0 = a.bounds[this.state.startMeasure - 1]; this.start0 = start0;
      for (const sd of a.stemData) {
        const stem = this.state.stems.find(s => s.id === sd.id), g = stem && this.gains[stem.id]; if (!g) continue;
        const buf = this.bufferFor(stem);
        for (const sl of sd.slices) {
          if (sl.end <= start0) continue;
          const skip = Math.max(0, start0 - sl.start);
          const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g);
          src.start(t0 + Math.max(0, sl.start - start0) / 44100, (sl.start + skip) / 44100, (sl.frames - skip) / 44100);
          this.sources.push(src);
        }
      }
    }
    this.setState({ playing: true });
    const spm = core.spmFor(parseFloat(this.state.bpm)), endS = a.bounds[a.total];
    const tick = () => {
      if (!this.state.playing) return;
      const el = Math.max(0, this.ctx().currentTime - this.t0);
      let pos;
      if (this.loopInfo) {
        const { ls, len } = this.loopInfo;
        const tl = this.ctx().currentTime - this.loopT0;
        while (this.nextIter * len / 44100 < tl + 1.2) { this.scheduleLoopIter(this.nextIter); this.nextIter++; }
        pos = tl >= 0 ? ls + (tl * 44100) % len : this.start0 + el * 44100;
      } else {
        pos = this.start0 + el * 44100;
        if (pos >= endS) { this.stop(); return; }
      }
      const mf = pos / spm, px = mf * this.state.ppm;
      if (this.ph) this.ph.style.transform = 'translateX(' + px + 'px)';
      if (this.sc) { const vw = this.sc.clientWidth; if (px < this.sc.scrollLeft + 30 || px > this.sc.scrollLeft + vw - 90) this.sc.scrollLeft = Math.max(0, px - vw * 0.15); }
      if (this.pos) this.pos.textContent = String(Math.floor(mf) + 1).padStart(3, '0') + '.' + (Math.floor((mf % 1) * 4) + 1);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };
  stop = () => {
    if (this._ctx && this.bus) {
      const b = this.bus, srcs = this.sources, t = this._ctx.currentTime;
      this.bus = null; this.sources = [];
      try { b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0, t + 0.02); } catch (e) {}
      setTimeout(() => { srcs.forEach(s => { try { s.stop(); } catch (e) {} }); try { b.disconnect(); } catch (e) {} }, 90);
    } else { this.sources.forEach(s => { try { s.stop(); } catch (e) {} }); this.sources = []; }
    this.loopInfo = null;
    cancelAnimationFrame(this.raf);
    if (this.state.playing) this.setState({ playing: false });
    if (this.ph) this.ph.style.transform = 'translateX(' + ((this.state.startMeasure - 1) * this.state.ppm) + 'px)';
    if (this.pos) this.pos.textContent = String(this.state.startMeasure).padStart(3, '0') + '.1';
  };
  audition = (sel) => {
    const a = this.state.analysis, sd = a.stemData.find(x => x.id === sel.stemId);
    const sl = sd && sd.slices.find(x => x.num === sel.num); if (!sl) return;
    this.stop(); const ctx = this.ctx(); ctx.resume();
    const stem = this.state.stems.find(s => s.id === sel.stemId);
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.06); bus.connect(this.master); this.bus = bus;
    const src = ctx.createBufferSource(); src.buffer = this.bufferFor(stem); src.connect(bus); src.connect(this.analyserFor(stem.id));
    src.start(ctx.currentTime + 0.05, sl.start / 44100, sl.frames / 44100);
    this.sources.push(src);
  };
  updateGains() { if (!this._ctx) return; const t = this._ctx.currentTime; for (const s of this.state.stems) if (this.gains[s.id]) this.gains[s.id].gain.setTargetAtTime(this.audible(s) ? 1 : 0, t, 0.015); }

  // ---------- export ----------
  download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  fileBase(stem, i) { const ab = ((this.state.abbrev || 'Song').trim() || 'Song').replace(/[\\/:*?"<>|]/g, ''); return (i + 1) + ' ' + stem.name.replace(/[\\/:*?"<>|]/g, '') + ' ' + ab; }
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
      const entries = [], rep = [], folder = p.folder + ' OSSC', slotEntries = [], markerEntries = [];
      let sawMarkers = false;
      S.stems.forEach((stem, i) => {
        const sd = a.stemData.find(x => x.id === stem.id);
        if (!sd || !sd.slices.length) { rep.push({ warn: 1, text: stem.name + ' is silent — Static slot ' + (i + 1) + ' left empty' }); return; }
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
        const tracks = [];
        S.stems.slice(0, 8).forEach((stem, i) => {
          const sd2 = a.stemData.find(x => x.id === stem.id);
          const sl = sd2 && sd2.slices.find(x => x.region.idx === r.idx);
          if (sl && sl.num <= 64) tracks.push({ trackIdx: i, trigs: [{ step: sl.trig, slice: sl.num - 1 }] });
        });
        const bankNo = 2 + Math.floor((r.idx - 1) / 16);
        (bankJobs[bankNo] = bankJobs[bankNo] || []).push({ patternIdx: (r.idx - 1) % 16, LEN: r.scale.LEN, mult: r.scale.mult, tracks });
      }
      let banks = 0, slotsOk = false, banksWritten = 0, trigsTotal = 0;
      const banksNeeded = new Set(Object.keys(bankJobs).map(Number));
      for (const f of p.fileList) {
        const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
        const buf = new Uint8Array(await f.arrayBuffer());
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
      banksNeeded.forEach(n => { if (![...p.fileList].some(f => new RegExp('^bank' + String(n).padStart(2, '0') + '\\.work$', 'i').test((f.webkitRelativePath || f.name).split('/').pop()))) rep.push({ warn: 1, text: 'bank' + String(n).padStart(2, '0') + '.work not found — its regions were not programmed' }); });
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
    this.download(((this.state.abbrev || 'OSSC').trim()) + ' stems.zip', core.makeZip(entries));
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

  // ---------- project (phase 2) ----------
  onProjectInput = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const folder = (files[0].webkitRelativePath || '').split('/')[0] || 'project';
    const banks = files.filter(f => /^bank\d+\.(work|strd)$/i.test(f.name)).map(f => f.name).sort();
    const pw = files.find(f => /^project\.work$/i.test(f.name));
    let os = 'not found', warn = '';
    if (pw) {
      const pi = core.parseProjectText(core.decodeLatin1(new Uint8Array(await pw.arrayBuffer())));
      os = pi.osVersion || 'unreadable';
      if (!/OCTATRACK/i.test(pi.projType)) warn = 'project.work does not look like an Octatrack project file — generation may produce an unusable copy.';
      else if (!/^1\.40[ABC]$/.test(os)) warn = 'Project OS ' + os + ' — slot writing verified for OS 1.40 A/B/C only; verify on device.';
    } else warn = 'No project.work found — is this an Octatrack project folder?';
    this.setState({ project: { folder, files: files.length, banks, os, warn, fileList: files }, projReport: null });
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
    };
    // files
    vals.onDragOver = e => e.preventDefault();
    vals.onDrop = e => { e.preventDefault(); this.handleFiles([...e.dataTransfer.files]); };
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
      props: (s.frames / 44100 / 60 | 0) + ':' + String((s.frames / 44100 % 60) | 0).padStart(2, '0') + ' · ' + s.bits + '-bit · ' + s.frames.toLocaleString() + ' smp',
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
    vals.songLenLabel = S.midi && spm ? (() => { const tm = Math.round(S.midi.ticks[S.midi.ticks.length - 1] / (S.midi.ppq * 4)); const sec = tm * spm / 44100; return tm + ' bars · ' + (sec / 60 | 0) + ':' + String(Math.round(sec % 60)).padStart(2, '0'); })() : '—';
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
      const ppm = S.ppm, selKey = S.sel ? S.sel.stemId + ':' + S.sel.num : '';
      vals.tlWidth = Math.ceil(a.total * ppm) + 2;
      vals.laneH = this.props.compactLanes ? 38 : 50;
      vals.playing = S.playing; vals.onPlay = this.play; vals.onStop = this.stop;
      vals.playCls = S.playing ? 'on' : '';
      vals.onToStart = () => { this.stop(); set({ startMeasure: 1 }); if (this.sc) this.sc.scrollLeft = 0; };
      vals.onZoomFit = () => set({ ppm: Math.max(3, Math.min(30, Math.floor(((this.sc ? this.sc.clientWidth : window.innerWidth - 200) - 10) / a.total))) });
      vals.onDeselect = () => S.sel && set({ sel: null });
      vals.regionLines = a.regs.map(r => ({ left: r.start * ppm }));
      vals.onPrint = this.printTable;
      vals.posRef = el => this.pos = el; vals.playheadRef = el => this.ph = el; vals.scrollRef = el => this.sc = el;
      vals.posLabel = String(S.startMeasure).padStart(3, '0') + '.1';
      vals.playheadPx = (S.startMeasure - 1) * ppm;
      vals.startMeasure = S.startMeasure;
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
      vals.railCols = (sm !== 'off' ? '212px' : '150px') + ' 1fr';
      vals.scopesOn = sm !== 'off';
      vals.scopeCls = sm === 'scope' ? 'on' : ''; vals.fftCls = sm === 'fft' ? 'on' : '';
      vals.onToggleScopes = () => set({ scopeMode: sm === 'scope' ? 'off' : 'scope' });
      vals.onToggleFft = () => set({ scopeMode: sm === 'fft' ? 'off' : 'fft' });
      vals.masterMeterRef = el => this.masterMeterEl = el;
      vals.wvSpec = S.waveStyle === 'spectral'; vals.wvBand = S.waveStyle === 'band'; vals.wvBars = S.waveStyle === 'bars';
      vals.onWvSpec = () => set({ waveStyle: 'spectral' }); vals.onWvBand = () => set({ waveStyle: 'band' }); vals.onWvBars = () => set({ waveStyle: 'bars' });
      vals.onZoomIn = () => set({ ppm: Math.min(90, Math.round(ppm * 1.4)) });
      vals.onZoomOut = () => set({ ppm: Math.max(3, Math.round(ppm / 1.4)) });
      vals.hasWarnings = a.warnings.length > 0; vals.warnCount = a.warnings.length;
      vals.onToggleWarn = () => set({ showWarn: !S.showWarn }); vals.showWarn = S.showWarn && a.warnings.length > 0;
      vals.warningsVm = a.warnings.map(w => ({ text: w }));
      vals.viewTl = S.view === 'tl'; vals.viewTable = S.view === 'table';
      vals.onViewTl = () => set({ view: 'tl' }); vals.onViewTable = () => set({ view: 'table' });
      vals.goExport = () => set({ step: 'export' });
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
            if (S.loopRegionIdx === r.idx) { this.stop(); this.setState({ loopRegionIdx: null }); return; }
            const ls = a.bounds[r.start], le = a.bounds[r.end];
            if (this.state.playing && !this.loopInfo && this._ctx) {
              const posS = this.start0 + Math.max(0, this._ctx.currentTime - this.t0) * 44100;
              if (posS >= ls && posS < le) {
                // playhead is inside this section: keep playing, wrap at its end
                this.loopInfo = { ls, le, len: le - ls };
                this.loopT0 = this.t0 + (le - this.start0) / 44100;
                this.nextIter = 0;
                for (const s of this.sources) { try { s.stop(this.loopT0); } catch (err) {} }
                this.setState({ loopRegionIdx: r.idx });
                return;
              }
            }
            this.stop();
            this.setState({ loopRegionIdx: r.idx, startMeasure: r.start + 1 });
            setTimeout(() => this.play(), 30);
          },
        };
      });
      const loopReg = S.loopRegionIdx != null ? a.regs.find(r => r.idx === S.loopRegionIdx) : null;
      vals.hasLoop = !!loopReg;
      if (loopReg) vals.loopLabel = String(loopReg.idx).padStart(2, '0') + (loopReg.name ? ' ' + loopReg.name.toUpperCase() : '') + ' (' + loopReg.bp + ')';
      vals.onClearLoop = () => { this.stop(); set({ loopRegionIdx: null }); };
      const tickStep = ppm >= 22 ? 1 : ppm >= 11 ? 2 : ppm >= 6 ? 4 : 8, ticks = [];
      for (let m = 0; m < a.total; m += tickStep) ticks.push({ n: m + 1, left: m * ppm });
      vals.barTicks = ticks;
      vals.rulerGrid = 'repeating-linear-gradient(to right, color-mix(in srgb,var(--color-neutral-800) 55%,transparent) 0 1px, transparent 1px ' + ppm + 'px)';
      vals.laneGrid = vals.rulerGrid;
      vals.onRulerClick = e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const m = Math.max(0, Math.min(a.total - 1, Math.floor((e.clientX - rect.left) / ppm)));
        this.stop(); set({ startMeasure: m + 1, loopRegionIdx: null });
      };
      vals.lanes = S.stems.map(stem => {
        const sd = a.stemData.find(x => x.id === stem.id);
        const anySolo = S.stems.some(x => x.solo);
        return {
          name: stem.name, mCls: stem.muted ? 'on' : '', sCls: stem.solo ? 'on' : '',
          meterRef: el => { if (el) this.meterEls[stem.id] = el; },
          scopeRef: el => { if (el) this.scopeEls[stem.id] = el; },
          op: (anySolo ? stem.solo : !stem.muted) ? 1 : 0.35,
          onMute: () => { const st = S.stems.map(x => x.id === stem.id ? Object.assign(x, { muted: !x.muted }) : x); set({ stems: [...st] }); this.updateGains(); },
          onSolo: () => { const st = S.stems.map(x => x.id === stem.id ? Object.assign(x, { solo: !x.solo }) : x); set({ stems: [...st] }); this.updateGains(); },
          slices: (sd ? sd.slices : []).map(sl => {
            const key = stem.id + ':' + sl.num, isSel = key === selKey;
            const wst = S.waveStyle;
            if (!sl._pc[wst]) sl._pc[wst] = core.wavePaths(sl.bands, wst, 32);
            const P = sl._pc[wst];
            const F = wst === 'band' ? ['var(--color-accent-500)', 'none', 'none', 0.92]
              : wst === 'bars' ? ['var(--color-accent-500)', 'none', 'var(--color-neutral-100)', 1]
              : ['var(--color-accent-400)', 'var(--color-accent-800)', 'var(--color-neutral-100)', 1];
            return {
              num: sl.num, left: sl.aM * ppm, width: Math.max(3, (sl.bM - sl.aM + 1) * ppm - 2),
              vb: sl.vb, p1: P.p1, p2: P.p2, p3: P.p3, f1: F[0], f2: F[1], f3: F[2], o1: F[3],
              border: isSel ? 'var(--color-accent-400)' : 'var(--color-accent-700)',
              glow: isSel ? '0 0 0 1px var(--color-accent-400), 0 0 10px color-mix(in srgb,var(--color-accent) 35%,transparent)' : 'none',
              tip: stem.name + ' slice ' + sl.num,
              onClick: (e) => { e.stopPropagation(); set({ sel: { stemId: stem.id, num: sl.num, regionIdx: sl.region.idx } }); },
              onDbl: (e) => { e.stopPropagation(); this.audition({ stemId: stem.id, num: sl.num }); },
            };
          }),
        };
      });
      // selection detail
      vals.hasSel = false; vals.noSel = true;
      if (S.sel) {
        const sd = a.stemData.find(x => x.id === S.sel.stemId), stem = S.stems.find(x => x.id === S.sel.stemId);
        const sl = sd && sd.slices.find(x => x.num === S.sel.num);
        if (sl && stem) {
          vals.hasSel = true; vals.noSel = false;
          vals.selTitle = stem.name + ' · Slice ' + sl.num;
          vals.selRegion = String(sl.region.idx).padStart(2, '0') + (sl.region.name ? ' ' + sl.region.name.toUpperCase() : '') + ' (' + sl.region.bp + ')';
          vals.selFromBar = sl.aM + 1;
          vals.selTrig = sl.trig;
          vals.selSamples = (sl.bM - sl.aM + 1) + ' bars · smp ' + sl.start.toLocaleString() + '–' + sl.end.toLocaleString();
          vals.onAudition = () => this.audition(S.sel);
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
      const notices = a.warnings.filter(w => /silent|64/.test(w)).map(t => ({ text: t }));
      vals.exportNotices = notices; vals.hasExportNotices = notices.length > 0;
      vals.fileCards = S.stems.map((stem, i) => {
        const sd = a.stemData.find(x => x.id === stem.id), n = sd ? sd.slices.length : 0;
        const base = this.fileBase(stem, i);
        const bytes = 44 + (sd ? sd.totalFrames : 0) * stem.bytesPerFrame;
        return {
          num: i + 1, stemName: stem.name,
          sliceLabel: n ? n + (n > 64 ? ' slices (64 kept)' : ' slices') : 'silent — skipped',
          wavName: base + '.wav', otName: base + '.ot',
          size: bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024 | 0) + ' KB',
          onWav: () => n && this.download(base + '.wav', this.buildWav(sd, stem)),
          onOt: () => n && this.download(base + '.ot', this.buildOt(sd)),
        };
      }).filter((f, i) => { const sd = a.stemData.find(x => x.id === S.stems[i].id); return sd; });
      const totB = vals.fileCards.reduce((s, f) => { const sd = a.stemData.find(x => x.id === S.stems[f.num - 1].id); return s + (sd && sd.slices.length ? 44 + sd.totalFrames * S.stems[f.num - 1].bytesPerFrame + 832 : 0); }, 0);
      const nF = vals.fileCards.filter(f => !/silent/.test(f.sliceLabel)).length;
      vals.exportSummary = nF * 2 + ' files · ' + (totB / 1048576).toFixed(1) + ' MB total';
      vals.onZip = this.exportZip; vals.zipBusy = S.zipBusy;
      vals.zipLabel = S.zipBusy ? 'Packing ZIP…' : 'Download all (ZIP)';
      vals.goProject = () => set({ step: 'project' });
    }
    // project
    vals.dirInputRef = el => this.di = el;
    vals.onPickProject = () => this.di && this.di.click();
    vals.onProjectInput = this.onProjectInput;
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
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
