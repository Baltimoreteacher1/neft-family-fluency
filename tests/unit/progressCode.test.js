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
  parseFormLink,
  encodeProgressV2,
  decodeProgressV2,
  decodeAny,
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

// --- the teacher's form override ----------------------------------------

test('parseFormLink pulls the address and the field id out of a pre-filled link', () => {
  const out = parseFormLink(
    'https://docs.google.com/forms/d/e/ABC123/viewform?usp=pp_url&entry.987654=MYCODE',
  );
  assert.equal(out.formUrl, 'https://docs.google.com/forms/d/e/ABC123/viewform');
  assert.equal(out.entryId, 'entry.987654');
});

test('parseFormLink accepts a plain form address, with no field id', () => {
  const out = parseFormLink('https://docs.google.com/forms/d/e/ABC123/viewform');
  assert.equal(out.formUrl, 'https://docs.google.com/forms/d/e/ABC123/viewform');
  assert.equal(out.entryId, null);
});

test('parseFormLink drops the sample code from the pasted link', () => {
  // Google's pre-filled link contains whatever was typed to generate it. That
  // value must not survive into a real child's submission.
  const out = parseFormLink(
    'https://docs.google.com/forms/d/e/ABC/viewform?usp=pp_url&entry.1=SAMPLE',
  );
  assert.ok(!out.formUrl.includes('SAMPLE'));
  assert.ok(!out.formUrl.includes('?'));
});

test('parseFormLink refuses anything that is not an http(s) URL', () => {
  for (const bad of ['', null, undefined, 'not a url', 'javascript:alert(1)', 'data:text/html,x']) {
    assert.equal(parseFormLink(bad), null, `"${String(bad)}" should be refused`);
  }
});

test('a parsed link rebuilds into a working prefill URL', () => {
  const parsed = parseFormLink(
    'https://docs.google.com/forms/d/e/ABC/viewform?usp=pp_url&entry.55=OLD',
  );
  const url = prefillUrl(parsed.formUrl, parsed.entryId, '535000W3JW0RW0072102M381EG4DS');
  assert.ok(url.includes('entry.55=535000W3JW0RW0072102M381EG4DS'));
  assert.ok(!url.includes('OLD'));
});

// --- version 2 -----------------------------------------------------------
//
// v1 codes are already sitting in teachers' Google Sheets. A v2 rollout that
// stopped them decoding would turn every existing row into lost data, so both
// versions are tested together, forever.

test('a v2 code round-trips exactly', () => {
  const payload = {
    classCode: '6B', studentNumber: 5, grade: 6, skillIndex: 3, stage: 2,
    accuracy: 0.92, daysPractised: 4, mastered: true,
    missed: ['mult:7x8', 'div:42/6'],
  };
  const code = encodeProgressV2(payload);
  assert.equal(code.length, 28);

  const out = decodeProgressV2(code);
  assert.ok(out.ok, out.error);
  assert.equal(out.value.version, 2);
  assert.equal(out.value.classCode, '6B');
  assert.equal(out.value.studentNumber, 5);
  assert.equal(out.value.grade, 6);
  assert.equal(out.value.skillIndex, 3);
  assert.equal(out.value.stage, 2);
  assert.equal(out.value.accuracyPct, 92);
  assert.equal(out.value.daysPractised, 4);
  assert.equal(out.value.mastered, true);
  assert.deepEqual(out.value.missed, ['mult:7x8', 'div:42/6']);
});

