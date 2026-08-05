# Octatrack Stem Slice Creator (OSSC) — Build Specification v2.6

## 0. How to read this spec

This document defines requirements and domain constraints, not implementation decisions. Octatrack format facts, slicing rules, math, and numbering conventions are hard requirements. Anything introduced with "e.g.", concrete UI mechanics, and library names are illustrative. Choose architecture, framework, libraries, rendering, and UX details yourself; research the Elektron file formats independently where possible; where the spec is silent, decide in line with §1 rather than asking.

## 1. Purpose

OSSC is a fully client-side browser app (current Chrome/Firefox, no server, no accounts; no audio or project data leaves the browser). It takes a song's exported stereo stems plus a MIDI file describing the arrangement, and produces per stem one seamless audio file plus a matching Elektron Octatrack `.ot` slice file. It also shows — visually (DAW-style view) and as a table — where each slice goes in the Octatrack patterns so the arrangement can be performed on the device.

## 2. Inputs

Provided via drag & drop:

1. **5–6 stereo WAV stems** (typically DRUMS, BASS, RHYTHM, PADS, VOCALS), 44.1 kHz, 16/24 bit. Other sample rates/bit depths: warn and convert to 44.1 kHz / 24-bit. All stems must have identical length in samples and start at bar 1; on mismatch, error naming the files and lengths. Each WAV is one stem, labeled by filename; the user can reorder stems and edit display names.
2. **One MIDI file** — the arrangement map: one note at the start of every arrangement section plus one final note marking the song's end. Only note start positions matter. Constant tempo, 4/4 only. Fewer than 2 notes, or missing/unparseable → error.
3. **BPM** — pre-filled from a number in the MIDI filename (e.g. `Shake_111.mid` → 111) or the MIDI tempo event if present, but **always confirmed/edited by the user** before processing.

## 3. Core definitions

