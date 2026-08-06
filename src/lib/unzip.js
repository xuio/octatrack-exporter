// Minimal ZIP reader (central-directory based). Handles stored (method 0) and
// deflate (method 8); deflate uses the platform DecompressionStream, so there is
// no bundled inflate implementation.

export async function readZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file (no end-of-central-directory record)');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), out = [];
  for (let n = 0; n < count && off + 46 <= u8.length; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true), extraLen = dv.getUint16(off + 30, true), cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + cmtLen;
    if (name.endsWith('/')) continue;
    if (lho + 30 > u8.length || dv.getUint32(lho, true) !== 0x04034b50) continue;
    const dataOff = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const comp = u8.subarray(dataOff, dataOff + csize);
    let data;
    if (method === 0) data = comp.slice();
    else if (method === 8) data = await inflateRaw(comp);
    else continue; // unsupported compression — skip this entry
    out.push({ name, data });
  }
  return out;
}

async function inflateRaw(u8) {
  if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot decompress deflated ZIPs — extract the archive first');
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Audio/MIDI entries a stem archive can contribute, in a stable order.
export function audioEntries(entries) {
  return entries
    .filter(e => {
      const base = e.name.split('/').pop() || '';
      return base && !base.startsWith('.') && !e.name.includes('__MACOSX') && /\.(wav|aiff?|flac|mid|midi)$/i.test(base);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
