// OSSC core — WAV/MIDI parsing, slicing math, .ot writer, ZIP, CSV, demo song. Fully client-side.
export const SR = 44100;
export const spmFor = bpm => SR * 240 / bpm; // samples per 4/4 measure (fractional)
export const boundariesFor = (bpm, count) => { const spm = spmFor(bpm), a = new Float64Array(count + 1); for (let n = 0; n <= count; n++) a[n] = Math.round(n * spm); return a; };
export const dbToLin = db => Math.pow(10, db / 20);
export const linToDb = v => v <= 1e-9 ? -180 : 20 * Math.log10(v);

// ---------- WAV ----------
export function parseWav(buf, fileName) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error(fileName + ': not a RIFF/WAVE file');
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off), len = dv.getUint32(off + 4, true);
    if (id === 'fmt ') {
      fmt = { format: dv.getUint16(off + 8, true), channels: dv.getUint16(off + 10, true), sampleRate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
      if (fmt.format === 0xFFFE && len >= 40) fmt.format = dv.getUint16(off + 32, true);
    } else if (id === 'data') { dataOff = off + 8; dataLen = Math.min(len, buf.byteLength - dataOff); }
    off += 8 + len + (len & 1);
  }
  if (!fmt || dataOff < 0) throw new Error(fileName + ': missing fmt/data chunk');
  const { format, channels, sampleRate, bits } = fmt;
  if (!((format === 1 && (bits === 16 || bits === 24 || bits === 32)) || (format === 3 && bits === 32))) throw new Error(fileName + ': unsupported format (' + format + '/' + bits + '-bit)');
  const bpsIn = bits / 8, frameIn = bpsIn * channels, framesIn = Math.floor(dataLen / frameIn);
  const read = (ch, i) => {
    const p = dataOff + i * frameIn + ch * bpsIn;
    if (format === 3) return dv.getFloat32(p, true);
    if (bits === 16) return dv.getInt16(p, true) / 32768;
    if (bits === 24) { let v = u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16); if (v & 0x800000) v |= ~0xFFFFFF; return v / 8388608; }
    return dv.getInt32(p, true) / 2147483648;
  };
  let chL = new Float32Array(framesIn), chR = new Float32Array(framesIn);
  const cR = channels >= 2 ? 1 : 0;
  for (let i = 0; i < framesIn; i++) { chL[i] = read(0, i); chR[i] = cR ? read(1, i) : chL[i]; }
  const warnings = []; let converted = false;
  if (channels === 1) { warnings.push('mono — duplicated to stereo'); converted = true; }
  if (channels > 2) { warnings.push(channels + ' channels — using first two'); converted = true; }
  if (sampleRate !== SR) {
    warnings.push(sampleRate + ' Hz — converted to 44.1 kHz');
    const ratio = sampleRate / SR, n = Math.floor(framesIn / ratio), L = new Float32Array(n), R = new Float32Array(n);
    const cub = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    for (let i = 0; i < n; i++) {
      const x = i * ratio, i1 = Math.floor(x), f = x - i1;
      const i0 = Math.max(0, i1 - 1), i2 = Math.min(framesIn - 1, i1 + 1), i3 = Math.min(framesIn - 1, i1 + 2);
      L[i] = cub(chL[i0], chL[i1], chL[i2], chL[i3], f); R[i] = cub(chR[i0], chR[i1], chR[i2], chR[i3], f);
    }
    chL = L; chR = R; converted = true;
  }
  let outBits = bits === 16 || bits === 24 ? bits : 24;
  if (format === 3 || bits === 32) { warnings.push(bits + '-bit ' + (format === 3 ? 'float' : 'int') + ' — converted to 24-bit'); converted = true; outBits = 24; }
  const frames = chL.length;
  let pcm;
  if (!converted) pcm = u8.slice(dataOff, dataOff + frames * frameIn);
  else { // re-encode stereo 24-bit
    outBits = 24; pcm = new Uint8Array(frames * 6);
    for (let i = 0; i < frames; i++) { w24(pcm, i * 6, chL[i]); w24(pcm, i * 6 + 3, chR[i]); }
  }
  return { fileName, frames, bits: outBits, bytesPerFrame: outBits / 8 * 2, chL, chR, pcm, warnings, converted, origSr: sampleRate, origBits: bits, origCh: channels };
}
function w24(u8, p, v) { let x = Math.max(-1, Math.min(1, v)); x = Math.round(x * 8388607); if (x < 0) x += 16777216; u8[p] = x & 255; u8[p + 1] = (x >> 8) & 255; u8[p + 2] = (x >> 16) & 255; }