- **Measure**: one 4/4 bar at the confirmed BPM. `samples_per_measure = sample_rate × (60 / BPM) × 4` — generally fractional. All positions must be computed **cumulatively** from song start and rounded per boundary (`round(n × samples_per_measure)`), never by repeatedly adding a rounded measure length (rounding error would accumulate).
- **Region**: span from one MIDI note to the next; one arrangement section = one Octatrack pattern. N notes → N−1 regions. Regions are numbered 1…N−1 and mapped to patterns starting at **Bank 2** (Bank 1 is reserved for the user's own intro): region 1 → B2 P1, region 16 → B2 P16, region 17 → B3 P1, etc. Regions may be given optional names. Notes not exactly on a bar line are snapped to the nearest measure boundary with a warning.
- **Slice**: the audible portion of one stem within one region, trimmed to measure boundaries (§4). Numbered per stem in playback order, counting only surviving slices.

## 4. Silence analysis and slice trimming

Per stem, each measure of each region is classified: **silent** if its peak level stays below the threshold (default **−60 dBFS**, user-adjustable), else **audible** — reverb/decay tails count as audible and are kept.

Per stem per region: **trim all leading and trailing silent measures; keep silent measures between audible ones; if every measure is silent, that stem has no slice in that region.** All cuts fall exactly on measure boundaries — never inside a measure. A slice whose audio enters mid-measure still starts at that measure's start.

## 5. Octatrack outputs

Per stem:

1. **One seamless WAV**: all slices concatenated in order, no gaps, no crossfades; bit-exact cuts of the (possibly converted) input audio.
2. **One `.ot` file** (same base name): confirmed BPM, trim length = full file length, exact start/end sample of every slice, slice count, correct checksum, slice loop off. Must be compatible with what the Octatrack itself and community tools (e.g. OctaChainer) produce.

**Warnings:** >64 slices per stem (Octatrack limit; export may proceed); region >32 measures (§6). More than 32 regions is allowed (numbering keeps rolling into further banks) with an informational notice. An entirely silent stem produces no files, with a notice.

**Naming:** user enters a song abbreviation; files are `<stem number> <STEM NAME> <abbreviation>.wav/.ot`, e.g. `1 DRUMS Shake.wav`. Export as individual downloads or one ZIP.

## 6. Pattern scale computation (per region)

Each region is one pattern in per-track scale mode:

| Region length (measures) | Multiplier | Steps/measure | LEN |
|---|---|---|---|
| 1–4 | 1x | 16 | 16 × measures |
| 5–8 | 1/2x | 8 | 8 × measures |
| 9–16 | 1/4x | 4 | 4 × measures |
| 17–32 | 1/8x | 2 | 2 × measures |
| > 32 | — | — | warning (not representable as one pattern) |

- **MAX** = LEN rounded up to the next multiple of 16. Display Octatrack-style, e.g. `52/64 · 1/4x`.
- **MASTER LENGTH**: master tempo multiplier = track multiplier, MASTER LENGTH = LEN (e.g. `MASTER: 0052 · 1/4x`), so each chained pattern plays its full region exactly once.
- **Trig step**: slice entering on measure M → `trig_step = (M − 1) × steps_per_measure + 1`; slices starting at region start → step 1.

## 7. User interface

**Flow** (screen structure is free; BPM must be confirmed before processing, results inspectable before export): file input with detected properties and warnings → BPM confirmation → region overview (number, bank/pattern, length, editable name) → analysis → results (DAW view + table) → export.

**DAW-style view**: scrollable, horizontally zoomable timeline; must stay responsive with 6 full-song stems. Top ruler with measure numbers and labeled region blocks (name/number, bank/pattern, length, scale); region boundaries visible across all lanes. One lane per stem with trimmed slices as waveform blocks at exact playback position, labeled with slice numbers; selecting a slice shows its details (stem, slice number, region, start measure, trig step).

**Playback preview**: sample-accurate scheduling of the trimmed slices at their timeline positions, so the user hears the arrangement exactly as the Octatrack will play it. Required: play/stop with following playhead; setting start position (measure-snapped); per-stem mute/solo; auditioning a single slice; master volume. No effects or recording.

**Table view**: regions as columns, stems as rows. Header rows per region: number/name + Bank/Pattern; length in measures; scale (`52/64 · 1/4x`); master (`MASTER: 0052 · 1/4x`). Per stem row: slice number plus trig info when not step 1 (e.g. `Slice 1 · from bar 5 · trig step 17`); empty when silent. Exportable (CSV and/or printable HTML).

## 8. Phase 2 (optional): Octatrack project builder

Goal: also write a ready-to-play Octatrack project, eliminating manual programming.

The user drops in their **own default project folder** (saved from their Octatrack, matching their firmware and carrying their setup — most importantly their scenes). OSSC never modifies it in place; it outputs a modified **copy** (ZIP) to copy onto the CF card.

**Read-modify-write only — scene preservation is a hard requirement:** never generate bank files from scratch. Read the user's bank files, mutate only the fields below, write everything else back byte-for-byte. Scenes and scene locks must survive untouched; after writing, verify scene data is byte-identical to the input and report the result. (Scene locks act on track parameters, so the stem-to-track assignment must match the user's track layout — the stem reordering feature in §2 exists for this.)

**What OSSC writes:**
- **project.work**: each stem WAV assigned to a **Static** sample slot (slots 1…n in stem order; Static machines stream from CF, saving Flex RAM).
- **bank02.work** (+ bank03 beyond 16 regions; bank01 untouched): per pattern — per-track scale settings from §6; part setup with one Static machine per track pointing at the stem's slot; one trig per stem-with-slice on the computed step with a **slice p-lock**; no trig for silent stems.
- All other files copied unchanged. Recompute file checksums.

**Basis:** the .work format is community-reverse-engineered; a known-good starting point is the Rust library **ot-tools-io** (GPL v3, OS 1.40 A/B/C compatible, WASM-compilable) — research current tooling yourself and note license implications. Detect/report the project's OS version and warn on format mismatch. Instruct the user to keep a backup and verify the first generated project on the device. Phase 1 outputs are always produced regardless.

## 9. Technical constraints

- Fully client-side; current Chrome and Firefox.
- Output WAVs bit-exact (no resampling/requantization beyond §2 conversion, no lossy round-trips).
- `.ot` is a fixed 832-byte binary structure (header, tempo, trim/loop settings, 64 slice slots, slice count, 16-bit checksum), community-documented; verify against sources like OctaChainer rather than guessing.
- No persistent storage required beyond the session.

Everything else — framework, audio decode/encode, MIDI parsing, rendering, ZIP, tooling — is the implementer's decision.
