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

/** Per-track scale bytes (+89/+90) every fixture bank starts with, standing in for
 *  whatever the user's own project had there. Any track OSSC is not told to touch
 *  must still read exactly these afterwards. */
export const SCALE_SENTINEL = [0xAB, 0xCD];

export function makeBank(R = 2) {
  const { att, psize } = bankGeometry(R);
  const buf = new Uint8Array(22 + 16 * psize + 100 + 2);
  buf.set([70, 79, 82, 77, 0, 0, 0, 0, 68, 80, 83, 49, 66, 65, 78, 75, 0, 0, 0, 0, 0, 23], 0);
  for (let k = 0; k < 16; k++) {
    const b = 22 + k * psize;
    buf.set([0x50, 0x54, 0x52, 0x4E, 0, 0, 0, 0], b);
    for (let t = 0; t < 8; t++) {
      const o = b + 8 + t * att;
      buf.set([0x54, 0x52, 0x41, 0x43, 0, 0, 0, 0, t], o);
      buf.set(SCALE_SENTINEL, o + 89);
    }
  }
  return buf;
}

export function makeMarkers() {
  const buf = new Uint8Array(22 + 264 * 784 + 2);
  buf.set([0x46, 0x4F, 0x52, 0x4D, 0, 0, 0, 0, 0x44, 0x50, 0x53, 0x31, 0x53, 0x41, 0x4D, 0x50, 0, 0, 0, 0, 0, 4], 0);
  return buf;
}

/**
 * An in-memory stand-in for a FileSystemDirectoryHandle. The real picker cannot
 * be driven from Node, so the directory-write path is exercised against this.
 */
export function fakeDir(name = '') {
  const dirs = new Map(), files = new Map();
  return {
    name, dirs, files,
    async getDirectoryHandle(child, opts = {}) {
      if (!dirs.has(child)) {
        if (!opts.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
        dirs.set(child, fakeDir(child));
      }
      return dirs.get(child);
    },
    async getFileHandle(child, opts = {}) {
      if (!files.has(child) && !opts.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      return {
        name: child,
        async createWritable() {
          let data = null;
          return { async write(d) { data = d; }, async close() { files.set(child, data); } };
        },
        async getFile() {
          const data = files.get(child);
          return { async arrayBuffer() { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); } };
        },
      };
    },
  };
}

/** Decode a track's trigger mask with the device mapping (byte = 7 − halfpage). */
export function firedSteps(bytes, geom, patternIdx, trackIdx) {
  const o = geom.maskAt(patternIdx, trackIdx), out = [];
  for (let b = 0; b < 8; b++) {
    for (let bit = 0; bit < 8; bit++) if (bytes[o + b] & (1 << bit)) out.push((7 - b) * 8 + bit + 1);
  }
  return out.sort((a, b) => a - b);
}
