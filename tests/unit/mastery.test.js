// Mastery thresholds, with the edges pinned. These rules decide whether a child
// sees a badge on Friday, so "close enough" is not a standard that applies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../../engine/rng.js';
import {
  median,
  accuracy,
  evaluateCheck,
  missedFacts,
  spiralPlan,
  itemWeight,
  weeklyGoalMet,
} from '../../engine/mastery.js';

const index = JSON.parse(
  readFileSync(new URL('../../curriculum/index.json', import.meta.url), 'utf8'),
);
// The v2 curriculum keeps one pass bar; the fact/procedure split lives in the
// skill's own targetSeconds now.
const CRITERIA = {
  fact: { minAccuracy: index.defaults.check.passAccuracy, maxMedianMs: 3000 },
  procedure: { minAccuracy: 0.85, maxMedianMs: null },
};

/** n attempts, `correct` of them right, every response taking `ms`. */
function attempts(n, correct, ms) {
  return Array.from({ length: n }, (_, i) => ({
    itemId: `mult:${i}x2`,
    correct: i < correct,
    ms,
  }));
}

test('median ignores a single wild outlier', () => {
  assert.equal(median([1000, 1000, 1000, 1000, 45000]), 1000);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('accuracy of an empty set is zero, not NaN', () => {
  assert.equal(accuracy([]), 0);
});

test('fact mode: exactly 90% and exactly 3000ms both pass', () => {
  // 18/20 is exactly 0.9, and the rule is >=, so this is the boundary.
  const r = evaluateCheck(attempts(20, 18, 3000), 'fact', CRITERIA);
  assert.equal(r.accuracy, 0.9);
  assert.equal(r.medianMs, 3000);
  assert.ok(r.mastered, 'the exact threshold must count as met');
});

test('fact mode: one item below the accuracy bar fails', () => {
  const r = evaluateCheck(attempts(20, 17, 2000), 'fact', CRITERIA);
  assert.equal(r.accuracyMet, false);
  assert.equal(r.mastered, false);
  assert.equal(r.nextFocus, 'accuracy');
});

test('fact mode: 1ms over the speed bar fails, and names speed as the focus', () => {
  const r = evaluateCheck(attempts(20, 20, 3001), 'fact', CRITERIA);
  assert.equal(r.accuracyMet, true);
  assert.equal(r.speedMet, false);
  assert.equal(r.mastered, false);
  assert.equal(r.nextFocus, 'speed');
});

test('fact mode: fast wrong answers do not buy a badge', () => {
  // 10 right at 5s, 10 wrong at 100ms. Including wrong answers in the median
  // would give 2.55s and pass the speed rule on guessing alone.
  const mixed = [
    ...Array.from({ length: 10 }, (_, i) => ({ itemId: `a${i}`, correct: true, ms: 5000 })),
    ...Array.from({ length: 10 }, (_, i) => ({ itemId: `b${i}`, correct: false, ms: 100 })),
  ];
  const r = evaluateCheck(mixed, 'fact', CRITERIA);
  assert.equal(r.medianMs, 5000, 'only correct answers may count toward speed');
  assert.equal(r.mastered, false);
});

test('procedure mode: 85% passes with no speed requirement at all', () => {
  const slow = evaluateCheck(attempts(20, 17, 90000), 'procedure', CRITERIA);
  assert.equal(slow.accuracy, 0.85);
  assert.equal(slow.speedMet, true, 'procedure mode must not gate on time');
  assert.ok(slow.mastered);

  const below = evaluateCheck(attempts(20, 16, 1000), 'procedure', CRITERIA);
  assert.equal(below.mastered, false);
});

test('an unknown mode is a bug, not a silent pass', () => {
  assert.throws(() => evaluateCheck(attempts(20, 20, 1000), 'nonsense', CRITERIA));
});

test('missed facts come back worst-first and capped', () => {
  const log = [
    { itemId: 'mult:7x8', correct: false, ms: 1 },
    { itemId: 'mult:7x8', correct: false, ms: 1 },
    { itemId: 'mult:7x8', correct: false, ms: 1 },
    { itemId: 'mult:6x9', correct: false, ms: 1 },
    { itemId: 'mult:6x9', correct: false, ms: 1 },
    { itemId: 'mult:3x4', correct: false, ms: 1 },
    { itemId: 'mult:2x2', correct: false, ms: 1 },
    { itemId: 'mult:5x5', correct: true, ms: 1 },
  ];
  const top = missedFacts(log, 3);
  assert.deepEqual(top.map((t) => t.itemId), ['mult:7x8', 'mult:6x9', 'mult:2x2']);
  assert.equal(top[0].count, 3);
  assert.equal(missedFacts([], 3).length, 0);
  assert.ok(!missedFacts(log, 3).some((t) => t.itemId === 'mult:5x5'));
});

test('week 1 has nothing to spiral into', () => {
  const rng = createRng('spiral-1');
  const plan = spiralPlan({
    currentWeek: 1, itemCount: 16, spiral: { currentWeight: 0.7, pastWeight: 0.3 }, rng,
  });
  assert.equal(plan.length, 16);
  assert.ok(plan.every((w) => w === 1));
});

test('later weeks mix roughly 70/30 current to past', () => {
  const rng = createRng('spiral-6');
  let current = 0;
  let total = 0;
  for (let trial = 0; trial < 200; trial++) {
    const plan = spiralPlan({
      currentWeek: 6, itemCount: 16, spiral: { currentWeight: 0.7, pastWeight: 0.3 }, rng,
    });
    assert.equal(plan.length, 16);
    assert.ok(plan.every((w) => w >= 1 && w <= 6));
    current += plan.filter((w) => w === 6).length;
    total += plan.length;
  }
  const share = current / total;
  assert.ok(share > 0.6 && share < 0.8, `current-week share was ${share.toFixed(2)}, expected ~0.7`);
});

test('a missed fact is weighted up, an unmissed one is not', () => {
  const boost = 3;
  assert.equal(itemWeight('mult:7x8', ['mult:7x8'], boost), boost);
  assert.equal(itemWeight('mult:2x2', ['mult:7x8'], boost), 1);
});

test('the weekly goal is 3 of 5 days, and missing a week costs nothing', () => {
  const goal = { daysPerWeek: index.defaults.goal.daysPerWeek };
  assert.equal(goal.daysPerWeek, 3);
  assert.equal(weeklyGoalMet(2, goal), false);
  assert.equal(weeklyGoalMet(3, goal), true);
  assert.equal(weeklyGoalMet(5, goal), true);
  // There is no streak state to reset: the function is a pure comparison.
  assert.equal(weeklyGoalMet(0, goal), false);
});
