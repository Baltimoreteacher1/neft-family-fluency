// Weekly progress code: a short, typeable, scannable string carrying a week's
// result with no personal data in it at all.
//
// A code says: class 6A, student 14, week 3, practised 4 days, 92% accurate,
// median 2.4s, badge earned, and the three facts most often missed. It does not
// and cannot say who student 14 is. That mapping lives only on the teacher's
// own roster, never in this repo, never in a Google Sheet, never in the code.
//
// ---------------------------------------------------------------------------
// THIS ALGORITHM EXISTS TWICE. The other copy is DECODE_PROGRESS() in
// setup/progress-form.gs, so the teacher's Sheet can decode without a backend.
// tests/vectors.json is the contract between them: change the bit layout here
// and the vector test fails until the .gs side matches. That is the test
// working, not the test being annoying.
// ---------------------------------------------------------------------------
//
// Bit layout (v1), most-significant bit first:
//
//   version        3   1
//   classCodeLen   3   0-4 characters
//   classCode     20   4 x 5-bit alphabet index (unused slots are zero)
//   studentNumber  8   0-255
//   week           6   1-63
//   daysPractised  3   0-7
//   accuracy       7   0-100 (whole percent)
//   medianMs      10   deciseconds, 0-1023 (capped at 102.3s)
//   badge          1
//   missedCount    2   0-3
//   missed[3]     24   op(3) + a(14) + b(7), each
//   --------------------
//   payload      135
//   checksum      10
//   total        145  -> 29 base32 characters

// Crockford-style alphabet: no I, L, O or U, so a handwritten code cannot be
// misread as a different one.
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const VERSION = 1;

// Operation codes for missed items. Append only -- renumbering breaks every
// code already sitting in a teacher's spreadsheet.
export const OPS = ['mult', 'div', 'xmult', 'xdiv', 'longdiv'];

const LAYOUT = {
  version: 3,
  classCodeLen: 3,
  classCode: 20,
  studentNumber: 8,
  week: 6,
  daysPractised: 3,
  accuracy: 7,
  medianDs: 10,
  badge: 1,
  missedCount: 2,
};
const MISSED_BITS = { op: 3, a: 14, b: 7 };
const CHECKSUM_BITS = 10;
const TOTAL_BITS = 145;

/** Fold the characters a human might substitute back onto the alphabet. */
export function normalizeChar(ch) {
  const c = ch.toUpperCase();
  if (c === 'I' || c === 'L') return '1';
  if (c === 'O') return '0';
  if (c === 'U') return 'V';
  return c;
}

export function normalizeClassCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .split('')
    .map(normalizeChar)
    .filter((c) => ALPHABET.indexOf(c) >= 0)
    .slice(0, 4)
    .join('');
}

// --- bit plumbing ---------------------------------------------------------
// Deliberately written with plain arrays and no typed arrays or BigInt, so the
// Apps Script port is a transcription rather than a rewrite.

function writeBits(bits, value, width) {
  for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
}

function readBits(bits, offset, width) {
  let value = 0;
  for (let i = 0; i < width; i++) value = value * 2 + bits[offset + i];
  return value;
}

/** 10-bit checksum over the payload bits. Cheap, and catches a typed digit. */
export function checksumOf(bits) {
  let c = 0x3ff;
  for (let i = 0; i < bits.length; i++) {
    c = ((c << 1) ^ (c >> 9) ^ bits[i]) & 0x3ff;
  }
  return c;
}

// --- parsing item ids -----------------------------------------------------

/**
 * Turn an item id ("mult:7x8", "longdiv:372/4") into the three numbers the code
 * can carry. Anything unparseable becomes a zeroed slot rather than throwing --
 * a child's week should never fail to send because of one odd item id.
 */
export function packItemId(itemId) {
  const s = String(itemId || '');
  const colon = s.indexOf(':');
  if (colon < 0) return { op: 0, a: 0, b: 0 };
  const op = s.slice(0, colon);
  const rest = s.slice(colon + 1);
  const opIndex = OPS.indexOf(op);
  if (opIndex < 0) return { op: 0, a: 0, b: 0 };

  const sep = rest.indexOf('x') >= 0 ? 'x' : '/';
  const parts = rest.split(sep);
  const a = Math.min(16383, Math.max(0, parseInt(parts[0], 10) || 0));
  const b = Math.min(127, Math.max(0, parseInt(parts[1], 10) || 0));
  return { op: opIndex, a, b };
}

export function unpackItemId({ op, a, b }) {
  const opName = OPS[op] || OPS[0];
  const sep = opName === 'mult' || opName === 'xmult' ? 'x' : '/';
  return `${opName}:${a}${sep}${b}`;
}

// --- encode / decode ------------------------------------------------------

/**
 * @param {{classCode:string, studentNumber:number, week:number,
 *          daysPractised:number, accuracy:number, medianMs:number|null,
 *          badge:boolean, missed:string[]}} p
 * @returns {string} 29 base32 characters, grouped for readability
 */
