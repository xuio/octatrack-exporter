/**
 * The two genuinely multi-second jobs, moved off the main thread: decoding a
 * WAV (which may resample) and synthesizing the demo song.
 *
 * Both *produce* their data, so results are transferred rather than copied and
 * nothing the main thread already holds is detached. Per-measure peaks stay on
 * the main thread — that pass is short, and shipping the channel arrays across
 * would detach the audio the timeline and playback are using.
 */
import { parseWav, makeDemo } from '../lib/index.js';

const handlers = {
  parseWav({ buffer, fileName }) {
    const stem = parseWav(buffer, fileName);
    return { result: stem, transfer: [stem.chL.buffer, stem.chR.buffer, stem.pcm.buffer] };
  },

  demo({ id }) {
    const demo = makeDemo(id);
    return { result: demo, transfer: [...demo.files.map(f => f.data), demo.midi.data] };
  },
};

self.onmessage = ({ data: { id, type, payload } }) => {
  try {
    const handler = handlers[type];
    if (!handler) throw new Error(`unknown job "${type}"`);
    const { result, transfer } = handler(payload);
    // a buffer can appear twice (pcm may alias a channel); postMessage rejects duplicates
    self.postMessage({ id, result }, [...new Set(transfer.filter(Boolean))]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
