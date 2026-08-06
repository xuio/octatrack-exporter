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

  // The app's ceiling in one song: the Octatrack's 8 audio tracks against the
  // 64 sections that fill Banks 2–5. It exists to be measured, not listened to
  // — scripts/perf.mjs drives it, and it doubles as a scale regression harness.
  stress: {
    label: 'Stress · 8×64', abbrev: 'STRESS', bpm: 150, file: 'Stress_150.mid', stress: true,
    stems: ['DRUMS', 'BASS', 'RHYTHM', 'PADS', 'VOCALS', 'PERC', 'FX', 'LEAD'],
    // 64 sections of 1–4 bars → 120 bars ≈ 3:12 at 150 BPM. Long enough that
    // waveform work is real, short enough that 8 stems still fit in memory.
    lens: [2, 1, 2, 4, 1, 2, 2, 1],
    sections: 64,
    roots: [45, 41, 48, 43],
  },
};

export const DEMO_LIST = Object.keys(DEMOS)
  .map(id => ({ id, label: DEMOS[id].label, bpm: DEMOS[id].bpm, stress: !!DEMOS[id].stress }));

export function makeDemo(id) {
  const cfg = DEMOS[id] || DEMOS.shake;
  if (cfg.stress) return makeStress(cfg);
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
    return { name: stem + '.wav', data: toWav(L, R, frames) };
  });
  return { files, midi: { name: cfg.file, data: writeMidi(480, bpm, starts) }, regionNames: names, abbrev: cfg.abbrev, label: cfg.label };
}

function toWav(L, R, frames) {
  const pcm = new Uint8Array(frames * 4), dv = new DataView(pcm.buffer);
  for (let i = 0; i < frames; i++) {
    dv.setInt16(i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
    dv.setInt16(i * 4 + 2, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
  }
  return encodeWav16(pcm);
}

// A cheap deterministic hash — the stress song has to come out identical every
// run for before/after numbers to compare, so nothing here may use Math.random
// to decide *structure*. (Noise inside a hit still can; it only affects bytes.)
const hash01 = (a, b) => {
  let h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The worst case: 8 stems × 64 sections. Each stem drops out of some sections
 * and starts or ends late inside others, so the automatic silence trim has real
 * work to do on every one of the ~500 clips, and the content changes per section
 * so no two bars of waveform are the same.
 */
function makeStress(cfg) {
  const { bpm, stems: names, lens, sections, roots: ROOTS } = cfg;
  const regionBars = Array.from({ length: sections }, (_, i) => lens[i % lens.length]);
  const starts = [0]; regionBars.forEach(b => starts.push(starts[starts.length - 1] + b));
  const total = starts[sections], bounds = boundariesFor(bpm, total), frames = bounds[total];
  const spb = 60 / bpm;
  const regionNames = regionBars.map((_, i) => `S${String(i + 1).padStart(2, '0')}`);

  const files = names.map((stem, k) => {
    const L = new Float32Array(frames), R = new Float32Array(frames);
    const panL = 0.8 + hash01(k, 91) * 0.4, panR = 1.2 - hash01(k, 91) * 0.4;
    for (let si = 0; si < sections; si++) {
      if (hash01(si, k * 31 + 7) < 0.12) continue;              // stem sits this section out
      const len = regionBars[si];
      const lead = Math.floor(hash01(si, k) * Math.min(2, len));
      const tail = len - lead > 1 ? Math.floor(hash01(si, k + 977) * 2) : 0;
      const b0 = starts[si] + lead, b1 = starts[si + 1] - Math.min(tail, len - lead - 1);
      const root = ROOTS[(si + k) % 4] + (si % 3) * 2, fr = mtof(root);
      // The timbre knob per section: nothing repeats bar-for-bar across the song.
      const bright = 0.4 + hash01(si, k + 13) * 0.6, dense = hash01(si, k + 29);
      for (let bar = b0; bar < b1; bar++) {
        const f0 = bounds[bar], f1 = bounds[bar + 1];
        for (let i = f0; i < f1; i++) {
          const t = (i - f0) / SR, tg = i / SR, beat = t / spb, bi = Math.floor(beat) & 3;
          const tb = (beat - Math.floor(beat)) * spb;           // into the beat
          const t8 = (beat * 2 - Math.floor(beat * 2)) * spb / 2;
          const t16 = (beat * 4 - Math.floor(beat * 4)) * spb / 4;
          let s = 0;
          switch (k) {
            case 0:  // DRUMS — kick, snare, hats: the transient-heavy one
              s = Math.sin(6.283 * (46 + 95 * Math.exp(-tb * 20)) * tb) * Math.exp(-tb * 9) * 0.85;
              if (bi === 1 || bi === 3) s += (Math.random() * 2 - 1) * Math.exp(-tb * 20) * 0.5;
              s += (Math.random() * 2 - 1) * Math.exp(-t16 * 120) * 0.14 * bright;
              break;
            case 1:  // BASS
              s = (2 * ((fr / 2 * tg) % 1) - 1) * Math.exp(-t8 * 5) * 0.5;
              break;
            case 2:  // RHYTHM — off-beat chord stabs
              if (Math.floor(beat * 2) % 2 === 1) {
                s = (Math.sin(6.283 * mtof(root + 12) * t8) + Math.sin(6.283 * mtof(root + 19) * t8)) * 0.16 * Math.exp(-t8 * 8);
              }
              break;
            case 3:  // PADS — sustained, so trimming has a long tail to find
              s = (Math.sin(6.283 * mtof(root + 12) * tg) + Math.sin(6.283 * (mtof(root + 19) + 0.4) * tg)) * 0.09;
              break;
            case 4: { // VOCALS — a slow melody with vibrato
              const n = root + 24 + ((si + Math.floor(beat / 2)) % 5) * 2;
              const tn = t - Math.floor(beat / 2) * 2 * spb;
              s = Math.sin(6.283 * mtof(n) * (1 + 0.012 * Math.sin(6.283 * 5.2 * tn)) * tn)
                * Math.min(1, tn / 0.05) * Math.exp(-tn * 1.3) * 0.3;
              break;
            }
            case 5:  // PERC — 16th noise bursts, density set per section
              if (hash01(si * 97 + Math.floor(beat * 4), k) < 0.35 + dense * 0.4) {
                s = (Math.random() * 2 - 1) * Math.exp(-t16 * 70) * 0.3;
              }
              break;
            case 6:  // FX — a filtered sweep across the section
              s = Math.sin(6.283 * (200 + 1800 * ((bar - b0) / Math.max(1, b1 - b0))) * tg) * Math.exp(-tb * 1.2) * 0.12;
              break;
            default: // LEAD — square-ish arp on 8ths
              s = (((mtof(root + 24 + (Math.floor(beat * 2) % 4) * 3) * tg) % 1) < 0.5 ? 0.16 : -0.16)
                * Math.exp(-t8 * 6) * bright;
          }
          L[i] += s * panL * 0.55; R[i] += s * panR * 0.55;
        }
      }
    }
    return { name: stem + '.wav', data: toWav(L, R, frames) };
  });

  return { files, midi: { name: cfg.file, data: writeMidi(480, bpm, starts) }, regionNames, abbrev: cfg.abbrev, label: cfg.label };
}

function writeMidi(ppq, bpm, measures) {
  const ev = [];
  // variable-length quantity: 7 bits per byte, high bit set on all but the last
  const vlq = (n) => {
    const bytes = [n & 127];
    let rest = n >> 7;
    while (rest > 0) { bytes.unshift((rest & 127) | 128); rest >>= 7; }
    return bytes;
  };
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
