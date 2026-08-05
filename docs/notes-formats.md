# .ot format (verified against OctaChainer otwriter.h/.cpp, KaiDrange, Unlicense)
832 bytes, all multi-byte values BIG-endian.
- 0x00 header[16]: 46 4F 52 4D 00 00 00 00 44 50 53 31 53 4D 50 41 ("FORM....DPS1SMPA")
- 0x10 unknown[7]: 00 00 00 00 00 02 00
- 0x17 u32 tempo = round(BPM*24)
- 0x1B u32 trimLen = round(beats)*25  (beats = frames/(44100*60/BPM)) — unit 1/100 bar
- 0x1F u32 loopLen = same
- 0x23 u32 stretch = 0 (off)
- 0x27 u32 loop = 0 (off)
- 0x2B u16 gain = 48 (0 dB; range 0..96 = -24..+24)
- 0x2D u8 quantize = 0xFF direct (0=pattern len, 1..16 = 1..256 steps)
- 0x2E u32 trimStart = 0
- 0x32 u32 trimEnd = total frames
- 0x36 u32 loopPoint = 0
- 0x3A slices[64] × {u32 start, u32 end, u32 loopPoint} — used: loopPoint=0xFFFFFFFF (slice loop off); unused: all zero
- 0x33A u32 sliceCount
- 0x33E u16 checksum = sum of bytes [16..829] mod 65536
OctaChainer quirk: writes slice table only when count>1; we write for count>=1.

# markers.work format (verified vs ot-tools-io 0.11.3 + its reference hexdump — format facts only)
File = 207000 B: header[21] "FORM\0\0\0\0DPS1SAMP\0\0\0\0\0" + version u8=4 + 128 flex + 8 recorder + 128 static SlotMarkers (784 B each) + u16 checksum.
SlotMarkers: trim_offset u32, trim_end u32, loop_point u32 (cannot disable; 0), slices[64]×{trim_start u32, trim_end u32, loop_start u32 (0xFFFFFFFF = slice loop off)}, slice_count u32 — ALL multi-byte fields BIG-endian.
Static slot i (0-based): offset 22 + (136+i)×784. Checksum = u16 sum of bytes [16..len−2], stored big-endian at end.
KEY INSIGHT: the device reads slot slice/trim data from markers.work, NOT from .ot sidecars — .ot is only imported when a sample is loaded into a slot via the file browser. Builder must write markers.work for slices to appear on auto-assigned slots.

# bank??.work format (from ot-tools-io 0.11.3 — format facts, no code ported; GPL v3 source)
Serialization: bincode fixint; virtually all fields u8/byte-arrays. File = BankFile:
- header[21]: "FORM\0\0\0\0DPS1BANK\0\0\0\0\0" (46 4F 52 4D 00×4 44 50 53 31 42 41 4E 4B 00×5)
- datatype_version u8 = 23 (OS 1.40)
- patterns[16] (each starts "PTRN\0\0\0\0" — pattern size derivable at runtime from magic spacing; first at offset 22)
- parts_unsaved[4], parts_saved[4] (PARTS CONTAIN SCENES — plan: never touch parts ⇒ scenes byte-identical by construction)
- parts_saved_state[4], parts_edited_bitmask u8, part_names[4][7], checksum u16 BIG-endian
- checksum = wrapping u16 sum of bytes [20 .. len-2] (note: skips only 20 of the 21 header bytes)

Pattern: header[8] "PTRN\0\0\0\0" + audio_track_trigs[8] + midi_track_trigs[8] + PatternScaleSettings + PatternChainBehavior + unknown u8 + part_assignment u8 (0-based) + tempo_1 u8 + tempo_2 u8 (120bpm = 11/64; 30bpm = 2/208 ⇒ tempo24 = bpm*24 split big-endian: hi=t24>>8, lo=t24&255).

AudioTrackTrigs (starts "TRAC", 8 per pattern, contiguous — size derivable from TRAC magic spacing):
- +0 header[4] "TRAC"; +4 unknown[4]; +8 track_id u8 (0-based)
- +9 AudioTrackTrigMasks (80 bytes): trigger[8], trigless[8], plock[8], oneshot[8], recorder[32], swing[8] (default 0xAA), slide[8]
  Mask byte order FULLY REVERSED by half-pages: bytes = [p4h2, p4h1, p3h2, p3h1, p2h2, p2h1, p1h2, p1h1], i.e. byte = 7 - halfpage — steps 1-8 in the LAST byte, steps 9-16 in the 7th byte; within a byte step position n = bit (n-1) (step1=1, step8=128).
  DEVICE-VERIFIED (2026-08): ot-tools-io's doc comment claims h1-before-h2 within pages 2-4 ([p4h1,p4h2,...]) — that is WRONG; on the device a bit in file byte 4 fires steps 25-32 (p2h2) and byte 5 fires steps 17-24 (p2h1). Trig positions must land on the step matching the p-lock array index (plocks are plain step-indexed, s*32, no reversal).
