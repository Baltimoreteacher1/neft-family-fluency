// A self-contained QR encoder.
//
// Deliberately not an image API call: this app makes no third-party requests,
// and the QR has to render on a phone with the network off. It is also the one
// place a progress code would leak to someone else's server if we took the
// easy route.
//
// Scope: byte mode, error-correction level M, versions 1-10. A progress code
// is 29 characters, so version 2 carries it comfortably; the range covers the
// flyer URL too. Anything longer than version 10 throws rather than silently
// producing an unscannable grid.

const EC_LEVEL = 0; // M, per the format-info table below

// Total codewords and EC codewords per version, level M.
const VERSION_INFO = [
  null,
  { total: 26, ec: 10, blocks: 1 },
  { total: 44, ec: 16, blocks: 1 },
  { total: 70, ec: 26, blocks: 1 },
  { total: 100, ec: 18, blocks: 2 },
  { total: 134, ec: 24, blocks: 2 },
  { total: 172, ec: 16, blocks: 4 },
  { total: 196, ec: 18, blocks: 4 },
  { total: 242, ec: 22, blocks: 4 },
  { total: 292, ec: 22, blocks: 5 },
  { total: 346, ec: 26, blocks: 5 },
];

const ALIGNMENT = [
  null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// --- GF(256) --------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function generatorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data, count) {
  const gen = generatorPoly(count);
  const res = new Array(data.length + count).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const coeff = res[i];
    if (coeff === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      res[i + j] ^= gfMul(gen[j], coeff);
    }
  }
  return res.slice(data.length);
}

// --- encoding -------------------------------------------------------------

function chooseVersion(byteLength) {
  for (let v = 1; v < VERSION_INFO.length; v++) {
    const info = VERSION_INFO[v];
    const dataCodewords = info.total - info.ec * info.blocks;
    const lengthBits = v < 10 ? 8 : 16;
    const needed = Math.ceil((4 + lengthBits + byteLength * 8) / 8);
    if (needed <= dataCodewords) return v;
  }
  throw new Error(`QR payload of ${byteLength} bytes is too long for version 10`);
}

function toBitStream(bytes, version) {
  const info = VERSION_INFO[version];
  const dataCodewords = info.total - info.ec * info.blocks;
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  // Terminator, then pad to a byte boundary, then the alternating pad bytes.
  const capacity = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  const PAD = [0xec, 0x11];
  let p = 0;
  while (codewords.length < dataCodewords) codewords.push(PAD[p++ % 2]);

  return codewords;
}

