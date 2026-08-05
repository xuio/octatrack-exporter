import { parseWav, makeDemo } from '../lib/index.js';

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

/** Decode a WAV. The input buffer is transferred, so do not reuse it. */
export async function decodeWav(buffer, fileName) {
  const job = client.run('parseWav', { buffer, fileName }, [buffer]);
  if (!job) return parseWav(buffer, fileName);
  try {
    return await job;
  } catch {
    // the buffer is gone with the worker; the caller re-reads the file
    throw new Error(`${fileName}: could not be decoded`);
  }
}

export async function synthesizeDemo(id) {
  const job = client.run('demo', { id });
  if (!job) return makeDemo(id);
  return job;
}
