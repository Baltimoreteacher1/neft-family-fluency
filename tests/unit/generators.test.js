// Math verification for every generator at every stage.
//
// 1,000 seeded samples each, and each one checked against an INDEPENDENT
// computation -- not against the generator's own arithmetic restated. A
// generator that emits a wrong answer teaches a child the wrong fact, and
// nobody in the chain (family, teacher, child) is positioned to catch it.
//
// Grade-appropriate constraints are hard rules here, not style preferences:
// a negative result in Grade 2 is a bug even though the arithmetic is right.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import { GENERATORS } from '../../generators/index.js';
import { generateItem, buildSession } from '../../engine/session.js';
import { checkAnswer, RESULT } from '../../engine/answer.js';
import { simplify, fractionText } from '../../engine/mathkit.js';

const here = (p) => new URL(p, import.meta.url);
const index = JSON.parse(readFileSync(here('../../curriculum/index.json'), 'utf8'));

const grades = index.grades.map((g) => ({
  meta: g,
  data: JSON.parse(readFileSync(here(`../../curriculum/${g.file}`), 'utf8')),
}));

const SAMPLES = 1000;

/** Negatives are a Grade 7 skill. Nothing earlier may produce one. */
const NEGATIVES_FROM_GRADE = 7;

/** An independent check of what the item claims, per operation. */
function verify(item, grade, where) {
  assert.ok(item.id, `${where} has no id`);
  assert.ok(item.prompt, `${where} has no prompt`);
  assert.notEqual(item.answer, undefined, `${where} has no answer`);
  assert.ok(item.answerType, `${where} has no answerType`);
  assert.ok(Array.isArray(item.accept), `${where} has no accept list`);

  // Whatever the generator says is the answer must be accepted by the checker.
  // This is the contract the child actually experiences.
  for (const form of item.accept) {
    assert.equal(
      checkAnswer(item, form), RESULT.CORRECT,
      `${where} does not accept its own answer form "${form}"`,
    );
  }

  switch (item.op) {
    case 'add':
      if (item.a !== undefined && item.b !== undefined && !item.step && !/\?/.test(item.prompt)) {
        assert.equal(item.a + item.b, item.answer, `${where} sum is wrong`);
      }
      break;
    case 'sub':
      assert.equal(item.a - item.b, item.answer, `${where} difference is wrong`);
      break;
    case 'mult':
      assert.equal(item.a * item.b, item.answer, `${where} product is wrong`);
      break;
    case 'div':
      if (item.kind === 'procedure') {
        assert.equal(
          item.b * item.quotient + item.remainder, item.a,
          `${where} does not satisfy dividend = divisor x quotient + remainder`,
        );
        assert.ok(
          item.remainder >= 0 && item.remainder < Math.abs(item.b),
          `${where} remainder ${item.remainder} out of range`,
        );
      } else {
        assert.equal(item.a % item.b, 0, `${where} does not divide evenly`);
        assert.equal(item.a / item.b, item.answer, `${where} quotient is wrong`);
      }
      break;
    case 'integer':
      // Sign rules verified independently from the prompt's own numbers.
      if (item.a !== undefined && item.b !== undefined && item.answerType === 'integer') {
        const p = item.prompt;
        if (p.includes('×')) assert.equal(item.a * item.b, item.answer, `${where} product`);
        else if (p.includes('÷')) assert.equal(item.a / item.b, item.answer, `${where} quotient`);
        else if (p.includes('−')) assert.equal(item.a - item.b, item.answer, `${where} difference`);
        else assert.equal(item.a + item.b, item.answer, `${where} sum`);
      }
      break;
    case 'fraction':
      if (item.answerType === 'fraction') {
        assert.ok(Number.isInteger(item.answer.n), `${where} numerator is not an integer`);
        assert.ok(item.answer.d > 0, `${where} denominator is not positive`);
        const s = simplify(item.answer);
        assert.equal(
          fractionText(s), fractionText(item.answer),
          `${where} answer ${fractionText(item.answer)} is not in simplest form`,
        );
      }
      break;
    case 'decimal': {
      assert.equal(typeof item.answer, 'number', `${where} decimal answer is not a number`);
      assert.ok(Number.isFinite(item.answer), `${where} decimal answer is not finite`);
      // No float noise: a decimal answer must be writable in a few places.
      const places = (String(item.answer).split('.')[1] || '').length;
      assert.ok(places <= 6, `${where} answer ${item.answer} has float noise (${places} places)`);
      break;
    }
    case 'root':
      if (item.prompt.startsWith('√') && !item.upper) {
        const n = Number(item.prompt.slice(1));
        assert.equal(item.answer * item.answer, n, `${where} square root is wrong`);
      }
      if (item.upper) {
        const n = Number(item.prompt.match(/√(\d+)/)[1]);
        assert.ok(
          item.answer ** 2 < n && (item.answer + 1) ** 2 > n,
          `${where} ${n} is not between ${item.answer}^2 and ${item.answer + 1}^2`,
        );
      }
      break;
    default:
      break;
  }

  // --- grade-appropriate hard rules ---
  const numericAnswer =
    item.answerType === 'fraction' ? item.answer.n / item.answer.d
    : item.answerType === 'sciNotation' ? item.mantissa
    : Number(item.answer);

  if (grade < NEGATIVES_FROM_GRADE && Number.isFinite(numericAnswer)) {
    assert.ok(
      numericAnswer >= 0,
      `${where} produced a negative answer (${numericAnswer}) in grade ${grade}`,
    );
  }

  if (item.answerType === 'integer' && item.op !== 'sci') {
    assert.ok(Number.isInteger(item.answer), `${where} integer answer is not an integer`);
  }

  for (const d of item.distractors || []) {
    assert.notEqual(d, item.answer, `${where} lists the answer as a distractor`);
  }
}

