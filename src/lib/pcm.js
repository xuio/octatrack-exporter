// Sample-rate conversion and PCM packing, shared by every input format.
//
// Resampling uses a Kaiser-windowed sinc kernel rather than polynomial
// interpolation. The distinction matters when *downsampling* — the common
// 48 kHz → 44.1 kHz case — because interpolation alone does nothing to remove
// the content above the new Nyquist, so it folds back into the top of the band.
// Here the kernel's cutoff is placed below the lower of the two Nyquist limits,
// so that content is filtered out before the decimation instead of aliasing.
//
// The tradeoff is deliberate and bounded: with these parameters the response is
// flat to roughly 18 kHz, rolls off through the last couple of kHz, and puts
// everything that would alias at least 80 dB down. Every output sample is
// normalized by its own tap-weight sum, which pins DC gain at exactly 1.0 —
// conversion changes the sample rate and nothing else about the level.

const ZC = 24;        // sinc zero crossings kept either side of centre
const PHASES = 512;   // sub-sample resolution of the kernel table
const BETA = 8.6;     // Kaiser β — about 80 dB of stopband attenuation
const CUTOFF = 0.93;  // cutoff as a fraction of the lower Nyquist

/** Modified Bessel function of the first kind, order 0 (for the Kaiser window). */
function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 32; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
    if (term < sum * 1e-12) break;
  }
  return sum;
}

/**
 * The kernel is tabulated in zero-crossing units, which makes it independent of
 * the conversion ratio — one table serves every sample rate, built once.
 */
let TABLE = null;
function kernel() {
  if (TABLE) return TABLE;
  const n = ZC * PHASES;
  const table = new Float64Array(n + 2);
  const denom = besselI0(BETA);
  for (let k = 0; k <= n; k++) {
    const u = k / PHASES;                       // distance in zero crossings
    const sinc = k === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
    const r = u / ZC;
    table[k] = sinc * besselI0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / denom;
  }
  TABLE = table;
  return table;
}

/**
 * Convert one channel between sample rates. Returns the input untouched when
 * the rates already match, so the overwhelmingly common 44.1 kHz case is free.
 */
export function resample(input, srcRate, dstRate) {
  if (srcRate === dstRate) return input;
  const ratio = srcRate / dstRate;                        // source samples per output sample
  const fc = 0.5 * Math.min(1, 1 / ratio) * CUTOFF;       // cutoff in cycles per source sample
  const step = 2 * fc;                                    // zero crossings per source sample
  const half = ZC / step;                                 // kernel half-width in source samples
  const last = input.length - 1;
  const count = Math.floor(input.length / ratio);
  const out = new Float32Array(count);
  const table = kernel();
  const limit = ZC * PHASES;

  for (let i = 0; i < count; i++) {
    const x = i * ratio;
    const lo = Math.max(0, Math.ceil(x - half));
    const hi = Math.min(last, Math.floor(x + half));
    let acc = 0, weight = 0;
    for (let j = lo; j <= hi; j++) {
      const u = Math.abs(x - j) * step * PHASES;
      const k = u | 0;
      if (k >= limit) continue;
      const w = table[k] + (table[k + 1] - table[k]) * (u - k);
      acc += input[j] * w;
      weight += w;
    }
    // Normalizing per output sample keeps unity gain even at the very edges,
    // where the kernel is truncated by the start and end of the material.
    out[i] = weight > 1e-9 ? acc / weight : 0;
  }
  return out;
}

const clamp = v => (v > 1 ? 1 : v < -1 ? -1 : v);

export function encode16(chL, chR) {
  const frames = chL.length, out = new Uint8Array(frames * 4);
  for (let i = 0; i < frames; i++) {
    w16(out, i * 4, chL[i]);
    w16(out, i * 4 + 2, chR[i]);
  }
  return out;
}

export function encode24(chL, chR) {
  const frames = chL.length, out = new Uint8Array(frames * 6);
  for (let i = 0; i < frames; i++) {
    w24(out, i * 6, chL[i]);
    w24(out, i * 6 + 3, chR[i]);
  }
  return out;
}

function w16(u8, p, v) {
  let x = Math.round(clamp(v) * 32768);
  if (x > 32767) x = 32767;
  if (x < 0) x += 65536;
  u8[p] = x & 255; u8[p + 1] = (x >> 8) & 255;
}

function w24(u8, p, v) {
  let x = Math.round(clamp(v) * 8388607);
  if (x < 0) x += 16777216;
  u8[p] = x & 255; u8[p + 1] = (x >> 8) & 255; u8[p + 2] = (x >> 16) & 255;
}

/**
 * Bring decoded channels to the Octatrack's native format: stereo, 44.1 kHz,
 * 16- or 24-bit. Shared by every decoder so all of them warn the same way and
 * go through the same conversion — the caller only has to produce channels.
 *
 * `srcBits` is the source word length, used to keep 16-bit material at 16-bit
 * when nothing else needs converting; `srcBitsLabel` names it in the warning
 * (so 32-bit float can say so rather than looking like 32-bit int).
 */
export function finalizeStereo({ chL, chR, sampleRate, channels, srcBits, srcBitsLabel, targetRate }) {
  const warnings = [];
  let converted = false;

  if (channels === 1) { warnings.push('mono — duplicated to stereo'); converted = true; }
  if (channels > 2) { warnings.push(channels + ' channels — using first two'); converted = true; }

  if (sampleRate !== targetRate) {
    warnings.push(`${sampleRate} Hz — resampled to ${(targetRate / 1000).toFixed(1)} kHz (band-limited, unity gain)`);
    chL = resample(chL, sampleRate, targetRate);
    chR = resample(chR, sampleRate, targetRate);
    converted = true;
  }

  const resampled = sampleRate !== targetRate;
  const bits = !resampled && srcBits === 16 ? 16 : 24;
  if (srcBits !== bits) {
    warnings.push(`${srcBitsLabel || `${srcBits}-bit`} — converted to ${bits}-bit`);
    converted = true;
  }

  return {
    chL, chR, bits, warnings, converted,
    pcm: bits === 16 ? encode16(chL, chR) : encode24(chL, chR),
  };
}
