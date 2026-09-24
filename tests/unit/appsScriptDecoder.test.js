// The cross-language contract.
//
// engine/progressCode.js and DECODE_PROGRESS() in setup/progress-form.gs are
// the same algorithm written twice: once for the phone, once for the teacher's
// Google Sheet, which has no backend to call. Two implementations of one wire
// format drift silently, and the failure surfaces months later as a
// spreadsheet quietly showing the wrong child's accuracy.
//
// So the real .gs file is loaded and executed here -- not a copy, not a
// reimplementation -- and its decoder is run against the same vectors and the
// same random payloads as the JS one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import {
  ALPHABET, OPS, encodeProgress, decodeProgress, formatCode,
  encodeProgressV2, decodeProgressV2,
} from '../../engine/progressCode.js';
import { loadAppsScript } from '../tools/gs-shim.mjs';

// Objects and arrays built inside the VM carry that realm's prototypes, so
// deepStrictEqual would compare realms rather than data. Everything crossing
// the boundary is plain JSON, so round-tripping it is an exact normalisation.
const plain = (v) => JSON.parse(JSON.stringify(v));

const GS_PATH = new URL('../../setup/progress-form.gs', import.meta.url).pathname;
const { sandbox } = loadAppsScript(GS_PATH);
const gsDecode = sandbox.decodeProgressCode_;
const DECODE_PROGRESS = sandbox.DECODE_PROGRESS;

const vectors = JSON.parse(
  readFileSync(new URL('../vectors.json', import.meta.url), 'utf8'),
);

test('the Apps Script file loads and exposes its decoder', () => {
  assert.equal(typeof gsDecode, 'function');
  assert.equal(typeof DECODE_PROGRESS, 'function');
});

test('the Apps Script decoder agrees with the JS decoder on every vector', () => {
  for (const v of vectors.vectors) {
    const js = decodeProgress(v.code);
    const gs = gsDecode(v.code);
    assert.ok(gs.ok, `vector "${v.name}" failed in Apps Script: ${gs.error}`);
    assert.deepEqual(plain(gs.value), js.value, `vector "${v.name}" decoded differently`);
  }
});

test('both decoders agree on 500 random payloads', () => {
  const rng = createRng('gs-agreement');
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
    const code = encodeProgress({
      classCode,
      studentNumber: rng.int(0, 255),
      week: rng.int(1, 63),
      daysPractised: rng.int(0, 7),
      accuracy: rng.int(0, 100) / 100,
      medianMs: rng.int(0, 1023) * 100,
      badge: rng.chance(0.5),
      missed,
    });

    const js = decodeProgress(code);
    const gs = gsDecode(code);
    assert.ok(gs.ok, `payload ${i} failed in Apps Script: ${gs.error}`);
    assert.deepEqual(plain(gs.value), js.value, `payload ${i} decoded differently`);
  }
});

test('both decoders reject the same damaged codes', () => {
  const rng = createRng('gs-corruption');
  for (let i = 0; i < 200; i++) {
    const code = encodeProgress({
      classCode: '6A', studentNumber: rng.int(0, 255), week: rng.int(1, 8),
      daysPractised: rng.int(0, 5), accuracy: rng.int(0, 100) / 100,
      medianMs: rng.int(0, 900) * 100, badge: rng.chance(0.5), missed: [],
    });
    const pos = rng.int(0, code.length - 1);
    let ch = rng.pick(ALPHABET.split(''));
    while (ch === code[pos]) ch = rng.pick(ALPHABET.split(''));
    const bad = code.slice(0, pos) + ch + code.slice(pos + 1);

    assert.equal(
      gsDecode(bad).ok,
      decodeProgress(bad).ok,
      `the two decoders disagreed about whether "${bad}" is valid`,
    );
  }
});

test('both decoders handle junk identically', () => {
  for (const junk of ['', '   ', '!!!', 'ABC', 'x'.repeat(100), '-----']) {
    assert.equal(gsDecode(junk).ok, decodeProgress(junk).ok, `junk: "${junk}"`);
  }
});

test('a dashed, lowercase code decodes on both sides', () => {
  const code = vectors.vectors[0].code;
  const messy = formatCode(code).toLowerCase();
  assert.deepEqual(plain(gsDecode(messy).value), decodeProgress(messy).value);
});

// --- the spreadsheet-facing wrapper --------------------------------------

test('DECODE_PROGRESS returns the right column for each field', () => {
  const v = vectors.vectors[0];
  const code = v.code;
  assert.equal(DECODE_PROGRESS(code, 'class'), '6A');
  assert.equal(DECODE_PROGRESS(code, 'student'), 14);
  assert.equal(DECODE_PROGRESS(code, 'week'), 3);
  assert.equal(DECODE_PROGRESS(code, 'accuracy'), 92);
  assert.equal(DECODE_PROGRESS(code, 'days'), 4);
  assert.equal(DECODE_PROGRESS(code, 'median'), 2.4);
  assert.equal(DECODE_PROGRESS(code, 'badge'), 'yes');
  assert.equal(DECODE_PROGRESS(code, 'missed'), '7 × 8, 42 ÷ 6, 372 ÷ 4');
  assert.equal(DECODE_PROGRESS(code, 'status'), 'ok');
});

test('DECODE_PROGRESS maps over a range, the way ARRAYFORMULA hands it one', () => {
  const range = vectors.vectors.slice(0, 3).map((v) => [v.code]);
  const weeks = plain(DECODE_PROGRESS(range, 'week'));
  assert.deepEqual(weeks, [[3], [5], [8]]);
});

test('DECODE_PROGRESS leaves blank cells blank rather than erroring', () => {
  for (const blank of ['', null, undefined]) {
    assert.equal(DECODE_PROGRESS(blank, 'week'), '');
  }
  assert.deepEqual(plain(DECODE_PROGRESS([['', '']], 'week')), [['', '']]);
});

