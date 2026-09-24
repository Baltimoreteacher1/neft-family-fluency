// The curriculum is data, so these are the checks a type system would do if
// this were a typed language: every skill names a generator that exists, every
// stage produces correct arithmetic, and nothing references a grade that is
// not written yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import { buildSession, generateItem, GENERATORS } from '../../engine/session.js';

const here = (p) => new URL(p, import.meta.url);
const index = JSON.parse(readFileSync(here('../../curriculum/index.json'), 'utf8'));

/** The grades whose files exist. Grades still to be written are skipped. */
const written = index.grades.filter((g) => existsSync(here(`../../curriculum/${g.file}`)));

const grades = written.map((g) => ({
  meta: g,
  data: JSON.parse(readFileSync(here(`../../curriculum/${g.file}`), 'utf8')),
}));

const allSkills = grades.flatMap(({ meta, data }) =>
  data.skills.map((s) => ({ ...s, grade: meta.grade })),
);

const SAMPLES = 1000;

test('at least one grade is written', () => {
  assert.ok(grades.length > 0, 'no grade files exist');
});

test('every skill has an id, a standard, both languages and three stages', () => {
  const ids = new Set();
  for (const skill of allSkills) {
    assert.ok(skill.id, 'a skill has no id');
    assert.ok(!ids.has(skill.id), `duplicate skill id ${skill.id}`);
    ids.add(skill.id);

    assert.ok(skill.ccss, `${skill.id} has no standard`);
    for (const lang of ['en', 'es']) {
      assert.ok(skill.title?.[lang], `${skill.id} has no ${lang} title`);
      assert.ok(skill.strategy?.[lang], `${skill.id} has no ${lang} strategy`);
    }
    assert.equal(skill.stages?.length, 3, `${skill.id} must have exactly 3 stages`);
  }
});

test('every skill names a generator that exists', () => {
  for (const skill of allSkills) {
    assert.ok(
      GENERATORS[skill.generator],
      `${skill.id} names missing generator "${skill.generator}"`,
    );
  }
});

test('grade files agree with the index', () => {
  for (const { meta, data } of grades) {
    assert.equal(data.grade, meta.grade, `${meta.file} says grade ${data.grade}`);
    assert.equal(data.schemaVersion, 2, `${meta.file} is not schema 2`);
  }
});

for (const skill of allSkills) {
  for (let stage = 0; stage < skill.stages.length; stage++) {
    test(`${skill.id} stage ${stage}: ${SAMPLES} samples are arithmetically correct`, () => {
      const rng = createRng(`verify|${skill.id}|${stage}`);
      for (let i = 0; i < SAMPLES; i++) {
        const item = generateItem(rng, skill, stage);
        const where = `${skill.id} stage ${stage} sample ${i}: ${item.prompt}`;

        assert.ok(item.id, `${where} has no id`);
        assert.ok(item.prompt, `${where} has no prompt`);
        assert.notEqual(item.answer, undefined, `${where} has no answer`);

        if (item.kind === 'procedure') {
          assert.ok(Number.isInteger(item.quotient), `${where} quotient not an integer`);
          assert.ok(
            item.remainder >= 0 && item.remainder < item.b,
            `${where} remainder out of range`,
          );
          assert.equal(
            item.b * item.quotient + item.remainder, item.a,
            `${where} does not satisfy dividend = divisor x quotient + remainder`,
          );
          continue;
        }

        assert.ok(Number.isInteger(item.answer), `${where} answer is not an integer`);
        assert.ok(item.answer >= 0, `${where} answer is negative`);

        if (item.op === 'mult') {
          assert.equal(item.a * item.b, item.answer, `${where} product is wrong`);
        } else if (item.op === 'div') {
          assert.equal(item.a % item.b, 0, `${where} does not divide evenly`);
          assert.equal(item.a / item.b, item.answer, `${where} quotient is wrong`);
        } else {
          assert.fail(`${where} has unknown op "${item.op}"`);
        }

        for (const d of item.distractors || []) {
          assert.notEqual(d, item.answer, `${where} lists the answer as a distractor`);
        }
      }
    });
  }
}

test('a session has no duplicate problems', () => {
  for (const skill of allSkills) {
    for (let stage = 0; stage < 3; stage++) {
      for (let trial = 0; trial < 10; trial++) {
        const set = buildSession(skill, {
          stage, count: 12, seed: `dupes|${skill.id}|${stage}|${trial}`, review: true,
        });
        const ids = set.items.map((i) => i.id);
        assert.equal(
          new Set(ids).size, ids.length,
          `${skill.id} stage ${stage} trial ${trial} produced a duplicate`,
        );
      }
    }
  }
});

test('sessions are reproducible from their seed', () => {
  const skill = allSkills[0];
  const a = buildSession(skill, { stage: 0, count: 12, seed: 'same', review: true });
  const b = buildSession(skill, { stage: 0, count: 12, seed: 'same', review: true });
  assert.deepEqual(
    a.items.map((i) => i.prompt), b.items.map((i) => i.prompt),
    'the same seed produced a different session -- a reload would change the problems',
  );
});

test('a Check draws only from its own stage, never from review', () => {
  for (const skill of allSkills) {
    const set = buildSession(skill, { stage: 2, count: 12, seed: `check|${skill.id}`, review: false });
    for (const item of set.items) {
      assert.equal(item.stage, 2, `${skill.id} check pulled a stage ${item.stage} item`);
    }
  }
});

test('every grade accent passes AA against the dark background', () => {
  // The accents exist so a child can recognise their grade. One that fails
  // contrast is decoration that costs somebody the ability to read the screen.
  const BG = [0x14, 0x16, 0x1a]; // --paper in dark mode
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  for (const g of index.grades) {
    const hex = g.accent.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const c = ratio(rgb, BG);
    // 3:1 is the AA bar for large text and UI components, which is what these
    // accents are used for (headings, rings, borders).
    assert.ok(c >= 3, `grade ${g.grade} accent ${g.accent} is only ${c.toFixed(2)}:1 on the dark background`);
  }
});
