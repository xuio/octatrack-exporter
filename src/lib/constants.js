// Shared audio/tempo math. Everything in OSSC runs at the Octatrack's native rate.
export const SR = 44100;
export const spmFor = bpm => SR * 240 / bpm; // samples per 4/4 measure (fractional)
export const boundariesFor = (bpm, count) => { const spm = spmFor(bpm), a = new Float64Array(count + 1); for (let n = 0; n <= count; n++) a[n] = Math.round(n * spm); return a; };
export const dbToLin = db => Math.pow(10, db / 20);
export const linToDb = v => v <= 1e-9 ? -180 : 20 * Math.log10(v);
