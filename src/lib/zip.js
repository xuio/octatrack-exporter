// Minimal store-only ZIP writer + CSV helper. No dependencies.
let CRCT = null;
export function crc32(u8) {
  if (!CRCT) { CRCT = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRCT[i] = c; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), h = new Uint8Array(30 + name.length), dv = new DataView(h.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, dosT, true); dv.setUint16(12, dosD, true); dv.setUint32(14, crc, true);
    dv.setUint32(18, e.data.length, true); dv.setUint32(22, e.data.length, true); dv.setUint16(26, name.length, true);
    h.set(name, 30); parts.push(h, e.data);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosT, true); cv.setUint16(14, dosD, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, off, true); c.set(name, 46); central.push(c);
    off += h.length + e.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

export const toCsv = rows => rows.map(r => r.map(c => { c = String(c ?? ''); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\n');
