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
