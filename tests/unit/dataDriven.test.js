// "Adding Week 9 means editing JSON only" is a promise in the README, and a
// promise about future work is worth exactly as much as the test that keeps it.
//
// These tests build a synthetic week 9 in memory and check that every part of
// the system that has to know about it derives it from the curriculum, rather
// than from a number someone typed once.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildSet, GENERATORS } from '../../engine/setBuilder.js';
import { spiralPlan } from '../../engine/mastery.js';
import { createRng } from '../../engine/rng.js';

const curriculum = JSON.parse(
  readFileSync(new URL('../../curriculum/skills.json', import.meta.url), 'utf8'),
);

/** The curriculum with one more week bolted on, and no code changed. */
function withExtraWeek() {
  const next = curriculum.weeks.length + 1;
  return {
    ...curriculum,
    strand: { ...curriculum.strand, levels: next },
    weeks: [
      ...curriculum.weeks,
      {
        week: next,
        level: next,
        mode: 'fact',
        title: { en: 'Squares', es: 'Cuadrados' },
        strategy: { id: 'skip-count-double', en: 'A number times itself', es: 'Un numero por si mismo' },
        skills: [
          {
            id: `w${next}-squares`,
            generator: 'multFact',
            params: { factors: [11, 12], others: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], commute: true },
            strategyTag: 'skip-count-double',
          },
        ],
        game: { id: 'raceTrack', params: { seconds: 60 } },
      },
    ],
  };
}

test('a week added to the JSON generates correct items with no code change', () => {
  const extended = withExtraWeek();
  const week = extended.weeks.length;

  const set = buildSet(extended, { week, kind: 'check', seed: 'new-week' });
  assert.equal(set.items.length, extended.defaults.check.items);

  for (const item of set.items) {
    assert.equal(item.a * item.b, item.answer, `${item.prompt} is wrong`);
    assert.equal(item.skillId, `w${week}-squares`);
  }
});

test('the new week spirals the earlier ones in, without being told they exist', () => {
  const extended = withExtraWeek();
  const week = extended.weeks.length;
  const set = buildSet(extended, { week, kind: 'practice', seed: 'new-week-practice' });
  const skills = new Set(set.items.map((i) => i.skillId));
  assert.ok(skills.size > 1, 'the new week did not spiral earlier weeks in');
});

test('the spiral mixer has no hardcoded ceiling on the week number', () => {
  const rng = createRng('far-future');
  // Week 40 is well past anything this strand contains. If a bound were
  // written into the mixer, this is where it would show up.
  const plan = spiralPlan({
    currentWeek: 40,
    itemCount: 20,
    spiral: curriculum.defaults.spiral,
    rng,
  });
  assert.equal(plan.length, 20);
  assert.ok(plan.every((w) => w >= 1 && w <= 40));
});

test('every week has a family card, and every card has a week', () => {
  const dir = new URL('../../family/', import.meta.url);
  const cards = readdirSync(dir).filter((f) => /^week-\d\d\.json$/.test(f));

  assert.equal(
    cards.length,
    curriculum.weeks.length,
    `${cards.length} family cards for ${curriculum.weeks.length} weeks -- they must match`,
  );

  for (const week of curriculum.weeks) {
    const name = `week-${String(week.week).padStart(2, '0')}.json`;
    assert.ok(cards.includes(name), `week ${week.week} has no family card (${name})`);

    const card = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    assert.equal(card.week, week.week, `${name} says it is week ${card.week}`);
    for (const lang of ['en', 'es']) {
      assert.ok(card.why?.[lang], `${name} has no ${lang} explanation`);
      assert.ok(card.say?.[lang]?.length, `${name} has no ${lang} phrases`);
      assert.ok(card.game?.how?.[lang]?.length, `${name} has no ${lang} game steps`);
    }
  }
});

test('no source file hardcodes the number of weeks', () => {
  // The family view used to cap the week at 8, which silently made week 9
  // unreachable while every other part of the system handled it fine.
  const files = [
    '../../family/family.js',
    '../../views/levels.js',
    '../../views/week.js',
    '../../engine/mastery.js',
    '../../engine/progress.js',
    '../../sw.js',
  ];
  for (const rel of files) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    // Look for comparisons against a literal week count.
    const offender = src.match(/week\s*[<>]=?\s*(8|9)\b/i);
    assert.equal(
      offender,
      null,
      `${rel} compares a week against a literal (${offender?.[0]}) -- derive it from the curriculum`,
    );
  }
});

test('the service worker does not list the family cards one by one', () => {
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  const listed = sw.match(/'family\/week-\d\d\.json'/g) || [];
  assert.equal(
    listed.length,
    0,
    'sw.js lists week cards individually, so a new week would not be cached for offline use',
  );
});

test('every generator named anywhere in the curriculum exists', () => {
  for (const week of withExtraWeek().weeks) {
    for (const skill of week.skills) {
      assert.ok(GENERATORS[skill.generator], `${skill.id} names a missing generator`);
    }
  }
});