/** Split into blocks, compute EC, then interleave -- the standard layout. */
function interleave(codewords, version) {
  const info = VERSION_INFO[version];
  const totalData = info.total - info.ec * info.blocks;
  const shortLen = Math.floor(totalData / info.blocks);
  const longCount = totalData % info.blocks;

  const dataBlocks = [];
  const ecBlocks = [];
  let at = 0;
  for (let b = 0; b < info.blocks; b++) {
    const len = shortLen + (b >= info.blocks - longCount ? 1 : 0);
    const block = codewords.slice(at, at + len);
    at += len;
    dataBlocks.push(block);
    ecBlocks.push(ecCodewords(block, info.ec));
  }

  const out = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < info.ec; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

// --- matrix ---------------------------------------------------------------

function buildMatrix(version, codewords) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (r, c, v) => {
    modules[r][c] = v;
    reserved[r][c] = true;
  };

  // Finder patterns + separators.
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFn(rr, cc, inRing ? 1 : 0);
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    setFn(6, i, i % 2 === 0 ? 1 : 0);
    setFn(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Alignment patterns, skipping the ones that collide with finders.
  const centres = ALIGNMENT[version];
  for (const r0 of centres) {
    for (const c0 of centres) {
      const nearFinder =
        (r0 <= 8 && c0 <= 8) ||
        (r0 <= 8 && c0 >= size - 9) ||
        (r0 >= size - 9 && c0 <= 8);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const ring = Math.max(Math.abs(r), Math.abs(c));
          setFn(r0 + r, c0 + c, ring === 1 ? 0 : 1);
        }
      }
    }
  }

  // Dark module.
  setFn(size - 8, 8, 1);

  // Reserve the format-information areas.
  for (let i = 0; i < 9; i++) {
    if (modules[8][i] === null) { modules[8][i] = 0; reserved[8][i] = true; }
    if (modules[i][8] === null) { modules[i][8] = 0; reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    if (modules[8][size - 1 - i] === null) { modules[8][size - 1 - i] = 0; reserved[8][size - 1 - i] = true; }
    if (modules[size - 1 - i][8] === null) { modules[size - 1 - i][8] = 0; reserved[size - 1 - i][8] = true; }
  }

  // Version information, versions 7 and up.
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      const r = Math.floor(i / 3);
      const c = i % 3;
      setFn(r, size - 11 + c, bit);
      setFn(size - 11 + c, r, bit);
    }
  }

  placeData(modules, reserved, codewords, size);

  // Pick the mask that scores best, as the spec requires -- a fixed mask
  // produces grids that some scanners refuse.
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = applyMask(modules, reserved, size, mask);
    writeFormat(candidate, size, mask);
    const score = penalty(candidate, size);
    if (!best || score < best.score) best = { score, matrix: candidate };
  }
  return best.matrix;
}

function placeData(modules, reserved, codewords, size) {
  let bitIndex = 0;
  let upward = true;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip the vertical timing column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        const byte = codewords[bitIndex >> 3];
        const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
        modules[row][cc] = bit;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(modules, reserved, size, mask) {
  const out = modules.map((row) => row.slice());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      if (MASKS[mask](r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

function writeFormat(matrix, size, mask) {
  const data = (EC_LEVEL << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    // Around the top-left finder.
    if (i < 6) matrix[i][8] = bit;
    else if (i < 8) matrix[i + 1][8] = bit;
    else if (i === 8) matrix[8][7] = bit;
    else matrix[8][14 - i] = bit;
    // The duplicate copy.
    if (i < 8) matrix[8][size - 1 - i] = bit;
    else matrix[size - 15 + i][8] = bit;
  }
  matrix[size - 8][8] = 1;
}

function penalty(matrix, size) {
  let score = 0;

  // Rule 1: runs of five or more of the same colour.
  for (let r = 0; r < size; r++) {
    for (const axis of ['row', 'col']) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        const prev = axis === 'row' ? matrix[r][c - 1] : matrix[c - 1][r];
        const cur = axis === 'row' ? matrix[r][c] : matrix[c][r];
        if (cur === prev) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c];
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // Rule 4: deviation from a 50/50 balance of dark and light.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += matrix[r][c];
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return score;
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return (version << 12) | rem;
}

// --- public API -----------------------------------------------------------

/** @returns {number[][]} a square matrix of 0/1 */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const version = chooseVersion(bytes.length);
  const codewords = interleave(toBitStream(bytes, version), version);
  return buildMatrix(version, codewords);
}

/**
 * Render as an inline SVG. SVG rather than canvas so it prints sharply on the
 * family flyer and scales without a second code path.
 */
export function qrSvg(text, { size = 200, quiet = 4, label = 'QR code' } = {}) {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const dim = n + quiet * 2;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${dim} ${dim}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.style.imageRendering = 'pixelated';

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(dim));
  bg.setAttribute('height', String(dim));
  bg.setAttribute('fill', '#ffffff');
  svg.append(bg);

  // One path for every dark module keeps the DOM small enough to print.
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000000');
  svg.append(path);

  return svg;
}

/** The same grid as an SVG string, for pages built without the DOM helpers. */
export function qrSvgString(text, { size = 200, quiet = 4 } = {}) {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const dim = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" role="img"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