- +89 TrackPerTrackModeScale (per-track LEN/scale — field layout TBD from patterns/settings.rs)
- then swing_amount u8, TrackPatternSettings (size TBD), unknown u8
- tail (fixed from end of ATT): plocks[64]×32B, unknown_3[64]×1B, trig_offsets_repeats_conditions[64]×sizeof(TROC, TBD)
- AudioTrackParameterLocks (32 B/trig): machine p1..p6, lfo spd1-3 dep1-3, amp atk hold rel vol bal f, fx1 p1-6, fx2 p1-6, flex_slot_id, static_slot_id — 255 = no lock. Slice p-lock = machine.param1? (Static PTCH,STRT... — slice is STRT page param; verify exact param index when writing). static_slot_id p-lock overrides part slot per trig.
Still needed (next research round, via struct pages → sources): patterns/settings.rs (TrackPerTrackModeScale fields, TrackPatternSettings size, PatternScaleSettings incl. scale mode + MASTER len, PatternChainBehavior size), tracks/mod.rs (TROC size), midi.rs (MidiTrackTrigs size).
RESOLVED (settings.rs verified): PatternScaleSettings = 6 u8 [master_len_per_track_multiplier, master_len_per_track (real=(x+1)*(mult+1)), master_scale_per_track, master_len, master_scale, scale_mode (0 normal/1 per-track)]; scale codes: 0=2x 1=3/2x 2=1x 3=3/4x 4=1/2x 5=1/4x 6=1/8x. TrackPerTrackModeScale = 2 u8 [per_track_len (def 16), per_track_scale (def 2)] at ATT+89. TrackPatternSettings = 5 u8 [start_silent(255), plays_free, trig_mode, trig_quant, oneshot_trk]. PatternChainBehavior = 2 u8. So ATT fixed head = 97 B; ATT tail = plocks 64×32 + unknown 64×1 + TROC 64×R; ATT size = 2210+64R with R derived at runtime from TRAC magic spacing. Pattern tail (end-relative): scale6 @-12, chain2 @-6, unknown @-4, part @-3, tempo @-2. Slice p-lock = machine param2 (STRT) at +1 of the 32-byte plock struct; the stored value is the raw 0-127 STRT knob value, which spans the 64 slice positions at 2 ticks per slice ⇒ slice N (1-based) = value (N-1)*2 (device shows slice floor(v/2)+1 — VERIFIED on device: value 4 displayed as Slice 3). Static slot p-lock at +31 (flex at +30). Writer implemented in ossc-core.js writeBankPatterns() with runtime structural guards + parts byte-identity check.
Write strategy: mutate patterns only (no scene risk); require user's default project to carry STATIC machines on used tracks; runtime guards: PTRN/TRAC magic positions + spacing consistency, version 23, recompute checksum; refuse to write on any mismatch.
Scale policy (user requirement): PER TRACK mode with MASTER LENGTH = INF (master_len_per_track_multiplier=255 AND master_len_per_track=255 per ot-tools-io) and master_scale_per_track left at 1x (code 2); pattern length comes ONLY from each track's SCALE TRACK len + TEMPO MULTIPLIER (ATT+89/+90).
Sample policy (user requirement): NO sample-slot p-locks — plock byte +31 written as 255 (no lock) so every trig plays the track's TRK DEFAULT sample; the user assigns slot N as the default sample of track N's STATIC machine (one-time device step).

# project.work format (verified against ot-tools-io 0.11.3 source, GPL v3 — format facts only, no code ported)
Windows-1258 text, \r\n line endings. Sections: [META] (TYPE=OCTATRACK DPS-1 PROJECT, VERSION=19, OS_VERSION=R0177     1.40B), [SETTINGS] (TEMPOx24=...), [STATES], then "# Samples" section of repeated blocks:
[SAMPLE]\r\nTYPE=STATIC|FLEX\r\nSLOT=n (ONE-indexed; flex recorders 129-136)\r\nPATH=file.wav (relative to project dir; ../AUDIO/x.wav = set pool — NOT used: user requires audio inside the project folder)\r\nBPMx24=2880\r\nTSMODE=0|2\r\nLOOPMODE=0\r\nGAIN=72 (default)\r\nTRIGQUANTIZATION=255 (direct)\r\n[/SAMPLE]
File ends with "############################\r\n\r\n" footer. Slots only stored once assigned. Compatible OS: 1.40A/B/C. No checksum on project files.
TEMPO: [SETTINGS] TEMPOx24 (default 2880 = 120 BPM) MUST be set to the stems' BPM — slots use TSMODE=0 (no timestretch), so a tempo mismatch makes audio drift vs patterns (120 vs 111 ≈ 0.5 bar over 6-8 bars). writeStaticSlots patches it; writeBankPatterns also stamps each written pattern's tempo bytes (tail u16 BE = BPM×24, used when pattern-tempo mode enabled).
Bank .work files: binary, community layout via ot-tools-io (GPL v3) — NOT auto-written by OSSC; banks are copied byte-identical (scene preservation) + printable pattern sheet generated instead.

# Chosen direction: 1a modern DAW chrome (flat panels, hairline grid, Nocturne tokens)
Demo song: "Shake", 111 BPM, 5 stems (DRUMS BASS RHYTHM PADS VOCALS), 7 regions/41 bars, synthesized client-side and fed through the real WAV/MIDI ingestion path.

# Phase 2 (.work project builder)
Community format via ot-tools-io (GPL v3 — porting has license implications). Current build: project folder inspection + validation + plan preview only; bank read-modify-write NOT yet implemented (scene preservation is a hard requirement; won't write banks without byte-accurate format verification).