export function encodeWav(pcm, bits) {
  const bpf = bits / 8 * 2, out = new Uint8Array(44 + pcm.length), dv = new DataView(out.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  S(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); S(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * bpf, true); dv.setUint16(32, bpf, true); dv.setUint16(34, bits, true);
  S(36, 'data'); dv.setUint32(40, pcm.length, true); out.set(pcm, 44); return out;
}

// ---------- MIDI ----------
export function parseMidi(buf, fileName) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (tag(0) !== 'MThd') throw new Error(fileName + ': not a MIDI file');
  const ntrks = dv.getUint16(10), division = dv.getUint16(12);
  if (division & 0x8000) throw new Error(fileName + ': SMPTE time division not supported');
  let off = 8 + dv.getUint32(4), ticks = [], bpm = null;
  for (let t = 0; t < ntrks && off + 8 <= u8.length; t++) {
    if (tag(off) !== 'MTrk') break;
    const end = off + 8 + dv.getUint32(off + 4); let p = off + 8, abs = 0, run = 0;
    while (p < end) {
      let d = 0, b; do { b = u8[p++]; d = (d << 7) | (b & 127); } while (b & 128);
      abs += d; let st = u8[p];
      if (st < 0x80) st = run; else { p++; run = st; }
      if (st === 0xFF) { const type = u8[p++]; let len = 0; do { b = u8[p++]; len = (len << 7) | (b & 127); } while (b & 128); if (type === 0x51 && bpm === null) bpm = 60000000 / ((u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2]); p += len; }
      else if (st === 0xF0 || st === 0xF7) { let len = 0; do { b = u8[p++]; len = (len << 7) | (b & 127); } while (b & 128); p += len; }
      else { const hi = st & 0xF0, n = (hi === 0xC0 || hi === 0xD0) ? 1 : 2; if (hi === 0x90 && u8[p + 1] > 0) ticks.push(abs); p += n; }
    }
    off = end;
  }
  ticks.sort((a, b) => a - b);
  return { fileName, ppq: division, ticks, bpm: bpm ? Math.round(bpm * 100) / 100 : null, noteCount: ticks.length };
}

export function regionsFromTicks(ticks, ppq) {
  const tpm = ppq * 4; let snapped = 0;
  let measures = ticks.map(t => { const m = Math.round(t / tpm); if (Math.abs(t - m * tpm) > 0) snapped++; return m; });
  measures = [...new Set(measures)].sort((a, b) => a - b);
  if (measures.length < 2) return { error: 'MIDI must contain at least 2 notes (section starts + song end)' };
  const regions = [];
  for (let i = 0; i < measures.length - 1; i++) {
    const idx = i + 1, len = measures[i + 1] - measures[i];
    regions.push({ idx, start: measures[i], end: measures[i + 1], len, name: '', ...bankPattern(idx), scale: scaleFor(len) });
  }
  return { regions, snapped, totalMeasures: measures[measures.length - 1] };
}
export function bankPattern(idx) { const bank = 2 + Math.floor((idx - 1) / 16), pattern = ((idx - 1) % 16) + 1; return { bank, pattern, bp: 'B' + bank + ' P' + pattern }; }
export function scaleFor(len) {
  const m = len <= 4 ? ['1x', 16] : len <= 8 ? ['1/2x', 8] : len <= 16 ? ['1/4x', 4] : len <= 32 ? ['1/8x', 2] : null;
  if (!m) return { ok: false, mult: '—', steps: 0, LEN: 0, MAX: 0, label: '> 32 bars', master: '—' };
  const LEN = m[1] * len, MAX = Math.ceil(LEN / 16) * 16;
  return { ok: true, mult: m[0], steps: m[1], LEN, MAX, label: LEN + '/' + MAX + ' · ' + m[0], master: 'MASTER: ' + String(LEN).padStart(4, '0') + ' · ' + m[0] };
}
export const trigStep = (measureInRegion, steps) => measureInRegion * steps + 1; // measureInRegion 0-based

