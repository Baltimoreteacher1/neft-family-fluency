// Math verification. Every generator is sampled 1,000 times from seeded RNGs
// and every single item is checked against the arithmetic it claims.
//
// This is the test that matters most in this repo. A generator that emits a
// wrong answer teaches a child the wrong fact, and nobody -- not the family,
// not the teacher -- is positioned to catch it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import { buildSet, generateItem, GENERATORS } from '../../engine/setBuilder.js';

const curriculum = JSON.parse(
  readFileSync(new URL('../../curriculum/skills.json', import.meta.url), 'utf8'),
);

const SAMPLES = 1000;

/** Every skill in the curriculum, flattened, with its week. */
const allSkills = curriculum.weeks.flatMap((w) =>
  w.skills.map((s) => ({ ...s, week: w.week, mode: w.mode })),
);

test('every skill names a generator that exists', () => {
  for (const skill of allSkills) {
    assert.ok(
      GENERATORS[skill.generator],
      `skill ${skill.id} names missing generator "${skill.generator}"`,
    );
  }
});

test('every generator is exercised by at least one skill', () => {
  const used = new Set(allSkills.map((s) => s.generator));
  for (const name of Object.keys(GENERATORS)) {
    assert.ok(used.has(name), `generator ${name} is dead code -- no skill uses it`);
  }
});

for (const skill of allSkills) {
  test(`${skill.id}: ${SAMPLES} seeded samples are arithmetically correct`, () => {
    const rng = createRng(`verify|${skill.id}`);

    for (let i = 0; i < SAMPLES; i++) {
      const item = generateItem(rng, skill);
      const where = `${skill.id} sample ${i}: ${item.prompt}`;

      assert.ok(item.id, `${where} has no id`);
      assert.ok(item.prompt, `${where} has no prompt`);
      assert.notEqual(item.answer, undefined, `${where} has no answer`);

      if (item.kind === 'procedure') {
        verifyLongDivision(item, where);
        continue;
      }

      // Fact items: the answer must be a non-negative integer and must equal
      // the operation applied to the operands.
      assert.ok(
        Number.isInteger(item.answer),
        `${where} answer ${item.answer} is not an integer`,
      );
      assert.ok(item.answer >= 0, `${where} answer ${item.answer} is negative`);

      if (item.op === 'mult') {
        assert.equal(item.a * item.b, item.answer, `${where} product is wrong`);
      } else if (item.op === 'div') {
        assert.equal(
          item.a % item.b,
          0,
          `${where} does not divide evenly -- this week teaches whole quotients`,
        );
        assert.equal(item.a / item.b, item.answer, `${where} quotient is wrong`);
      } else {
        assert.fail(`${where} has unknown op "${item.op}"`);
      }

      // Distractors must be plausible-but-wrong, never accidentally right.
      for (const d of item.distractors || []) {
        assert.notEqual(d, item.answer, `${where} lists the answer as a distractor`);
        assert.ok(Number.isInteger(d) && d > 0, `${where} distractor ${d} is not a positive integer`);
      }

      // Extended facts must actually be extended, and their basic fact must hold.
      if (item.basicFact) {
        const bf = item.basicFact;
        if (item.op === 'mult') {
          assert.equal(bf.a * bf.b, bf.answer, `${where} basic fact is wrong`);
          assert.equal(bf.a * bf.scale, item.a, `${where} scale does not rebuild the factor`);
        } else {
          assert.equal(
            bf.dividend / bf.divisor,
            bf.answer,
            `${where} basic fact quotient is wrong`,
          );
        }
      }
    }
  });
}

function verifyLongDivision(item, where) {
  assert.ok(Number.isInteger(item.quotient), `${where} quotient is not an integer`);
  assert.ok(Number.isInteger(item.remainder), `${where} remainder is not an integer`);
  assert.ok(
    item.remainder >= 0 && item.remainder < item.b,
    `${where} remainder ${item.remainder} is not in [0, ${item.b})`,
  );
  assert.equal(
    item.b * item.quotient + item.remainder,
    item.a,
    `${where} does not satisfy dividend = divisor x quotient + remainder`,
  );

  // The step trace must reconstruct the quotient digit by digit, or the
  // procedure workspace would mark correct work wrong.
  assert.ok(item.steps.length > 0, `${where} has no steps`);
  const fromSteps = Number(item.steps.map((s) => s.digit).join(''));
  assert.equal(fromSteps, item.quotient, `${where} step digits do not spell the quotient`);

  // No step may write a digit of 10 or more, and each step's arithmetic holds.
  for (const s of item.steps) {
    assert.ok(s.digit >= 0 && s.digit <= 9, `${where} step digit ${s.digit} is not a single digit`);
    assert.equal(s.digit * item.b, s.product, `${where} step product is wrong`);
    assert.equal(s.workingDividend - s.product, s.remainder, `${where} step remainder is wrong`);
    assert.ok(
      s.remainder >= 0 && s.remainder < item.b,
      `${where} step remainder ${s.remainder} is out of range`,
    );
  }
  // The last step's remainder is the item's remainder.
  assert.equal(
    item.steps[item.steps.length - 1].remainder,
    item.remainder,
    `${where} final step remainder disagrees with the item`,
  );

  assert.ok(item.estimate.about > 0, `${where} estimate is not positive`);
}

test('a practice set has no duplicate items', () => {
  for (const week of curriculum.weeks) {
    for (let trial = 0; trial < 25; trial++) {
      const set = buildSet(curriculum, {
        week: week.week,
        kind: 'practice',
        seed: `dupes|${week.week}|${trial}`,
      });
      const ids = set.items.map((i) => i.id);
      assert.equal(
        new Set(ids).size,
        ids.length,
        `week ${week.week} trial ${trial} produced a duplicate item`,
      );
    }
  }
});

test('a Friday Check has no duplicates and stays on this week', () => {
  for (const week of curriculum.weeks) {
    const set = buildSet(curriculum, {
      week: week.week,
      kind: 'check',
      seed: `check|${week.week}`,
    });
    assert.equal(set.items.length, curriculum.defaults.check.items);
    const ids = set.items.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, `week ${week.week} check has duplicates`);

    const weekSkillIds = new Set(week.skills.map((s) => s.id));
    for (const item of set.items) {
      assert.ok(
        weekSkillIds.has(item.skillId),
        `week ${week.week} check pulled in ${item.skillId}, which is not this week's skill`,
      );
    }
  }
});

test('sets are reproducible from their seed', () => {
  const a = buildSet(curriculum, { week: 5, kind: 'practice', seed: 'same-seed' });
  const b = buildSet(curriculum, { week: 5, kind: 'practice', seed: 'same-seed' });
  assert.deepEqual(
    a.items.map((i) => i.prompt),
    b.items.map((i) => i.prompt),
    'the same seed produced a different set -- a reload would change the problems',
  );
});

test('practice sets spiral in earlier weeks, checks do not', () => {
  const set = buildSet(curriculum, { week: 6, kind: 'practice', seed: 'spiral' });
  const skillIds = new Set(set.items.map((i) => i.skillId));
  assert.ok(skillIds.size > 1, 'week 6 practice drew only one skill -- no spiral happened');
});