export function encodeProgress(p) {
  const classCode = normalizeClassCode(p.classCode);
  const bits = [];

  writeBits(bits, VERSION, LAYOUT.version);
  writeBits(bits, classCode.length, LAYOUT.classCodeLen);
  for (let i = 0; i < 4; i++) {
    const idx = i < classCode.length ? ALPHABET.indexOf(classCode[i]) : 0;
    writeBits(bits, idx, 5);
  }
  writeBits(bits, clamp(p.studentNumber, 0, 255), LAYOUT.studentNumber);
  writeBits(bits, clamp(p.week, 0, 63), LAYOUT.week);
  writeBits(bits, clamp(p.daysPractised, 0, 7), LAYOUT.daysPractised);
  // Accuracy arrives as a 0-1 fraction; it travels as whole percent.
  writeBits(bits, clamp(Math.round((p.accuracy || 0) * 100), 0, 100), LAYOUT.accuracy);
  const ds = p.medianMs == null ? 0 : clamp(Math.round(p.medianMs / 100), 0, 1023);
  writeBits(bits, ds, LAYOUT.medianDs);
  writeBits(bits, p.badge ? 1 : 0, LAYOUT.badge);

  const missed = (p.missed || []).slice(0, 3);
  writeBits(bits, missed.length, LAYOUT.missedCount);
  for (let i = 0; i < 3; i++) {
    const item = i < missed.length ? packItemId(missed[i]) : { op: 0, a: 0, b: 0 };
    writeBits(bits, item.op, MISSED_BITS.op);
    writeBits(bits, item.a, MISSED_BITS.a);
    writeBits(bits, item.b, MISSED_BITS.b);
  }

  writeBits(bits, checksumOf(bits), CHECKSUM_BITS);

  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    let v = 0;
    for (let j = 0; j < 5; j++) v = v * 2 + (bits[i + j] || 0);
    out += ALPHABET[v];
  }
  return out;
}

/** Group a raw code for display: XXXXX-XXXXX-XXXXX-... */
export function formatCode(code) {
  return (code.match(/.{1,5}/g) || []).join('-');
}

/**
 * @returns {{ok:true, value:object} | {ok:false, error:string}}
 * Never throws. A teacher pasting a truncated code should see "that code looks
 * incomplete", not a stack trace.
 */
export function decodeProgress(code) {
  const clean = String(code || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .split('')
    .map(normalizeChar)
    .join('');

  if (clean.length !== 29) {
    return { ok: false, error: `Expected 29 characters, got ${clean.length}` };
  }

  const bits = [];
  for (let i = 0; i < clean.length; i++) {
    const v = ALPHABET.indexOf(clean[i]);
    if (v < 0) return { ok: false, error: `Bad character "${clean[i]}"` };
    for (let j = 4; j >= 0; j--) bits.push((v >> j) & 1);
  }
  if (bits.length !== TOTAL_BITS) {
    return { ok: false, error: 'Wrong length after decoding' };
  }

  const payload = bits.slice(0, TOTAL_BITS - CHECKSUM_BITS);
  const given = readBits(bits, TOTAL_BITS - CHECKSUM_BITS, CHECKSUM_BITS);
  if (checksumOf(payload) !== given) {
    return { ok: false, error: 'Checksum failed -- the code was mistyped or damaged' };
  }

  let o = 0;
  const take = (w) => {
    const v = readBits(bits, o, w);
    o += w;
    return v;
  };

  const version = take(LAYOUT.version);
  if (version !== VERSION) {
    return { ok: false, error: `Unsupported code version ${version}` };
  }
  const ccLen = take(LAYOUT.classCodeLen);
  let classCode = '';
  for (let i = 0; i < 4; i++) {
    const idx = take(5);
    if (i < ccLen) classCode += ALPHABET[idx];
  }
  const studentNumber = take(LAYOUT.studentNumber);
  const week = take(LAYOUT.week);
  const daysPractised = take(LAYOUT.daysPractised);
  const accuracyPct = take(LAYOUT.accuracy);
  const medianDs = take(LAYOUT.medianDs);
  const badge = take(LAYOUT.badge) === 1;
  const missedCount = take(LAYOUT.missedCount);

  const missed = [];
  for (let i = 0; i < 3; i++) {
    const op = take(MISSED_BITS.op);
    const a = take(MISSED_BITS.a);
    const b = take(MISSED_BITS.b);
    if (i < missedCount) missed.push(unpackItemId({ op, a, b }));
  }

  return {
    ok: true,
    value: {
      version,
      classCode,
      studentNumber,
      week,
      daysPractised,
      accuracy: accuracyPct / 100,
      accuracyPct,
      medianMs: medianDs * 100,
      badge,
      missed,
    },
  };
}

function clamp(n, lo, hi) {
  const v = Math.round(Number(n) || 0);
  return v < lo ? lo : v > hi ? hi : v;
}

/** The "Send to teacher" URL: a Google Forms prefill, nothing else. */
export function prefillUrl(formUrl, entryId, code) {
  if (!formUrl || !entryId) return null;
  const sep = formUrl.indexOf('?') >= 0 ? '&' : '?';
  return `${formUrl}${sep}usp=pp_url&${encodeURIComponent(entryId)}=${encodeURIComponent(code)}`;
}
