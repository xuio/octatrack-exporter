// octatrack project.work (Windows-1258 text) reader/writer.
export function decodeLatin1(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; }
export function encodeLatin1(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xFF; return u; }

export function parseProjectText(text) {
  const meta = {}; const m = text.match(/\[META\]([\s\S]*?)\[\/META\]/);
  if (m) m[1].split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  const slots = []; const re = /\[SAMPLE\]([\s\S]*?)\[\/SAMPLE\]/g; let mm;
  while ((mm = re.exec(text))) { const o = {}; mm[1].split(/\r?\n/).forEach(l => { const i = l.indexOf('='); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); slots.push(o); }
  return { meta, slots, osVersion: (meta.OS_VERSION || '').split(/\s+/).pop() || '', projType: meta.TYPE || '' };
}

// Insert/replace Static slot blocks + set project tempo; everything else stays byte-identical.
// Tempo must match the stems' BPM: slots are written with timestretch off, so a project tempo
// mismatch makes patterns drift against the audio (~0.5 bar over 6-8 bars at 120 vs 111).
export function writeStaticSlots(text, entries, bpm) {
  const used = new Set(entries.map(e => e.slot)); let removed = 0, tempoSet = false;
  if (bpm) text = text.replace(/^TEMPOx24=\d+/m, () => { tempoSet = true; return 'TEMPOx24=' + Math.round(bpm * 24); });
  text = text.replace(/\[SAMPLE\]([\s\S]*?)\[\/SAMPLE\](?:\r\n)*/g, (blk, body) => {
    const s = body.match(/SLOT=(\d+)/);
    if (/TYPE=STATIC/i.test(body) && s && used.has(parseInt(s[1]))) { removed++; return ''; }
    return blk;
  });
  // GAIN=48 is unity: the slot gain range is 0..96 = −24..+24 dB (ot-tools-io
  // DEFAULT_GAIN). 72 is the *recorder*-slot default and would add +12 dB.
  const blocks = entries.map(e => '[SAMPLE]\r\nTYPE=STATIC\r\nSLOT=' + e.slot + '\r\nPATH=' + e.path + '\r\nBPMx24=' + Math.round(e.bpm * 24) + '\r\nTSMODE=0\r\nLOOPMODE=0\r\nGAIN=48\r\nTRIGQUANTIZATION=255\r\n[/SAMPLE]\r\n\r\n').join('');
  const idx = text.lastIndexOf('############################');
  if (idx < 0) return { error: 'unrecognized project.work layout' };
  return { text: text.slice(0, idx) + blocks + text.slice(idx), removed, tempoSet };
}
