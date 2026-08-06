// Synthetic but structurally valid Octatrack files, plus the geometry the tests
// need to point at individual bytes.
//
// These are built from the same layout rules the writers probe for, which is
// their limitation: they prove the writers are self-consistent, not that the
// layout matches a real device file. Swapping in a bank01.work copied off a CF
// card would close that gap — the fixture shape here is deliberately the same
// so it can be dropped in.

/** A bank with 16 patterns × 8 audio track sections, headers and magics in place. */
export function bankGeometry(R = 2) {
  const att = 2210 + 64 * R;
  const psize = 8 + 8 * att + 500 + 12;
  return {
    R,
    att,
    psize,
    patternAt: idx => 22 + idx * psize,
    trackAt: (idx, t) => 22 + idx * psize + 8 + t * att,
    maskAt: (idx, t) => 22 + idx * psize + 8 + t * att + 9,
    plockAt: (idx, t, step) => 22 + idx * psize + 8 + t * att + (att - 64 * R - 64 - 2048) + (step - 1) * 32,
    scaleAt: idx => 22 + idx * psize + psize - 12,
    tempoAt: idx => 22 + idx * psize + psize - 2,
  };
}

export function makeBank(R = 2) {
  const { att, psize } = bankGeometry(R);
  const buf = new Uint8Array(22 + 16 * psize + 100 + 2);
  buf.set([70, 79, 82, 77, 0, 0, 0, 0, 68, 80, 83, 49, 66, 65, 78, 75, 0, 0, 0, 0, 0, 23], 0);
  for (let k = 0; k < 16; k++) {
    const b = 22 + k * psize;
    buf.set([0x50, 0x54, 0x52, 0x4E, 0, 0, 0, 0], b);
    for (let t = 0; t < 8; t++) buf.set([0x54, 0x52, 0x41, 0x43, 0, 0, 0, 0, t], b + 8 + t * att);
  }
  return buf;
}

export function makeMarkers() {
  const buf = new Uint8Array(22 + 264 * 784 + 2);
  buf.set([0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x41, 0x4D, 0x50, 0, 0, 0, 0, 0, 4], 0);
  return buf;
}

/** Decode a track's trigger mask with the device mapping (byte = 7 − halfpage). */
export function firedSteps(bytes, geom, patternIdx, trackIdx) {
  const o = geom.maskAt(patternIdx, trackIdx), out = [];
  for (let b = 0; b < 8; b++) {
    for (let bit = 0; bit < 8; bit++) if (bytes[o + b] & (1 << bit)) out.push((7 - b) * 8 + bit + 1);
  }
  return out.sort((a, b) => a - b);
}
