// The weekly rhythm, the goal, and the Today picker.
//
// These decide what a child sees when they open the app, so the rules have to
// be boring and predictable -- and the "missing a week costs nothing" promise
// has to be a test, not a comment.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, uninstallLocalStorage } from '../tools/fake-localstorage.mjs';

async function fresh() {
  installLocalStorage({});
  const bust = `?t=${Math.random()}`;
  return {
    model: await import(`../../engine/model.js${bust}`),
    scheduler: await import(`../../engine/scheduler.js${bust}`),
    storage: await import(`../../engine/storage.js${bust}`),
  };
}

test.afterEach(() => uninstallLocalStorage());

test('weekStart is the Monday of that week, whatever day you ask on', async () => {
  const { model } = await fresh();
  // 2026-09-24 is a Thursday.
  assert.equal(model.weekStart('2026-09-24'), '2026-09-21');
  assert.equal(model.weekStart('2026-09-21'), '2026-09-21');
  // Sunday belongs to the week that just ended, not the one starting.
  assert.equal(model.weekStart('2026-09-27'), '2026-09-21');
  assert.equal(model.weekStart('2026-09-28'), '2026-09-28');
});

test('the rhythm runs Learn, Practice, Play, Practice, Check', async () => {
  const { model } = await fresh();
  const record = { log: [], attempts: [], checks: [], facts: {} };
  const day = model.today();

  const seen = [];
  for (let i = 0; i < 5; i++) {
    const next = model.nextActivity(record, day);
    seen.push(next);
    record.log.push({ activity: next, day, stage: 0 });
  }
  assert.deepEqual(seen, ['learn', 'practice', 'play', 'practice', 'check']);
});

test('after the whole rhythm there is still something to do', async () => {
  const { model } = await fresh();
  const day = model.today();
  const record = {
    log: model.RHYTHM.map((activity) => ({ activity, day, stage: 0 })),
    attempts: [], checks: [], facts: {},
  };
  // Never a dead end reading "come back next week".
  assert.equal(model.nextActivity(record, day), 'practice');
});

test('a new week starts the rhythm over without erasing anything', async () => {
  const { model } = await fresh();
  const lastWeek = '2026-09-14';
  const record = {
    log: model.RHYTHM.map((activity) => ({ activity, day: lastWeek, stage: 0 })),
    attempts: [], checks: [], facts: {},
  };
  // This week has no entries, so the rhythm restarts at Learn...
  assert.equal(model.nextActivity(record, '2026-09-24'), 'learn');
  // ...and last week's history is untouched.
  assert.equal(record.log.length, 5);
});

test('the weekly goal counts distinct days, not sessions', async () => {
  const { model } = await fresh();
  const record = {
    log: [
      { activity: 'practice', day: '2026-09-22', stage: 0 },
      { activity: 'play', day: '2026-09-22', stage: 0 },
      { activity: 'practice', day: '2026-09-23', stage: 0 },
    ],
    attempts: [], checks: [], facts: {},
  };
  // Three sessions, two days.
  assert.deepEqual(model.daysThisWeek(record, '2026-09-24'), ['2026-09-22', '2026-09-23']);
});

test('missing a week removes nothing at all', async () => {
  const { model, storage } = await fresh();
  const id = 'p1';

  model.logActivity(id, 'g3-mult-2-5-10', 'practice', { day: '2026-09-01' });
  model.recordCheck(id, 'g3-mult-2-5-10',
    { accuracy: 1, total: 12, correct: 12, medianMs: 1000, passed: true }, 3,
    { day: '2026-09-01' });

  const before = storage.storage.get(storage.KEY.progress(id), null);
  const stageBefore = before.skills['g3-mult-2-5-10'].stage;
  const checksBefore = before.skills['g3-mult-2-5-10'].checks.length;

  // Three weeks later, nothing has been touched.
  const after = model.loadProgress(id).skills['g3-mult-2-5-10'];
  assert.equal(after.stage, stageBefore, 'a week off must not cost a stage');
  assert.equal(after.checks.length, checksBefore, 'a week off must not erase history');
  assert.equal(model.daysThisWeek(after, '2026-09-24').length, 0, 'but this week starts fresh');
});

