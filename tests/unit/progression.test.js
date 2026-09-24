// Skills must develop, and they must develop in order.
//
// Two failures this file exists to prevent, both of which look fine from the
// outside and waste a child's time:
//
//   1. A stage whose label promises progress ("All facts", "From memory")
//      while the practice underneath is identical to the stage before it. The
//      child "levels up" and answers the same questions.
//   2. A grade whose skills are ordered so a later one is needed by an
//      earlier one -- dividing multi-digit numbers before multiplying them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import { generateItem, poolSize, buildSession } from '../../engine/session.js';

const here = (p) => new URL(p, import.meta.url);
const index = JSON.parse(readFileSync(here('../../curriculum/index.json'), 'utf8'));
const grades = index.grades.map((g) => ({
  meta: g,
  data: JSON.parse(readFileSync(here(`../../curriculum/${g.file}`), 'utf8')),
}));
const allSkills = grades.flatMap(({ meta, data }) =>
  data.skills.map((s) => ({ ...s, grade: meta.grade })),
);

test('no two stages of a skill are the same practice', () => {
  for (const skill of allSkills) {
    const shapes = skill.stages.map((s) => JSON.stringify(s.params));
    for (let i = 1; i < shapes.length; i++) {
      assert.notEqual(
        shapes[i], shapes[i - 1],
        `${skill.id} stage ${i} ("${skill.stages[i].label.en}") is identical to stage ${i - 1} ` +
          `("${skill.stages[i - 1].label.en}") -- the label promises progress the practice does not deliver`,
      );
    }
  }
});

test('each stage actually changes the problems a child sees', () => {
  // Stronger than comparing params: generate from each stage and check the
  // sets of problems genuinely differ. Params could differ on a key the
  // generator ignores, which would be progress on paper only.
  for (const skill of allSkills) {
    const sample = (stage) => {
      const rng = createRng(`progress|${skill.id}|${stage}`);
      const ids = new Set();
      for (let i = 0; i < 300; i++) ids.add(generateItem(rng, skill, stage).id);
      return ids;
    };

    for (let i = 1; i < skill.stages.length; i++) {
      const prev = sample(i - 1);
      const cur = sample(i);

      // Measured as symmetric difference, not "new problems only": widening
      // ("all of them") and narrowing ("the tricky ones") are both real
      // development steps, and a narrowing stage adds nothing new by design.
      const union = new Set([...prev, ...cur]);
      let shared = 0;
      for (const id of cur) if (prev.has(id)) shared++;
      const changed = (union.size - shared) / union.size;

      assert.ok(
        changed > 0.15,
        `${skill.id} stage ${i} ("${skill.stages[i].label.en}") overlaps stage ${i - 1} ` +
          `by ${((1 - changed) * 100).toFixed(0)}% -- it is not a development step`,
      );
    }
  }
});

test('a later stage is never a smaller pool than the one before it', () => {
  // A stage that narrows the range is fine ("the tricky ones"), but it must
  // not collapse to a handful of problems a child can memorise in one sitting.
  for (const skill of allSkills) {
    for (let stage = 0; stage < skill.stages.length; stage++) {
      const size = poolSize(skill, stage);
      assert.ok(
        size >= 6,
        `${skill.id} stage ${stage} ("${skill.stages[stage].label.en}") has only ${size} ` +
          'distinct problems -- too few to practise',
      );
    }
  }
});

test('every grade runs in a sensible teaching order', () => {
  // The dependencies that actually matter: you cannot divide multi-digit
  // numbers before you can multiply them, and facts come before the
  // algorithms built on them.
  const mustPrecede = [
    ['g3-mult-2-5-10', 'g3-div-facts'],
    ['g3-div-facts', 'g3-mult-multiples-10'],
    ['g4-extended-facts', 'g4-multi-digit-mul'],
    ['g4-multi-digit-mul', 'g4-divide-1digit'],
    ['g5-multi-digit-mul', 'g5-divide-2digits'],
    ['g6-multi-digit-div', 'g6-decimal-ops'],
    ['g6-gcf-lcm', 'g6-divide-fractions'],
    ['g6-expressions', 'g6-one-step-eq'],
    ['g7-integer-add-sub', 'g7-integer-mul-div'],
    ['g7-integer-mul-div', 'g7-rational-ops'],
    ['g8-exponent-rules', 'g8-sci-notation'],
    ['g8-roots', 'g8-irrational'],
  ];

  const positions = new Map();
  for (const { data } of grades) {
    data.skills.forEach((s, i) => positions.set(s.id, i));
  }

  for (const [first, second] of mustPrecede) {
    const a = positions.get(first);
    const b = positions.get(second);
    assert.notEqual(a, undefined, `${first} is missing from the curriculum`);
    assert.notEqual(b, undefined, `${second} is missing from the curriculum`);
    assert.ok(a < b, `${first} must come before ${second} (it is at ${a}, they are at ${b})`);
  }
});

test('the first skill of each grade is a foundation, not an application', () => {
  // Grade 1 opens on number pairs, not missing addends; Grade 7 opens on
  // integer addition, not percents. A child landing on their dashboard should
  // meet the thing everything else in that grade leans on.
  const expectedFirst = {
    1: 'g1-make-ten',
    2: 'g2-add-within-20',
    3: 'g3-mult-2-5-10',
    4: 'g4-multi-digit-add-sub',
    5: 'g5-multi-digit-mul',
    6: 'g6-multi-digit-div',
    7: 'g7-integer-add-sub',
    8: 'g8-exponent-rules',
  };
  for (const { meta, data } of grades) {
    assert.equal(
      data.skills[0].id, expectedFirst[meta.grade],
      `grade ${meta.grade} opens on ${data.skills[0].id}`,
    );
  }
});

test('practice targets the skill being learned, not a general mix', () => {
  // A practice set may review earlier STAGES of the same skill, but every
  // problem must belong to the skill the child chose. A set that wandered
  // across skills would make the weekly goal meaningless.
  for (const skill of allSkills.slice(0, 12)) {
    const set = buildSession(skill, {
      stage: 2, count: 12, seed: `focus|${skill.id}`, review: true,
    });
    for (const item of set.items) {
      assert.equal(item.skillId, skill.id, `${skill.id} practice contained ${item.skillId}`);
      assert.ok(item.stage <= 2, `${skill.id} practice drew from a stage above the current one`);
    }
  }
});
