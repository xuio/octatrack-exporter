// markers.work writer — the file the device reads slot slice/trim data from.
// Layout verified vs ot-tools-io + its reference hexdump: header[21] "FORM....DPS1SAMP.....",
// version u8=4, then 128 flex + 8 recorder + 128 static SlotMarkers of 784 B each
// (trim_offset u32, trim_end u32, loop_point u32, 64 × {start,end,loop} u32, slice_count u32 — all BIG-endian),
// u16 BE checksum = sum of bytes [16..len-2]. Total 207000 B. Slices show on device via THIS file, not the .ot.
const MARKERS_HDR = [0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x41, 0x4D, 0x50, 0, 0, 0, 0, 0];

export function writeMarkersSlots(src, entries) {
  const u8 = new Uint8Array(src);
  for (let i = 0; i < 21; i++) if (u8[i] !== MARKERS_HDR[i]) return { error: 'markers header mismatch' };
  if (u8[21] !== 4) return { error: 'markers data version ' + u8[21] + ' — verified for version 4 (OS 1.40) only' };
  if (u8.length !== 22 + 264 * 784 + 2) return { error: 'unexpected markers file size ' + u8.length };
  const dv = new DataView(u8.buffer);
  for (const e of entries) {
    if (e.slot0 < 0 || e.slot0 > 127) continue;
    const off = 22 + (136 + e.slot0) * 784; // 128 flex + 8 recorder slots first
    dv.setUint32(off, 0); dv.setUint32(off + 4, e.totalFrames); dv.setUint32(off + 8, 0);
    for (let j = 0; j < 64; j++) {
      const so = off + 12 + j * 12, sl = e.slices[j];
      dv.setUint32(so, sl ? sl.start : 0); dv.setUint32(so + 4, sl ? sl.end : 0); dv.setUint32(so + 8, sl ? 0xFFFFFFFF : 0); // slice loop off
    }
    dv.setUint32(off + 780, Math.min(64, e.slices.length));
  }
  let sum = 0;
  for (let i = 16; i < u8.length - 2; i++) sum = (sum + u8[i]) & 0xFFFF;
  u8[u8.length - 2] = sum >> 8; u8[u8.length - 1] = sum & 255;
  return { bytes: u8, slotsWritten: entries.length };
}