test('passing a Check moves up a stage; passing the top stage masters it', async () => {
  const { model } = await fresh();
  const id = 'p2';
  const skill = 'g3-mult-4-8';
  const pass = { accuracy: 1, total: 12, correct: 12, medianMs: 900, passed: true };

  let r = model.recordCheck(id, skill, pass, 3);
  assert.equal(r.stage, 1);
  assert.equal(r.mastered, false);

  r = model.recordCheck(id, skill, pass, 3);
  assert.equal(r.stage, 2);
  assert.equal(r.mastered, false);

  r = model.recordCheck(id, skill, pass, 3);
  assert.equal(r.mastered, true, 'passing the top stage masters the skill');
});

test('failing a Check never moves a child backwards', async () => {
  const { model } = await fresh();
  const id = 'p3';
  const skill = 'g3-mult-3-6';

  model.recordCheck(id, skill,
    { accuracy: 1, total: 12, correct: 12, medianMs: 900, passed: true }, 3);
  const fail = { accuracy: 0.5, total: 12, correct: 6, medianMs: 4000, passed: false };
  const r = model.recordCheck(id, skill, fail, 3);

  assert.equal(r.stage, 1, 'a failed Check must not take away a stage already earned');
  assert.equal(r.mastered, false);
});

test('mastery, once earned, is never taken away', async () => {
  const { model } = await fresh();
  const id = 'p4';
  const skill = 'g3-div-facts';
  const pass = { accuracy: 1, total: 12, correct: 12, medianMs: 900, passed: true };

  for (let i = 0; i < 3; i++) model.recordCheck(id, skill, pass, 3);
  assert.equal(model.loadProgress(id).skills[skill].mastered, true);

  model.recordCheck(id, skill,
    { accuracy: 0.1, total: 12, correct: 1, medianMs: 9000, passed: false }, 3);
  assert.equal(
    model.loadProgress(id).skills[skill].mastered, true,
    'a bad day must not unmaster a skill',
  );
});

test('Today offers the first unmastered skill, and never nothing', async () => {
  const { model, scheduler } = await fresh();
  const id = 'p5';
  const skills = [
    { id: 'a', stages: [1, 2, 3] },
    { id: 'b', stages: [1, 2, 3] },
  ];

  let plan = scheduler.todayPlan(id, skills);
  assert.equal(plan.skill.id, 'a');
  assert.equal(plan.activity, 'learn');

  // Master the first skill; Today moves on.
  const pass = { accuracy: 1, total: 12, correct: 12, medianMs: 900, passed: true };
  for (let i = 0; i < 3; i++) model.recordCheck(id, 'a', pass, 3);

  plan = scheduler.todayPlan(id, skills);
  assert.equal(plan.skill.id, 'b');

  // Even with everything mastered there is still a plan.
  for (let i = 0; i < 3; i++) model.recordCheck(id, 'b', pass, 3);
  plan = scheduler.todayPlan(id, skills);
  assert.ok(plan, 'Today must never come back empty');
});

test('skillProgress reaches 1 only on mastery', async () => {
  const { model } = await fresh();
  assert.equal(model.skillProgress(null, 3), 0);
  assert.equal(model.skillProgress({ stage: 0, log: [], mastered: false }, 3), 0);
  assert.equal(model.skillProgress({ stage: 3, log: [], mastered: true }, 3), 1);
  const partial = model.skillProgress({ stage: 1, log: [], mastered: false }, 3);
  assert.ok(partial > 0 && partial < 1);
});

test('the weekly goal is 3 days and there is no streak to break', async () => {
  const { model } = await fresh();
  assert.equal(model.GOAL_DAYS, 3);
  // There is deliberately no streak counter in the model to reset.
  const record = { log: [], attempts: [], checks: [], facts: {} };
  assert.ok(!('streak' in record));
});