test('500 random v2 payloads round-trip exactly', () => {
  const rng = createRng('v2-roundtrip');
  for (let i = 0; i < 500; i++) {
    const len = rng.int(0, 4);
    let classCode = '';
    for (let c = 0; c < len; c++) classCode += rng.pick(ALPHABET.split(''));
    const missedCount = rng.int(0, 3);
    const missed = [];
    for (let m = 0; m < missedCount; m++) {
      const op = rng.pick(OPS);
      const sep = op === 'mult' || op === 'xmult' ? 'x' : '/';
      missed.push(`${op}:${rng.int(0, 16383)}${sep}${rng.int(0, 127)}`);
    }
    const payload = {
      classCode,
      studentNumber: rng.int(0, 255),
      grade: rng.int(1, 8),
      skillIndex: rng.int(0, 31),
      stage: rng.int(0, 3),
      accuracy: rng.int(0, 100) / 100,
      daysPractised: rng.int(0, 7),
      mastered: rng.chance(0.5),
      missed,
    };
    const out = decodeProgressV2(encodeProgressV2(payload));
    assert.ok(out.ok, `payload ${i}: ${out.error}`);
    assert.equal(out.value.classCode, payload.classCode, `payload ${i} class`);
    assert.equal(out.value.grade, payload.grade, `payload ${i} grade`);
    assert.equal(out.value.skillIndex, payload.skillIndex, `payload ${i} skill`);
    assert.equal(out.value.stage, payload.stage, `payload ${i} stage`);
    assert.equal(out.value.accuracyPct, Math.round(payload.accuracy * 100), `payload ${i} accuracy`);
    assert.equal(out.value.daysPractised, payload.daysPractised, `payload ${i} days`);
    assert.equal(out.value.mastered, payload.mastered, `payload ${i} mastered`);
    assert.deepEqual(out.value.missed, payload.missed, `payload ${i} missed`);
  }
});

test('decodeAny reads both versions without being told which', () => {
  const v1 = encodeProgress({
    classCode: '6A', studentNumber: 14, week: 3, daysPractised: 4,
    accuracy: 0.92, medianMs: 2400, badge: true, missed: ['mult:7x8'],
  });
  const v2 = encodeProgressV2({
    classCode: '6B', studentNumber: 5, grade: 6, skillIndex: 3, stage: 2,
    accuracy: 0.85, daysPractised: 3, mastered: false, missed: [],
  });

  const a = decodeAny(v1);
  assert.ok(a.ok);
  assert.equal(a.value.version, 1);
  assert.equal(a.value.week, 3);

  const b = decodeAny(v2);
  assert.ok(b.ok);
  assert.equal(b.value.version, 2);
  assert.equal(b.value.grade, 6);
  // v2 has no week; the field is present and null so one table can show both.
  assert.equal(b.value.week, null);
});

test('every pinned v1 vector still decodes after the v2 rollout', () => {
  for (const v of vectors.vectors) {
    const out = decodeAny(v.code);
    assert.ok(out.ok, `v1 vector "${v.name}" stopped decoding: ${out.error}`);
    assert.equal(out.value.version, 1);
    assert.equal(out.value.week, v.payload.week);
  }
});

test('a damaged v2 code fails the checksum rather than decoding to something else', () => {
  const rng = createRng('v2-corruption');
  let caught = 0;
  const TRIALS = 300;
  for (let i = 0; i < TRIALS; i++) {
    const code = encodeProgressV2({
      classCode: '6B', studentNumber: rng.int(0, 255), grade: rng.int(1, 8),
      skillIndex: rng.int(0, 31), stage: rng.int(0, 3),
      accuracy: rng.int(0, 100) / 100, daysPractised: rng.int(0, 7),
      mastered: rng.chance(0.5), missed: [],
    });
    const pos = rng.int(0, code.length - 1);
    let ch = rng.pick(ALPHABET.split(''));
    while (ch === code[pos]) ch = rng.pick(ALPHABET.split(''));
    if (!decodeAny(code.slice(0, pos) + ch + code.slice(pos + 1)).ok) caught++;
  }
  // 10-bit checksum: about 1 in 1024 slips through. Demanding 100% would be
  // demanding a property the format does not have.
  assert.ok(caught >= TRIALS - 2, `only ${caught}/${TRIALS} corruptions caught`);
});

test('decodeAny never throws, whatever it is handed', () => {
  for (const junk of ['', null, undefined, '!!!', 'x'.repeat(200), '-----', 0, {}]) {
    const out = decodeAny(junk);
    assert.equal(out.ok, false, `"${String(junk)}" should not decode`);
    assert.ok(typeof out.error === 'string' && out.error.length > 0);
  }
});
