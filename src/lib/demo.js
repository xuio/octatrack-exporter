// Demo song synthesis — generates stems + arrangement MIDI entirely client-side
// and feeds them through the real WAV/MIDI ingestion path.
import { SR, boundariesFor } from './constants.js';
import { encodeWav16 } from './wav.js';

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
