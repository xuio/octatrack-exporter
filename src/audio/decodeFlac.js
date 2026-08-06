// FLAC intake. Unlike WAV and AIFF there is no small honest parser for FLAC —
// it is LPC + Rice coding — so this leans on the browser's own decoder, which
// every current engine ships.
//
// The one thing worth being careful about: decodeAudioData resamples to the
// context's rate. Rather than let an unknown resampler touch the audio, the
// STREAMINFO header is read first and the context is created at the file's own
// rate, so decoding is a straight decode; any rate conversion afterwards goes
// through OSSC's own band-limited resampler like every other format.
//
// This is the one decoder that cannot run in the audio worker — OfflineAudioContext
// is not exposed there — so it runs on the main thread.
import { SR, finalizeStereo } from '../lib/index.js';

/**
 * Read STREAMINFO, which FLAC requires to be the first metadata block. Returns
 * null when the file is not FLAC or the block is missing.
 */
export function flacStreamInfo(buf) {
  const u8 = new Uint8Array(buf);
  if (u8.length < 42) return null;
  if (u8[0] !== 0x66 || u8[1] !== 0x4C || u8[2] !== 0x61 || u8[3] !== 0x43) return null; // "fLaC"
  if ((u8[4] & 0x7F) !== 0) return null;                                                 // block type 0 = STREAMINFO
  const sampleRate = (u8[18] << 12) | (u8[19] << 4) | (u8[20] >> 4);
  const channels = ((u8[20] >> 1) & 0x07) + 1;
  const bits = (((u8[20] & 1) << 4) | (u8[21] >> 4)) + 1;
  if (!sampleRate) return null;
  return { sampleRate, channels, bits };
}

export async function decodeFlac(buf, fileName) {
  const info = flacStreamInfo(buf);
  if (!info) throw new Error(`${fileName}: not a FLAC file (no STREAMINFO header)`);

  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Ctx) throw new Error(`${fileName}: this browser cannot decode FLAC — convert it to WAV first`);

  // Decoding at the file's own rate means the browser never resamples. Very high
  // rates are outside what some engines will construct a context at; those fall
  // back to 44.1 kHz, which is where the audio has to end up anyway.
  let ctx;
  try { ctx = new Ctx(1, 1, info.sampleRate); } catch { ctx = new Ctx(1, 1, SR); }

  let audio;
  try {
    audio = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error(`${fileName}: this browser could not decode the FLAC data`);
  }

  const channels = audio.numberOfChannels;
  const chL = audio.getChannelData(0);
  const chR = channels >= 2 ? audio.getChannelData(1) : chL;

  const out = finalizeStereo({
    chL,
    // getChannelData hands back live views; copy the mono case so both channels
    // are independent arrays, as every other decoder returns.
    chR: channels >= 2 ? chR : chL.slice(),
    sampleRate: audio.sampleRate,
    channels,
    targetRate: SR,
    srcBits: info.bits,
  });

  return {
    fileName, frames: out.chL.length, bits: out.bits, bytesPerFrame: out.bits / 8 * 2,
    chL: out.chL, chR: out.chR, pcm: out.pcm, warnings: out.warnings, converted: true,
    origSr: info.sampleRate, origBits: info.bits, origCh: channels,
  };
}
