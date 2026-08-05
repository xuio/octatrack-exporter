# OSSC — Octatrack Stem Slice Creator

Turn a song's stems + an arrangement MIDI file into a fully prepared **Elektron Octatrack** project: sliced sample chains, `.ot` slice grids, and pattern-programmed bank files — entirely in the browser. Nothing is uploaded; all audio and project data stay client-side.

**Live app: <https://xuio.github.io/octatrack-exporter/>**

## What it does

1. **Files** — drop 5–6 stereo WAV stems (44.1 kHz, 16/24-bit; other formats are converted) plus one MIDI file containing a note at each section start and a final note at the song's end. Drop loose files, a whole folder, or a `.zip` — anywhere on the pane. A synthesized demo song is built in if you just want to try it.
2. **Tempo** — confirm the session BPM (detected from the MIDI file name or tempo event). Every cut is computed from it.
3. **Regions** — each MIDI-marked section becomes one Octatrack pattern, starting at Bank 2 (Bank 1 stays free). Section length picks the pattern scale: ≤4 bars → 1x, ≤8 → 1/2x, ≤16 → 1/4x, ≤32 → 1/8x (16/8/4/2 trig keys per bar).
4. **Results** — a DAW-style timeline: automatic per-measure silence trimming (threshold adjustable live), then edit by hand like a video editor — drag a slice's edges to trim it (bar-quantized, because trigs live on the bar grid), delete slices you don't want, click a dashed placeholder to add one back, and undo/redo any of it (⌘Z / ⇧⌘Z). Edits are audible immediately: trimming while playing re-cues the transport in place. A slice may be expanded past its own section — its trig then moves to the pattern that owns its first bar, which the UI and the pattern sheet both call out. Also: whole-song overview strip for jumping, draggable playhead, pinch/⌘-scroll zoom with waveform detail that grows as you zoom, follow-the-playhead toggle, dBFS meters with an Ableton-style red zone and 0 dBFS line, triggered oscilloscopes and spectrum analyzers, region looping that can be released without interrupting playback, exclusive solo (shift-click to solo several tracks), resizable track column and track heights, and seven colour schemes.
5. **Export** — per-stem WAV chains (one slice per region, silence removed) + 832-byte `.ot` sidecars with the slice grid, as single files or one ZIP.
6. **Project builder** — drop (or pick) a default project folder saved from your Octatrack, or a `.zip` of one, and get back a ready-to-play copy under a name you choose:
   - stem WAVs + `.ot` files placed **inside the project folder**
   - `project.work`: Static slots 1–N assigned (timestretch off, trig quantize direct) and the **project tempo** set to the song BPM
   - `markers.work`: trim + slice grid written per slot (so slices appear without reloading samples)
   - `bank02+.work`: one sample trig per stem/region with the slice p-locked via STRT (no sample locks — tracks play their TRK DEFAULT sample), per-track scale with **master length INF** at master scale 1x, checksums recomputed
   - parts/scenes are never touched — byte-identity of the part region is verified after every bank write; on any structural mismatch the bank is copied unchanged
   - a printable `PATTERNS.html` sheet documents everything (and doubles as the manual fallback)

   One-time step on the device afterwards: assign a STATIC machine on each used track and set its default sample (TRK DEFAULT) to the matching slot.

## Development

```bash
npm install
npm run dev       # local dev server
npm test          # binary-writer tests (node --test, no browser needed)
npm run build     # production build to dist/
```

Pushing to `main` runs tests, builds, and deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Project structure

```
src/
  main.jsx               entry point
  App.jsx                application state, audio engine (Web Audio), view model
  components/            presentational components, one per step
    Header.jsx           step navigation
    FilesStep.jsx        stem/MIDI intake + demo loader
    TempoStep.jsx        BPM confirmation
    RegionsStep.jsx      region → pattern table
    ResultsStep.jsx      transport, timeline, table view
    ExportStep.jsx       per-stem WAV/.ot downloads + ZIP
    ProjectStep.jsx      project-folder builder
  lib/                   pure, DOM-free core (unit-testable in Node)
    constants.js         sample rate + tempo math
    wav.js               WAV parse/encode (+conversion to 44.1k stereo)
    midi.js              MIDI parse, regions, pattern scale rules
    analysis.js          per-measure peaks, silence trim, waveform paths
    slices.js            slice building: auto-trim + manual trim/delete edits
    unzip.js             ZIP reading for archive uploads
    dnd.js               drag-and-drop intake (files, folders, archives)
    meters.js            dBFS meter scaling
    otFile.js            .ot sidecar writer
    zip.js               store-only ZIP + CSV
    projectFile.js       project.work parse/write (slots + tempo)
    bankFile.js          bank??.work pattern writer (trigs, p-locks, scales)
    markersFile.js       markers.work writer (slot trim + slice grids)
    demo.js              demo song synthesis
  styles/
    tokens.css           Nocturne design tokens + component classes
    themes.css           colour schemes (OKLCH ramps generated per theme)
    app.css              app-level styles
tests/                   node --test suite for the binary writers
docs/
  notes-formats.md       Octatrack file-format notes (incl. device-verified corrections)
  OSSC_Specification_2_6.md   original product spec
```

## Audio integrity

OSSC never changes level. Stems that are already 44.1 kHz stereo 16/24-bit are copied **byte-for-byte** into the exported chain — no normalization, gain staging, dithering or compression anywhere in the path; conversion only happens for formats the Octatrack can't load (other sample rates, mono, 32-bit float), and even then it is a straight format conversion. Every gain the device reads is unity: `GAIN=48` on each Static slot (the 0 dB point of the 0–96 = −24…+24 dB range) and gain 48 in the `.ot` sidecar, with timestretch off so nothing is resampled on playback. The VOL slider is monitoring only and never reaches the exported files. [tests/audio-integrity.test.js](tests/audio-integrity.test.js) asserts all of this, including sample-exact equality between source and export.

## File-format credits & caveats

Binary layouts for `bank??.work` / `markers.work` are based on format **facts** documented by [ot-tools-io](https://gitlab.com/ot-tools/ot-tools) (GPL v3 — no code ported) and the `.ot` layout on [OctaChainer](https://github.com/KaiDrange/OctaChainer); several details were corrected through on-device verification and are recorded in [docs/notes-formats.md](docs/notes-formats.md) — notably the trig-mask byte order and the STRT-knob slice encoding. Verified against **Octatrack OS 1.40** (bank data v23, markers v4) only; the writers refuse to touch files whose structure doesn't match. Always keep a backup of your CF card and verify the first generated project on the device.

Not affiliated with Elektron. Octatrack is a trademark of Elektron Music Machines.