// ---------- analysis ----------
export function measurePeaks(chL, chR, bounds) {
  const n = bounds.length - 1, peaks = new Float32Array(n);
  for (let m = 0; m < n; m++) {
    const a = bounds[m], b = Math.min(bounds[m + 1], chL.length); let p = 0;
    for (let i = a; i < b; i++) { const l = Math.abs(chL[i]), r = Math.abs(chR[i]); if (l > p) p = l; if (r > p) p = r; }
    peaks[m] = p;
  }
  return peaks;
}
// peaks: linear per global measure; region measures [start,end); returns null or {a,b} global 0-based inclusive
export function trimRegion(peaks, start, end, thLin) {
  let a = -1, b = -1;
  for (let m = start; m < end; m++) if (peaks[m] >= thLin) { a = m; break; }
  if (a < 0) return null;
  for (let m = end - 1; m >= start; m--) if (peaks[m] >= thLin) { b = m; break; }
  return { a, b };
}
export function wavePath(chL, chR, s0, s1, buckets, H) {
  const n = Math.max(2, buckets), len = s1 - s0, mid = H / 2, amp = H / 2 - 1;
  const top = [], bot = [];
  for (let k = 0; k < n; k++) {
    const a = s0 + Math.floor(k * len / n), b = Math.max(a + 1, s0 + Math.floor((k + 1) * len / n));
    let p = 0; const step = Math.max(1, Math.floor((b - a) / 40));
    for (let i = a; i < b; i += step) { const l = Math.abs(chL[i]), r = Math.abs(chR[i]); if (l > p) p = l; if (r > p) p = r; }
    p = Math.min(1, Math.pow(p, 0.75)); // perceptual lift
    top.push(k + ',' + (mid - p * amp).toFixed(1)); bot.push(k + ',' + (mid + p * amp).toFixed(1));
  }
  return 'M0,' + mid + ' L' + top.join(' ') + ' L' + (n - 1) + ',' + mid + ' L' + bot.reverse().join(' ') + ' Z';
}

// ---------- waveform rendering (Pioneer-style band/spectral/bars) ----------
export function waveBands(chL, chR, s0, s1, buckets) {
  const n = Math.max(2, buckets), len = s1 - s0;
  const peak = new Float32Array(n), low = new Float32Array(n), high = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = s0 + Math.floor(k * len / n), b = Math.max(a + 1, s0 + Math.floor((k + 1) * len / n));
    // peak over the bucket (strided is fine for a max)
    const step = Math.max(1, Math.floor((b - a) / 48));
    let pk = 0;
    for (let i = a; i < b; i += step) { const ax = Math.abs((chL[i] + chR[i]) * 0.5); if (ax > pk) pk = ax; }
    // band metrics over a short CONTIGUOUS run so lp/prev see adjacent samples
    const runLen = Math.min(192, b - a), r0 = a + ((b - a - runLen) >> 1);
    let lp = (chL[r0] + chR[r0]) * 0.5, prev = lp, lo = 0, hi = 0;
    for (let i = r0; i < r0 + runLen; i++) {
      const x = (chL[i] + chR[i]) * 0.5;
      lp += 0.055 * (x - lp); // one-pole LP ≈ 400 Hz at 44.1k
      lo += Math.abs(lp); hi += Math.abs(x - prev); prev = x;
    }
    const pkN = Math.min(1, Math.pow(pk, 0.7));
    peak[k] = pkN;
    low[k] = Math.min(pkN, Math.pow(lo / runLen * 2.2, 0.7));
    high[k] = Math.min(pkN, Math.pow(hi / runLen * 3.5, 0.7));
  }
  return { peak, low, high, n };
}
function envPath(vals, n, H, scale) {
  const mid = H / 2, amp = H / 2;
  let top = '', bot = '';
  for (let k = 0; k < n; k++) { const v = Math.min(1, vals[k] * scale) * amp; top += ' ' + k + ',' + (mid - v).toFixed(1); bot = ' ' + k + ',' + (mid + v).toFixed(1) + bot; }
  return 'M0,' + mid + ' L' + top + ' L' + (n - 1) + ',' + mid + ' L' + bot + ' Z';
}
function barsPath(vals, n, H, scale) {
  const mid = H / 2, amp = H / 2;
  let d = '';
  for (let k = 0; k < n; k++) { const v = Math.max(0.02, Math.min(1, vals[k] * scale)) * amp; d += 'M' + k + ',' + (mid - v).toFixed(1) + 'h0.62v' + (2 * v).toFixed(1) + 'h-0.62Z'; }
  return d;
}
export function wavePaths(bands, style, H) {
  const { peak, low, high, n } = bands;
  if (style === 'bars') return { p1: barsPath(peak, n, H, 1), p2: '', p3: barsPath(high, n, H, 0.55) };
  if (style === 'band') return { p1: envPath(peak, n, H, 1), p2: '', p3: '' };
  return { p1: envPath(peak, n, H, 1), p2: envPath(low, n, H, 0.95), p3: envPath(high, n, H, 0.65) }; // spectral
}