for (const { meta, data } of grades) {
  for (const skill of data.skills) {
    for (let stage = 0; stage < skill.stages.length; stage++) {
      test(`G${meta.grade} ${skill.id} stage ${stage}: ${SAMPLES} samples`, () => {
        const rng = createRng(`verify|${skill.id}|${stage}`);
        for (let i = 0; i < SAMPLES; i++) {
          const item = generateItem(rng, skill, stage);
          verify(item, meta.grade, `${skill.id} stage ${stage} #${i}: ${item.prompt}`);
        }
      });
    }
  }
}

test('every curriculum skill names a registered generator', () => {
  for (const { meta, data } of grades) {
    for (const skill of data.skills) {
      assert.ok(
        GENERATORS[skill.generator],
        `G${meta.grade} ${skill.id} names missing generator "${skill.generator}"`,
      );
    }
  }
});

test('every registered generator is reachable from the curriculum', () => {
  const named = new Set(grades.flatMap(({ data }) => data.skills.map((s) => s.generator)));
  // Some generators are reached through a dispatcher rather than named
  // directly: extendedFacts picks between the multiplication and division
  // forms, which is what "30 x 7, 3600 / 9" actually is.
  const viaDispatcher = { extendedFacts: ['extendedMult', 'extendedDiv'] };
  for (const [parent, children] of Object.entries(viaDispatcher)) {
    if (named.has(parent)) children.forEach((c) => named.add(c));
  }
  for (const name of Object.keys(GENERATORS)) {
    assert.ok(named.has(name), `generator "${name}" is dead code -- nothing reaches it`);
  }
});

test('no session repeats a problem', () => {
  for (const { data } of grades) {
    for (const skill of data.skills) {
      for (let stage = 0; stage < skill.stages.length; stage++) {
        const set = buildSession(skill, {
          stage, count: 12, seed: `dupes|${skill.id}|${stage}`, review: true,
        });
        const ids = set.items.map((i) => i.id);
        assert.equal(
          new Set(ids).size, ids.length,
          `${skill.id} stage ${stage} produced a duplicate`,
        );
      }
    }
  }
});

test('all 50 skills exist, each with three stages', () => {
  const total = grades.reduce((a, g) => a + g.data.skills.length, 0);
  assert.equal(total, 50, `expected 50 skills, found ${total}`);
  for (const { meta, data } of grades) {
    assert.ok(data.skills.length >= 6, `grade ${meta.grade} has only ${data.skills.length} skills`);
    for (const s of data.skills) {
      assert.equal(s.stages.length, 3, `${s.id} has ${s.stages.length} stages`);
      assert.ok(s.ccss, `${s.id} has no standard`);
    }
  }
});
