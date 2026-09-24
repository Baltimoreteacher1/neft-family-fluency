// Progress code round-trips, checksum behaviour, and the shared vectors that
// pin the JS and Apps Script decoders to the same algorithm.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import {
  ALPHABET,
  OPS,
  encodeProgress,
  decodeProgress,
  formatCode,
  normalizeClassCode,
  prefillUrl,
} from '../../engine/progressCode.js';

const vectors = JSON.parse(
  readFileSync(new URL('../vectors.json', import.meta.url), 'utf8'),
);

function randomPayload(rng) {
  const len = rng.int(1, 4);
  let classCode = '';
  for (let i = 0; i < len; i++) classCode += rng.pick(ALPHABET.split(''));
  const missedCount = rng.int(0, 3);
  const missed = [];
  for (let i = 0; i < missedCount; i++) {
    const op = rng.pick(OPS);
    const sep = op === 'mult' || op === 'xmult' ? 'x' : '/';
    missed.push(`${op}:${rng.int(0, 16383)}${sep}${rng.int(0, 127)}`);
  }
  return {
    classCode,
    studentNumber: rng.int(0, 255),
    week: rng.int(1, 63),
    daysPractised: rng.int(0, 7),
    accuracy: rng.int(0, 100) / 100,
    medianMs: rng.int(0, 1023) * 100,
    badge: rng.chance(0.5),
    missed,
  };
}

test('500 random payloads round-trip exactly', () => {
  const rng = createRng('progress-roundtrip');
  for (let i = 0; i < 500; i++) {
    const payload = randomPayload(rng);
    const code = encodeProgress(payload);
    assert.equal(code.length, 29, `payload ${i} produced a ${code.length}-char code`);

    const out = decodeProgress(code);
    assert.ok(out.ok, `payload ${i} failed to decode: ${out.error}`);
    const v = out.value;

    assert.equal(v.classCode, payload.classCode, `payload ${i} class code`);
    assert.equal(v.studentNumber, payload.studentNumber, `payload ${i} student number`);
    assert.equal(v.week, payload.week, `payload ${i} week`);
    assert.equal(v.daysPractised, payload.daysPractised, `payload ${i} days`);
    assert.equal(v.accuracyPct, Math.round(payload.accuracy * 100), `payload ${i} accuracy`);
    assert.equal(v.medianMs, payload.medianMs, `payload ${i} median`);
    assert.equal(v.badge, payload.badge, `payload ${i} badge`);
    assert.deepEqual(v.missed, payload.missed, `payload ${i} missed facts`);
  }
});

test('a single mistyped character fails the checksum', () => {
  const rng = createRng('corruption');
  let caught = 0;
  const TRIALS = 300;

  for (let i = 0; i < TRIALS; i++) {
    const code = encodeProgress(randomPayload(rng));
    const pos = rng.int(0, code.length - 1);
    let replacement = rng.pick(ALPHABET.split(''));
    while (replacement === code[pos]) replacement = rng.pick(ALPHABET.split(''));
    const corrupted = code.slice(0, pos) + replacement + code.slice(pos + 1);

    const out = decodeProgress(corrupted);
    // A corrupted code must not silently decode to different-but-valid data.
    if (!out.ok) caught++;
  }

  // The checksum is 10 bits, so a corrupted code slips through about 1 time in
  // 1024. Demanding 100% would be demanding a property the format does not
  // have; demanding "almost always" is the real guarantee.
  assert.ok(
    caught >= TRIALS - 2,
    `checksum caught only ${caught}/${TRIALS} single-character corruptions`,
  );
});

test('a truncated code is rejected with a readable message', () => {
  const code = encodeProgress({
    classCode: '6A', studentNumber: 1, week: 1, daysPractised: 3,
    accuracy: 1, medianMs: 2000, badge: true, missed: [],
  });
  const out = decodeProgress(code.slice(0, 20));
  assert.equal(out.ok, false);
  assert.match(out.error, /29 characters/);
});

test('decodeProgress never throws, whatever it is handed', () => {
  const junk = ['', null, undefined, '!!!', 'x'.repeat(500), '-----', 0, {}];
  for (const input of junk) {
    const out = decodeProgress(input);
    assert.equal(out.ok, false, `"${String(input)}" should not decode`);
    assert.ok(typeof out.error === 'string' && out.error.length > 0);
  }
});

test('formatting and ambiguous characters survive a human retyping the code', () => {
  const code = encodeProgress({
    classCode: '6A', studentNumber: 14, week: 3, daysPractised: 4,
    accuracy: 0.92, medianMs: 2400, badge: true, missed: ['mult:7x8'],
  });
  const asWritten = formatCode(code);
  assert.ok(asWritten.includes('-'));
  // Dashes, lowercase, and the classic O-for-zero slip all decode the same.
  const retyped = asWritten.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
  assert.deepEqual(decodeProgress(retyped), decodeProgress(code));
});

test('class codes are normalised the same way everywhere', () => {
  assert.equal(normalizeClassCode('6a'), '6A');
  assert.equal(normalizeClassCode('mr-neft-6'), 'MRNE');
  assert.equal(normalizeClassCode('OIL'), '011');
  assert.equal(normalizeClassCode(''), '');
  assert.equal(normalizeClassCode(null), '');
});

test('the Send to teacher link carries the code and nothing else', () => {
  const url = prefillUrl(
    'https://docs.google.com/forms/d/e/ABC/viewform',
    'entry.123456',
    'ABCDE',
  );
  assert.ok(url.includes('usp=pp_url'));
  assert.ok(url.includes('entry.123456=ABCDE'));
  assert.equal(prefillUrl(null, 'entry.1', 'X'), null);
  assert.equal(prefillUrl('https://x', null, 'X'), null);
});

// --- the cross-language contract -----------------------------------------

test('shared vectors encode to the pinned codes', () => {
  for (const v of vectors.vectors) {
    assert.equal(
      encodeProgress(v.payload),
      v.code,
      `vector "${v.name}" no longer encodes to its pinned code. If the bit ` +
        `layout changed on purpose, regenerate vectors.json AND update ` +
        `DECODE_PROGRESS() in setup/progress-form.gs to match.`,
    );
  }
});

test('shared vectors decode back to their payloads', () => {
  for (const v of vectors.vectors) {
    const out = decodeProgress(v.code);
    assert.ok(out.ok, `vector "${v.name}" failed to decode: ${out.error}`);
    assert.equal(out.value.classCode, v.payload.classCode, v.name);
    assert.equal(out.value.studentNumber, v.payload.studentNumber, v.name);
    assert.equal(out.value.week, v.payload.week, v.name);
    assert.equal(out.value.daysPractised, v.payload.daysPractised, v.name);
    assert.equal(out.value.accuracyPct, Math.round(v.payload.accuracy * 100), v.name);
    assert.equal(out.value.medianMs, v.payload.medianMs, v.name);
    assert.equal(out.value.badge, v.payload.badge, v.name);
    assert.deepEqual(out.value.missed, v.payload.missed, v.name);
  }
});