// ---------- .ot writer (format per notes-formats.md, verified vs OctaChainer) ----------
export function writeOt(bpm, totalFrames, slices) {
  const buf = new ArrayBuffer(832), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8.set([0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x4D, 0x50, 0x41], 0);
  u8.set([0, 0, 0, 0, 0, 2, 0], 16);
  dv.setUint32(23, Math.round(bpm * 24));
  const beats = Math.round(totalFrames / (SR * 60 / bpm));
  dv.setUint32(27, beats * 25); dv.setUint32(31, beats * 25);
  dv.setUint32(35, 0); dv.setUint32(39, 0); // stretch off, loop off
  dv.setUint16(43, 48); // gain 0 dB
  dv.setUint8(45, 0xFF); // trig quantize: direct
  dv.setUint32(46, 0); dv.setUint32(50, totalFrames); dv.setUint32(54, 0);
  slices.slice(0, 64).forEach((s, i) => { const o = 58 + i * 12; dv.setUint32(o, s.start); dv.setUint32(o + 4, s.end); dv.setUint32(o + 8, 0xFFFFFFFF); });
  dv.setUint32(826, Math.min(slices.length, 64));
  let sum = 0; for (let i = 16; i < 830; i++) sum += u8[i];
  dv.setUint16(830, sum & 0xFFFF);
  return u8;
}

// ---------- ZIP (store) ----------
let CRCT = null;
export function crc32(u8) {
  if (!CRCT) { CRCT = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRCT[i] = c; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), h = new Uint8Array(30 + name.length), dv = new DataView(h.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, dosT, true); dv.setUint16(12, dosD, true); dv.setUint32(14, crc, true);
    dv.setUint32(18, e.data.length, true); dv.setUint32(22, e.data.length, true); dv.setUint16(26, name.length, true);
    h.set(name, 30); parts.push(h, e.data);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosT, true); cv.setUint16(14, dosD, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, off, true); c.set(name, 46); central.push(c);
    off += h.length + e.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
