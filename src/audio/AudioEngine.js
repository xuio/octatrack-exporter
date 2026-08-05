import { SR } from '../lib/constants.js';

const SWITCH_LEAD = 0.05;   // seconds of headroom when re-cueing mid-playback
const START_LEAD = 0.12;    // headroom before a fresh start
const LOOP_HORIZON = 1.2;   // how far ahead loop iterations are scheduled

/**
 * The Web Audio side of OSSC, deliberately free of React and of musical units:
 * it deals in samples and in a "program" (which slices each track plays), and
 * knows nothing about bars, patterns or the UI.
 *
 * Playback is scheduled ahead of time rather than streamed, so any change to
 * the program while running is handled by re-cueing from the current position
 * (`reschedule`) — which is what makes slice edits audible immediately.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.masterAnalyser = null;
    this.bus = null;
    this.analysers = new Map();
    this.gains = new Map();
    this.buffers = new Map();
    this.sources = [];
    this.tracks = [];           // [{ id, chL, chR, frames, slices, audible }]
    this.playing = false;
    this.loop = null;           // { start, end, len } in samples
    this.volume = 0.85;
    this.onStop = null;         // called when linear playback runs off the end
  }

  // ---------- graph ----------
  context() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: SR });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 2048;
      this.master.connect(this.masterAnalyser);
      this.bus = this.ctx.createGain();
      this.bus.connect(this.master);
    }
    return this.ctx;
  }

  analyserFor(id) {
    if (!this.analysers.has(id)) {
      const an = this.context().createAnalyser();
      an.fftSize = 4096;
      an.smoothingTimeConstant = 0.72;
      an.minDecibels = -95;
      an.maxDecibels = -10;
      this.analysers.set(id, an);
    }
    return this.analysers.get(id);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Replace what each track plays. Takes effect immediately when running. */
  setProgram(tracks) {
    this.tracks = tracks;
    if (this.ctx) this.syncGains();
    if (this.playing) this.reschedule();
  }

  /** Apply mute/solo without disturbing playback. */
  setAudible(tracks) {
    this.tracks = tracks;
    if (this.ctx) this.syncGains();
  }

  syncGains() {
    const ctx = this.context(), t = ctx.currentTime;
    for (const track of this.tracks) {
      let g = this.gains.get(track.id);
      if (!g) {
        g = ctx.createGain();
        g.connect(this.bus);
        g.connect(this.analyserFor(track.id));
        this.gains.set(track.id, g);
        g.gain.value = track.audible ? 1 : 0;
      } else {
        g.gain.setTargetAtTime(track.audible ? 1 : 0, t, 0.015);
      }
    }
  }

  bufferFor(track) {
    if (!this.buffers.has(track.id)) {
      const b = this.context().createBuffer(2, track.frames, SR);
      b.copyToChannel(track.chL, 0);
      b.copyToChannel(track.chR, 1);
      this.buffers.set(track.id, b);
    }
    return this.buffers.get(track.id);
  }

  releaseBuffers() { this.buffers.clear(); }

  // ---------- scheduling ----------
  playSource(track, when, offset, duration) {
    const src = this.context().createBufferSource();
    src.buffer = this.bufferFor(track);
    src.connect(this.gains.get(track.id));
    src.onended = () => {
      const i = this.sources.indexOf(src);
      if (i >= 0) this.sources.splice(i, 1);
    };
    src.start(when, offset, duration);
    this.sources.push(src);
  }

  /** Every slice from `fromSample` onwards, laid out on the timeline. */
  scheduleLinear(fromSample, when) {
    for (const track of this.tracks) {
      if (!this.gains.has(track.id)) continue;
      for (const slice of track.slices) {
        if (slice.end <= fromSample) continue;
        const skip = Math.max(0, fromSample - slice.start);
        this.playSource(track, when + Math.max(0, slice.start - fromSample) / SR,
          (slice.start + skip) / SR, (slice.frames - skip) / SR);
      }
    }
  }

  /** One pass of the loop region. Anything already in the past is trimmed. */
  scheduleLoopIteration(k) {
    const { start, end, len } = this.loop, now = this.ctx.currentTime;
    for (const track of this.tracks) {
      if (!this.gains.has(track.id)) continue;
      for (const slice of track.slices) {
        const from = Math.max(slice.start, start), to = Math.min(slice.end, end);
        if (to <= from) continue;
        let when = this.loopT0 + (k * len + (from - start)) / SR;
        let offset = from / SR, duration = (to - from) / SR;
        if (when + duration <= now) continue;
        if (when < now) { const skip = now - when; offset += skip; duration -= skip; when = now; }
        this.playSource(track, when, offset, duration);
      }
    }
  }

  pumpLoop = () => {
    if (!this.loop || !this.ctx) return;
    const elapsed = this.ctx.currentTime - this.loopT0;
    while (this.nextIteration * this.loop.len / SR < elapsed + LOOP_HORIZON) {
      this.scheduleLoopIteration(this.nextIteration);
      this.nextIteration++;
    }
    clearTimeout(this.pumpTimer);
    this.pumpTimer = setTimeout(this.pumpLoop, 200);
  };

  stopSources({ fade = false, at = null } = {}) {
    const srcs = this.sources;
    this.sources = [];
    const when = at ?? (this.ctx ? this.ctx.currentTime + (fade ? 0.02 : 0) : 0);
    for (const s of srcs) { try { s.stop(when); } catch { /* already stopped */ } }
    clearTimeout(this.pumpTimer);
  }

  // ---------- transport ----------
  play({ from = 0, loop = null } = {}) {
    const ctx = this.context();
    ctx.resume();
    this.stopSources();
    this.syncGains();
    const t0 = ctx.currentTime + START_LEAD;
    this.anchorTime = t0;
    this.playing = true;
    if (loop) {
      this.loop = { ...loop, len: loop.end - loop.start };
      this.anchorSample = loop.start;
      this.loopT0 = t0;
      this.nextIteration = 0;
      this.pumpLoop();
    } else {
      this.loop = null;
      this.anchorSample = from;
      this.scheduleLinear(from, t0);
    }
  }

  stop() {
    this.stopSources({ fade: true });
    this.loop = null;
    this.playing = false;
  }

  /** Current playback position in samples. */
  position(fallback = 0) {
    if (!this.playing || !this.ctx) return fallback;
    if (this.loop) {
      const elapsed = this.ctx.currentTime - this.loopT0;
      if (elapsed >= 0) return this.loop.start + ((elapsed * SR) % this.loop.len);
    }
    return this.anchorSample + Math.max(0, this.ctx.currentTime - this.anchorTime) * SR;
  }

  /** Re-cue the same position with the current program (after an edit). */
  reschedule() {
    if (!this.playing || !this.ctx) return;
    const at = this.ctx.currentTime + SWITCH_LEAD;
    this.stopSources({ at });
    if (this.loop) {
      this.nextIteration = Math.max(0, Math.floor((at - this.loopT0) * SR / this.loop.len));
      this.pumpLoop();
    } else {
      const pos = this.anchorSample + (at - this.anchorTime) * SR;
      this.anchorSample = pos;
      this.anchorTime = at;
      this.scheduleLinear(pos, at);
    }
  }

  /**
   * Start looping a region that the playhead is already inside, without
   * interrupting it: what is sounding plays on and wraps at the region's end.
   * Returns false when the playhead is elsewhere, so the caller can restart.
   */
  joinLoop(start, end) {
    if (!this.playing || this.loop || !this.ctx) return false;
    const pos = this.position();
    if (pos < start || pos >= end) return false;
    this.loop = { start, end, len: end - start };
    this.loopT0 = this.anchorTime + (end - this.anchorSample) / SR;
    this.nextIteration = 0;
    this.stopSources({ at: this.loopT0 });
    this.pumpLoop();
    return true;
  }

  /** Leave the loop but keep playing straight on from where it is. */
  releaseLoop() {
    if (!this.playing || !this.loop) { this.loop = null; return null; }
    const at = this.ctx.currentTime + 0.06;
    const { start, len } = this.loop;
    const pos = start + (((at - this.loopT0) * SR) % len);
    this.stopSources({ at });
    this.loop = null;
    this.anchorSample = pos;
    this.anchorTime = at;
    this.scheduleLinear(pos, at);
    return pos;
  }

  /** Jump while running. Staying inside the active loop keeps looping. */
  seek(sample) {
    if (!this.playing || !this.ctx) return;
    const at = this.ctx.currentTime + 0.06;
    this.stopSources({ at });
    if (this.loop && sample >= this.loop.start && sample < this.loop.end) {
      this.loopT0 = at - (sample - this.loop.start) / SR;
      this.nextIteration = 0;
      this.pumpLoop();
      return;
    }
    this.loop = null;
    this.anchorSample = sample;
    this.anchorTime = at;
    this.scheduleLinear(sample, at);
  }

  auditionSlice(trackId, slice) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    this.stop();
    const ctx = this.context();
    ctx.resume();
    this.syncGains();
    this.playSource(track, ctx.currentTime + 0.05, slice.start / SR, slice.frames / SR);
  }

  dispose() {
    this.stopSources();
    clearTimeout(this.pumpTimer);
    if (this.ctx) this.ctx.close();
  }
}
