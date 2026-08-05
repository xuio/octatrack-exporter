const ILLEGAL = /[\\/:*?"<>|]/g;

export const sanitize = (s, fallback = '') => (s || '').replace(ILLEGAL, '').trim() || fallback;

/** `3 RHYTHM Shake` — track number, stem name, song abbreviation. */
export const stemFileBase = (stem, index, abbrev) =>
  `${index + 1} ${sanitize(stem.name, 'STEM')} ${sanitize(abbrev, 'Song')}`;

export const stemsZipName = (custom, abbrev) =>
  sanitize(custom.replace(/\.zip$/i, ''), `${sanitize(abbrev, 'OSSC')} stems`);

export const projectFolderName = (custom, sourceFolder) =>
  sanitize(custom.replace(/\.zip$/i, ''), `${sourceFolder || 'PROJECT'} OSSC`);