export const toCsv = rows => rows.map(r => r.map(c => { c = String(c ?? ''); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\n');

// ---------- octatrack project.work (text) ----------
export function decodeLatin1(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; }
export function encodeLatin1(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xFF; return u; }
export function parseProjectText(text) {
  const meta = {}; const m = text.match(/\[META\]([\s\S]*?)\[\/META\]/);
  if (m) m[1].split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  const slots = []; const re = /\[SAMPLE\]([\s\S]*?)\[\/SAMPLE\]/g; let mm;
  while ((mm = re.exec(text))) { const o = {}; mm[1].split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); slots.push(o); }
  return { meta, slots, osVersion: (meta.OS_VERSION || '').split(/\s+/).pop() || '', projType: meta.TYPE || '' };
}
// Insert/replace Static slot blocks + set project tempo; everything else stays byte-identical.
// Tempo must match the stems' BPM: slots are written with timestretch off, so a project tempo
// mismatch makes patterns drift against the audio (~0.5 bar over 6-8 bars at 120 vs 111).
export function writeStaticSlots(text, entries, bpm) {
  const used = new Set(entries.map(e => e.slot)); let removed = 0, tempoSet = false;
  if (bpm) text = text.replace(/^TEMPOx24=\d+/m, () => { tempoSet = true; return 'TEMPOx24=' + Math.round(bpm * 24); });
  text = text.replace(/\[SAMPLE\]([\s\S]*?)\[\/SAMPLE\](?:\r\n)*/g, (blk, body) => {
    const s = body.match(/SLOT=(\d+)/);
    if (/TYPE=STATIC/i.test(body) && s && used.has(parseInt(s[1]))) { removed++; return ''; }
    return blk;
  });
  const blocks = entries.map(e => '[SAMPLE]\r\nTYPE=STATIC\r\nSLOT=' + e.slot + '\r\nPATH=' + e.path + '\r\nBPMx24=' + Math.round(e.bpm * 24) + '\r\nTSMODE=0\r\nLOOPMODE=0\r\nGAIN=72\r\nTRIGQUANTIZATION=255\r\n[/SAMPLE]\r\n\r\n').join('');
  const idx = text.lastIndexOf('############################');
  if (idx < 0) return { error: 'unrecognized project.work layout' };
  return { text: text.slice(0, idx) + blocks + text.slice(idx), removed, tempoSet };
}

// ---------- bank pattern writer ----------
// Layout facts from ot-tools-io (GPL v3) docs/source — facts only, no code ported.
// All offsets are runtime-verified against the user's own bank file via the PTRN/TRAC
// section magics before a single byte is written. Parts (where scenes live) are never touched.
const BANK_HDR = [70, 79, 82, 77, 0, 0, 0, 0, 68, 80, 83, 49, 66, 65, 78, 75, 0, 0, 0, 0, 0];
export function writeBankPatterns(src, jobs, bpm) {
  const u8 = new Uint8Array(src);
  for (let i = 0; i < 21; i++) if (u8[i] !== BANK_HDR[i]) return { error: 'bank header mismatch' };
  if (u8[21] !== 23) return { error: 'bank data version ' + u8[21] + ' — verified for version 23 (OS 1.40) only' };
  // locate the 16 patterns via their PTRN....... magic
  const ptrn = [];
  for (let i = 22; i < u8.length - 8 && ptrn.length < 17; i++)
    if (u8[i] === 0x50 && u8[i + 1] === 0x54 && u8[i + 2] === 0x52 && u8[i + 3] === 0x4E && !u8[i + 4] && !u8[i + 5] && !u8[i + 6] && !u8[i + 7]) ptrn.push(i);
  if (ptrn.length < 16 || ptrn[0] !== 22) return { error: 'pattern sections not found where expected' };
  const psize = ptrn[1] - ptrn[0];
  for (let k = 1; k < 16; k++) if (ptrn[k] !== 22 + k * psize) return { error: 'pattern spacing inconsistent' };
  // audio track sections ("TRAC") inside pattern 1
  const a0 = 22 + 8;
  if (!(u8[a0] === 0x54 && u8[a0 + 1] === 0x52 && u8[a0 + 2] === 0x41 && u8[a0 + 3] === 0x43)) return { error: 'first audio track section not at expected offset' };
  let attSize = -1;
  for (let i = a0 + 4; i < 22 + psize - 4; i++) if (u8[i] === 0x54 && u8[i + 1] === 0x52 && u8[i + 2] === 0x41 && u8[i + 3] === 0x43 && u8[i + 8] === 1) { attSize = i - a0; break; }
  if (attSize < 2210) return { error: 'audio track section size not derivable' };
  for (let t = 0; t < 8; t++) { const o = a0 + t * attSize; if (!(u8[o] === 0x54 && u8[o + 3] === 0x43) || u8[o + 8] !== t) return { error: 'audio track section layout mismatch (track ' + (t + 1) + ')' }; }
  // known interior: hdr4+unk4+id1 + masks80 + perTrackScale2 + swing1 + patSettings5 + unk1 = 97; tail: plocks 64×32 + unknown 64×1 + trig-cond 64×R
  const rSize = (attSize - 2210) / 64;
  if (!Number.isInteger(rSize) || rSize < 1 || rSize > 8) return { error: 'unexpected audio track section size ' + attSize };
  const plockRel = attSize - 64 * rSize - 64 - 2048;
  const MASK_BYTE = [7, 6, 5, 4, 3, 2, 1, 0]; // half-page → file byte: fully reversed (byte = 7 - halfpage) — DEVICE-VERIFIED; ot-tools-io's doc claiming h1-before-h2 on pages 2-4 is wrong
  const MULT = { '1x': 2, '1/2x': 4, '1/4x': 5, '1/8x': 6 };
  let trigsWritten = 0, patternsWritten = 0;
  for (const job of jobs) {
    const base = 22 + job.patternIdx * psize, multCode = MULT[job.mult];
    if (multCode === undefined || job.LEN < 2 || job.LEN > 64) continue;
    // pattern tail: scale(6) chain(2) unknown(1) part(1) tempo(2) — scale starts at end-12
    const so = base + psize - 12;
    // per-track mode; master length INF (mult=255, len=255) so each track loops on its own
    // SCALE TRACK length; master scale stays 1x (code 2). Track lengths are set per-track below.
    u8[so] = 255; u8[so + 1] = 255; u8[so + 2] = 2; u8[so + 5] = 1;
    if (bpm) { const t24 = Math.round(bpm * 24); u8[base + psize - 2] = t24 >> 8; u8[base + psize - 1] = t24 & 255; } // pattern tempo (used when pattern-tempo mode is on)
    for (let t = 0; t < 8; t++) {
      const o = base + 8 + t * attSize;
      u8[o + 89] = job.LEN; u8[o + 90] = multCode; // per-track len + scale
      const tj = job.tracks.find(x => x.trackIdx === t);
      if (!tj) continue;
      const mask = new Uint8Array(8);
      for (const tr of tj.trigs) { const s = tr.step - 1; if (s >= 0 && s < 64) mask[MASK_BYTE[s >> 3]] |= 1 << (s & 7); }
      for (let b = 0; b < 8; b++) u8[o + 9 + b] = mask[b]; // trigger trig mask
      for (const tr of tj.trigs) {
        const s = tr.step - 1; if (s < 0 || s > 63) continue;
        const p = o + plockRel + s * 32;
        u8[p + 1] = tr.slice * 2;  // machine param 2 (STRT) p-lock: 0-127 knob, 2 ticks per slice — slice N (0-based) = N*2
        u8[p + 31] = 255;      // no sample lock — trig plays the track's default sample (TRK DEFAULT)
        trigsWritten++;
      }
    }
    patternsWritten++;
  }
  let sum = 0;
  for (let i = 20; i < u8.length - 2; i++) sum = (sum + u8[i]) & 0xFFFF;
  u8[u8.length - 2] = sum >> 8; u8[u8.length - 1] = sum & 255; // big-endian checksum
  return { bytes: u8, psize, attSize, rSize, partsStart: 22 + 16 * psize, trigsWritten, patternsWritten };
}

// ---------- markers.work writer ----------
// Layout verified vs ot-tools-io + its reference hexdump: header[21] "FORM....DPS1SAMP.....",
// version u8=4, then 128 flex + 8 recorder + 128 static SlotMarkers of 784 B each
// (trim_offset u32, trim_end u32, loop_point u32, 64 × {start,end,loop} u32, slice_count u32 — all BIG-endian),
// u16 BE checksum = sum of bytes [16..len-2]. Total 207000 B. Slices show on device via THIS file, not the .ot.
const MARKERS_HDR = [0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x41, 0x4D, 0x50, 0, 0, 0, 0, 0];
export function writeMarkersSlots(src, entries) {
  const u8 = new Uint8Array(src);
  for (let i = 0; i < 21; i++) if (u8[i] !== MARKERS_HDR[i]) return { error: 'markers header mismatch' };
  if (u8[21] !== 4) return { error: 'markers data version ' + u8[21] + ' — verified for version 4 (OS 1.40) only' };
  if (u8.length !== 22 + 264 * 784 + 2) return { error: 'unexpected markers file size ' + u8.length };
  const dv = new DataView(u8.buffer);
  for (const e of entries) {
    if (e.slot0 < 0 || e.slot0 > 127) continue;
    const off = 22 + (136 + e.slot0) * 784; // 128 flex + 8 recorder slots first
    dv.setUint32(off, 0); dv.setUint32(off + 4, e.totalFrames); dv.setUint32(off + 8, 0);
    for (let j = 0; j < 64; j++) {
      const so = off + 12 + j * 12, sl = e.slices[j];
      dv.setUint32(so, sl ? sl.start : 0); dv.setUint32(so + 4, sl ? sl.end : 0); dv.setUint32(so + 8, sl ? 0xFFFFFFFF : 0); // slice loop off
    }
    dv.setUint32(off + 780, Math.min(64, e.slices.length));
  }
  let sum = 0;
  for (let i = 16; i < u8.length - 2; i++) sum = (sum + u8[i]) & 0xFFFF;
  u8[u8.length - 2] = sum >> 8; u8[u8.length - 1] = sum & 255;
  return { bytes: u8, slotsWritten: entries.length };
}

// ---------- demo song ----------
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
// per stem: region idx (1-based) -> [leadSilentBars, tailSilentBars]
const DEMOS = {
  shake: { label: 'Shake', abbrev: 'Shake', bpm: 111, file: 'Shake_111.mid', bars: [4, 9, 8, 8, 4, 6, 2], names: ['Intro', 'Verse A', 'Chorus', 'Verse B', 'Bridge', 'Chorus 2', 'Outro'], roots: [45, 41, 48, 43], act: {
    DRUMS: { 1: [2, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0], 6: [0, 0], 7: [0, 0] },
    BASS: { 2: [0, 0], 3: [0, 0], 4: [0, 0], 6: [0, 0] },
    RHYTHM: { 2: [4, 0], 3: [0, 0], 4: [0, 0], 5: [0, 0], 6: [0, 0] },
    PADS: { 1: [0, 0], 2: [6, 0], 3: [0, 0], 5: [0, 0], 6: [0, 0], 7: [0, 0] },
    VOCALS: { 2: [2, 0], 3: [0, 0], 4: [0, 2], 6: [0, 0] } } },
};
export const DEMO_LIST = Object.keys(DEMOS).map(id => ({ id, label: DEMOS[id].label, bpm: DEMOS[id].bpm }));
export function makeDemo(id) {
  const cfg = DEMOS[id] || DEMOS.shake;
  const { bpm, bars: regionBars, names, roots: ROOTS, act } = cfg;
  const starts = [0]; regionBars.forEach(b => starts.push(starts[starts.length - 1] + b));
  const total = starts[starts.length - 1], bounds = boundariesFor(bpm, total), frames = bounds[total];
  const spb = 60 / bpm, vshift = ROOTS[0] - 45;
  const files = Object.keys(act).map(stem => {
    const L = new Float32Array(frames), R = new Float32Array(frames), a = act[stem];
    for (let bar = 0; bar < total; bar++) {
      let ri = 0; while (starts[ri + 1] <= bar) ri++;
      const w = a[ri + 1]; if (!w || bar < starts[ri] + w[0] || bar >= starts[ri + 1] - w[1]) continue;
      const b0 = bounds[bar], b1 = bounds[bar + 1], root = ROOTS[bar % 4], fr = mtof(root);
      for (let i = b0; i < b1; i++) {
        const t = (i - b0) / SR, tg = i / SR, beat = t / spb, bi = Math.floor(beat), tb = (beat - bi) * spb;
        let s = 0, panL = 1, panR = 1;
        if (stem === 'DRUMS') {
          s = Math.sin(6.283 * (48 + 90 * Math.exp(-tb * 22)) * tb) * Math.exp(-tb * 9) * 0.85;
          if (bi === 1 || bi === 3) s += (Math.random() * 2 - 1) * Math.exp(-tb * 22) * 0.5;
          const th = (beat * 2 - Math.floor(beat * 2)) * spb / 2;
          s += (Math.random() * 2 - 1) * Math.exp(-th * 90) * 0.18;
        } else if (stem === 'BASS') {
          const te = (beat * 2 - Math.floor(beat * 2)) * spb / 2;
          s = (2 * ((fr / 2 * tg) % 1) - 1) * Math.exp(-te * 5) * 0.5; panL = 0.95; panR = 0.95;
        } else if (stem === 'RHYTHM') {
          const te = (beat * 2 - Math.floor(beat * 2)) * spb / 2, e8 = Math.floor(beat * 2);
          if (e8 % 2 === 1) { [12, 16, 19].forEach(o => { s += Math.sin(6.283 * mtof(root + o) * te) * 0.14; }); s *= Math.exp(-te * 8); }
          panL = 1.1; panR = 0.8;
        } else if (stem === 'PADS') {
          [12, 16, 19, 24].forEach((o, k) => { s += Math.sin(6.283 * (mtof(root + o) + (k - 1.5) * 0.35) * tg) * 0.07; });
          const tr = (i - bounds[starts[ri] + w[0]]) / SR; s *= Math.min(1, tr / 1.2);
          panL = 0.9; panR = 1.05;
        } else { // VOCALS
          const half = Math.floor(beat / 2), seq = [69, 72, 74, 76, 72, 69, 67, 64], n = seq[(bar * 2 + half) % 8] + vshift;
          const tn = t - half * 2 * spb, f = mtof(n) * (1 + 0.012 * Math.sin(6.283 * 5.2 * tn));
          s = (Math.sin(6.283 * f * tn) + 0.35 * Math.sin(6.283 * 2 * f * tn)) * Math.min(1, tn / 0.06) * Math.exp(-tn * 1.4) * 0.3;
        }
        L[i] += s * panL * 0.7; R[i] += s * panR * 0.7;
      }
    }
    const pcm = new Uint8Array(frames * 4), dv = new DataView(pcm.buffer);
    for (let i = 0; i < frames; i++) { dv.setInt16(i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true); dv.setInt16(i * 4 + 2, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true); }
    return { name: stem + '.wav', data: encodeWav16(pcm) };
  });
  return { files, midi: { name: cfg.file, data: writeMidi(480, bpm, starts) }, regionNames: names, abbrev: cfg.abbrev, label: cfg.label };
}
function encodeWav16(pcm) {
  const out = new Uint8Array(44 + pcm.length), dv = new DataView(out.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  S(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); S(8, 'WAVEfmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  S(36, 'data'); dv.setUint32(40, pcm.length, true); out.set(pcm, 44); return out.buffer;
}
function writeMidi(ppq, bpm, measures) {
  const ev = [], vlq = n => { const b = [n & 127]; while (n >>= 7) b.unshift((n & 127) | 128); return b; };
  const us = Math.round(60000000 / bpm);
  ev.push(0, 0xFF, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  let last = 0;
  for (const m of measures) {
    const t = m * ppq * 4;
    ev.push(...vlq(t - last), 0x90, 60, 100); ev.push(...vlq(30), 0x80, 60, 0); last = t + 30;
  }
  ev.push(...vlq(0), 0xFF, 0x2F, 0);
  const trk = new Uint8Array(ev), out = new Uint8Array(22 + trk.length), dv = new DataView(out.buffer);
  const S = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  S(0, 'MThd'); dv.setUint32(4, 6); dv.setUint16(8, 0); dv.setUint16(10, 1); dv.setUint16(12, ppq);
  S(14, 'MTrk'); dv.setUint32(18, trk.length); out.set(trk, 22);
  return out.buffer;
}