test('a bad code reports the reason in the status column and blanks the rest', () => {
  const bad = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  assert.match(String(DECODE_PROGRESS(bad, 'status')), /Checksum|version|character/);
  assert.equal(DECODE_PROGRESS(bad, 'week'), '');
});

// --- and the self-test the teacher can run inside Apps Script -------------

test('the .gs self-test passes against its own pasted vectors', () => {
  const failures = sandbox.testDecoder();
  assert.equal(failures, 0, 'testDecoder() reported failures inside the .gs file');
});

test('the vectors pasted into the .gs file match tests/vectors.json', () => {
  const pasted = plain(sandbox.TEST_VECTORS).map((v) => v.code);
  const canonical = vectors.vectors.map((v) => v.code);
  assert.deepEqual(
    pasted, canonical,
    'the vectors inside progress-form.gs have drifted from tests/vectors.json -- ' +
      're-paste them after regenerating',
  );
});

// --- version 2 ------------------------------------------------------------
//
// The same contract as v1, for the same reason: DECODE_PROGRESS() is a second
// implementation of the wire format, and two implementations drift silently.

test('the Apps Script decoder agrees with the JS one on 500 random v2 codes', () => {
  const rng = createRng('gs-v2-agreement');
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
    const code = encodeProgressV2({
      classCode,
      studentNumber: rng.int(0, 255),
      grade: rng.int(1, 8),
      skillIndex: rng.int(0, 31),
      stage: rng.int(0, 3),
      accuracy: rng.int(0, 100) / 100,
      daysPractised: rng.int(0, 7),
      mastered: rng.chance(0.5),
      missed,
    });

    const js = decodeProgressV2(code);
    const gs = gsDecode(code);
    assert.ok(gs.ok, `payload ${i} failed in Apps Script: ${gs.error}`);
    const g = plain(gs.value);
    for (const key of [
      'version', 'classCode', 'studentNumber', 'grade', 'skillIndex', 'stage',
      'accuracyPct', 'daysPractised', 'mastered',
    ]) {
      assert.equal(g[key], js.value[key], `payload ${i}: ${key} differs`);
    }
    assert.deepEqual(g.missed, js.value.missed, `payload ${i}: missed facts differ`);
  }
});

test('the Apps Script decoder still reads every v1 vector after the v2 change', () => {
  for (const v of vectors.vectors) {
    const gs = gsDecode(v.code);
    assert.ok(gs.ok, `v1 vector "${v.name}" broke in Apps Script: ${gs.error}`);
    assert.deepEqual(plain(gs.value), decodeProgress(v.code).value);
  }
});

test('both sides route a code to the right version by length alone', () => {
  const v1 = vectors.vectors[0].code;
  const v2 = encodeProgressV2({
    classCode: '6B', studentNumber: 5, grade: 6, skillIndex: 3, stage: 2,
    accuracy: 0.9, daysPractised: 3, mastered: true, missed: [],
  });
  assert.equal(gsDecode(v1).value.version, 1);
  assert.equal(gsDecode(v2).value.version, 2);
  assert.equal(DECODE_PROGRESS(v1, 'version'), 1);
  assert.equal(DECODE_PROGRESS(v2, 'version'), 2);
});

test('the spreadsheet columns work for both versions', () => {
  const v2 = encodeProgressV2({
    classCode: '6B', studentNumber: 5, grade: 4, skillIndex: 1, stage: 2,
    accuracy: 0.92, daysPractised: 4, mastered: true, missed: ['mult:7x8'],
  });
  assert.equal(DECODE_PROGRESS(v2, 'class'), '6B');
  assert.equal(DECODE_PROGRESS(v2, 'student'), 5);
  assert.equal(DECODE_PROGRESS(v2, 'grade'), 4);
  // Grade 4, skill index 1 is "Divide by 1 digit" in curriculum/grade-4.json.
  assert.equal(DECODE_PROGRESS(v2, 'skill'), 'Divide by 1 digit');
  assert.equal(DECODE_PROGRESS(v2, 'stage'), 3, 'stages are shown 1-based to a teacher');
  assert.equal(DECODE_PROGRESS(v2, 'accuracy'), 92);
  assert.equal(DECODE_PROGRESS(v2, 'badge'), 'yes');
  // A v2 code has no week and no median; those cells must be blank, not NaN.
  assert.equal(DECODE_PROGRESS(v2, 'week'), '');
  assert.equal(DECODE_PROGRESS(v2, 'median'), '');

  // A v1 code still fills the v1 columns, and leaves the v2 ones blank.
  const v1 = vectors.vectors[0].code;
  assert.equal(DECODE_PROGRESS(v1, 'week'), 3);
  assert.equal(DECODE_PROGRESS(v1, 'grade'), '');
  assert.equal(DECODE_PROGRESS(v1, 'skill'), '');
});

test('the .gs skill names match the curriculum order that v2 encodes', () => {
  // v2 encodes a skill by its POSITION in the grade file. If that order ever
  // changes, every code already in a teacher's Sheet starts naming the wrong
  // skill -- silently. This test is the thing standing in the way.
  const names = plain(sandbox.SKILL_NAMES);
  for (const [grade, list] of Object.entries(names)) {
    const file = new URL(`../../curriculum/grade-${grade}.json`, import.meta.url);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(
      list.length, data.skills.length,
      `grade ${grade}: .gs lists ${list.length} skills, the curriculum has ${data.skills.length}`,
    );
    list.forEach((name, i) => {
      assert.equal(
        name, data.skills[i].title.en,
        `grade ${grade} position ${i}: .gs says "${name}", curriculum says "${data.skills[i].title.en}"`,
      );
    });
  }
});
