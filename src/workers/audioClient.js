import { parseWav, parseAiff, makeDemo } from '../lib/index.js';
import { decodeFlac } from '../audio/decodeFlac.js';

/**
 * Promise wrapper around the audio worker, with a same-thread fallback so the
 * app still works where module workers are unavailable.
 */
class AudioClient {
  constructor() {
    this.worker = null;
    this.unavailable = false;
    this.pending = new Map();
    this.nextId = 1;
  }

  ensure() {
    if (this.worker || this.unavailable) return this.worker;
    try {
      this.worker = new Worker(new URL('./audio.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data: { id, result, error } }) => {
        const job = this.pending.get(id);
        if (!job) return;
        this.pending.delete(id);
        if (error) job.reject(new Error(error)); else job.resolve(result);
      };
      this.worker.onerror = () => {
        this.unavailable = true;
        for (const [, job] of this.pending) job.reject(new Error('audio worker failed'));
        this.pending.clear();
      };
    } catch {
      this.unavailable = true;
    }
    return this.worker;
  }

  run(type, payload, transfer = []) {
    const worker = this.ensure();
    if (!worker) return null;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload }, transfer);
    });
  }
}

const client = new AudioClient();

export const AUDIO_RE = /\.(wav|aiff?|flac)$/i;

/**
 * Decode one stem. The input buffer is transferred to the worker, so do not
 * reuse it. FLAC goes through the browser's decoder on this thread — see
 * audio/decodeFlac.js for why it cannot be moved off it.
 */
export async function decodeAudio(buffer, fileName) {
  if (/\.flac$/i.test(fileName)) return decodeFlac(buffer, fileName);
  const local = () => (/\.aiff?$/i.test(fileName) ? parseAiff(buffer, fileName) : parseWav(buffer, fileName));
  const job = client.run('decodeAudio', { buffer, fileName }, [buffer]);
  if (!job) return local();
  try {
    return await job;
  } catch (err) {
    // A decoder error is the file's fault and worth reporting as-is; anything
    // else means the worker died, and the buffer went with it.
    if (err.message.startsWith(fileName)) throw err;
    throw new Error(`${fileName}: could not be decoded`);
  }
}

export async function synthesizeDemo(id) {
  const job = client.run('demo', { id });
  if (!job) return makeDemo(id);
  return job;
}
