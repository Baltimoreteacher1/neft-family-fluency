// The migration is the only code here that can lose a child's work.
//
// It runs once, on a device that already has progress, with no way for the
// family to tell it went wrong -- they would just see an empty app. So it is
// tested against a verbatim copy of the real v1 localStorage, captured from
// the deployed site, rather than against a hand-written approximation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  installLocalStorage,
  installThrowingLocalStorage,
  uninstallLocalStorage,
} from '../tools/fake-localstorage.mjs';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/v1-localstorage.json', import.meta.url), 'utf8'),
);

/** Fresh module instances per test: storage.js holds an in-memory fallback. */
async function freshModules(seed) {
  installLocalStorage(seed);
  const bust = `?t=${Math.random()}`;
  const storage = await import(`../../engine/storage.js${bust}`);
  const migrate = await import(`../../engine/migrate.js${bust}`);
  const model = await import(`../../engine/model.js${bust}`);
  return { ...migrate, ...storage, model };
}

test.afterEach(() => uninstallLocalStorage());

test('a real v1 device migrates with every skill intact', async () => {
  const m = await freshModules(FIXTURE);
  const result = m.migrate();

  assert.equal(result.ran, true, result.reason);
  assert.equal(result.profiles, 1);
  // Weeks 1, 2, 6 and 8 were touched in the fixture.
  assert.equal(result.skills, 4);

  const profiles = m.storage.get(m.KEY.profiles, []);
  assert.equal(profiles.length, 1);
  const p = profiles[0];
  assert.equal(p.id, 'pmufrohk33y', 'the profile id must be preserved');
  assert.equal(p.nickname, 'Sam');
  assert.equal(p.avatar, '\u{1F98A}');
  // Week 8 is the furthest touched, and week 8 became a Grade 5 skill.
  assert.equal(p.grade, 5);
  // v1 required these; they are optional now but must not be thrown away.
  assert.equal(p.classCode, '6B');
  assert.equal(p.studentNumber, 5);
});

test('each old level lands on the right skill in the right grade', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  const progress = m.storage.get(m.KEY.progress('pmufrohk33y'), null);

  assert.equal(progress.version, 2);
  assert.deepEqual(
    Object.keys(progress.skills).sort(),
    ['g3-mult-2-5-10', 'g3-mult-4-8', 'g4-extended-facts', 'g5-divide-2digits'],
  );
});

test('a badge becomes mastery at the top stage, not a fresh start', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  const skills = m.storage.get(m.KEY.progress('pmufrohk33y'), null).skills;

  // Week 1 had a badge: the child already proved this skill.
  assert.equal(skills['g3-mult-2-5-10'].mastered, true);
  assert.equal(skills['g3-mult-2-5-10'].stage, 2, 'a mastered skill must not restart at stage 0');

  // Week 2 had no badge.
  assert.equal(skills['g3-mult-4-8'].mastered, false);
  assert.equal(skills['g3-mult-4-8'].stage, 0);
});

test('practice days and check results survive', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  const skills = m.storage.get(m.KEY.progress('pmufrohk33y'), null).skills;

  const w1 = skills['g3-mult-2-5-10'];
  const days = w1.log.filter((e) => e.activity === 'practice').map((e) => e.day);
  assert.deepEqual(days, ['2026-09-22', '2026-09-24']);

  assert.equal(w1.checks.length, 1);
  assert.equal(w1.checks[0].accuracy, 0.95);
  assert.equal(w1.checks[0].correct, 19);
  assert.equal(w1.checks[0].passed, true);

  const w8 = skills['g5-divide-2digits'];
  assert.equal(w8.log.filter((e) => e.activity === 'practice').length, 3);
});

test('missed facts carry into the spaced-repetition boxes', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  const facts = m.storage.get(m.KEY.progress('pmufrohk33y'), null).skills['g3-mult-2-5-10'].facts;

  // 7x8 was missed twice in the fixture and must come back soon (box 1).
  assert.equal(facts['mult:7x8'].box, 1);
  assert.equal(facts['mult:7x8'].missed, 2);
  // 4x5 was answered correctly and should not be prioritised.
  assert.ok(facts['mult:4x5'].box > 1);
});

test('v1 data is backed up before anything is converted, and never deleted', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();

  const backup = m.storage.get(m.KEY.backup, null);
  assert.ok(backup, 'no backup was written');
  const v1Keys = Object.keys(FIXTURE).filter((k) => k.startsWith('ewl_'));
  assert.deepEqual(Object.keys(backup.keys).sort(), v1Keys.sort());

  // Every original key is still readable. A family on an old cached copy of
  // the app must still find their progress.
  for (const key of v1Keys) {
    assert.equal(localStorage.getItem(key), FIXTURE[key], `${key} was altered`);
  }
});

test('the migration runs once, not on every boot', async () => {
  const m = await freshModules(FIXTURE);
  assert.equal(m.migrate().ran, true);
  assert.equal(m.isMigrated(), true);

  const second = m.migrate();
  assert.equal(second.ran, false);
  assert.match(second.reason, /already/);
});

test('re-running cannot double-count or corrupt converted progress', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  const before = JSON.stringify(m.storage.get(m.KEY.progress('pmufrohk33y'), null));
  m.migrate();
  m.migrate();
  assert.equal(JSON.stringify(m.storage.get(m.KEY.progress('pmufrohk33y'), null)), before);
});

test('a fresh device is marked done without inventing a profile', async () => {
  const m = await freshModules({});
  const result = m.migrate();
  assert.equal(result.ran, false);
  assert.match(result.reason, /no v1 data/);
  assert.deepEqual(m.storage.get(m.KEY.profiles, []), []);
});

test('settings carry across, including a Spanish device', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  const settings = m.storage.get(m.KEY.settings, null);
  assert.equal(settings.lang, 'es', 'a Spanish-speaking family must not be reset to English');
  assert.equal(settings.motion, 'reduced');
  assert.equal(settings.timer, true);
  // New v2 settings get safe defaults.
  assert.equal(settings.sound, false);
});

test('the teacher device keeps its pasted codes and form overrides', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  assert.equal(
    m.storage.get(m.KEY.formUrlOverride, null),
    'https://docs.google.com/forms/d/e/ABC/viewform',
  );
  assert.equal(m.storage.get(m.KEY.formEntryOverride, null), 'entry.987654');
});

test('the active profile is still the active profile', async () => {
  const m = await freshModules(FIXTURE);
  m.migrate();
  assert.equal(m.storage.get(m.KEY.activeProfile, null), 'pmufrohk33y');
});

test('corrupt v1 progress does not stop the rest of the device migrating', async () => {
  const m = await freshModules({
    ...FIXTURE,
    ewl_progress_pmufrohk33y: '{not json at all',
  });
  const result = m.migrate();
  assert.equal(result.ran, true, result.reason);
  // The profile survives with no progress rather than the migration aborting.
  assert.equal(m.storage.get(m.KEY.profiles, []).length, 1);
  assert.deepEqual(m.storage.get(m.KEY.progress('pmufrohk33y'), null).skills, {});
});

test('a device where storage throws does not claim to have migrated', async () => {
  installThrowingLocalStorage();
  const bust = `?t=${Math.random()}`;
  const storage = await import(`../../engine/storage.js${bust}`);
  const migrate = await import(`../../engine/migrate.js${bust}`);

  // Nothing should throw out of migrate() -- the app must still boot.
  const result = migrate.migrate();
  assert.equal(typeof result.ran, 'boolean');
  // With no readable v1 data there is nothing to convert, and nothing is lost.
  assert.equal(result.ran, false);
  assert.equal(storage.storage.get(storage.KEY.profiles, []).length, 0);
});

// --- the pure converter, independent of storage ---------------------------

test('convertProgress maps every old week, and ignores ones it has no home for', async () => {
  const m = await freshModules({});
  const out = m.convertProgress({
    weeks: {
      1: { days: ['2026-01-05'], attempts: [], check: null, badge: false },
      99: { days: ['2026-01-06'], attempts: [], check: null, badge: true },
    },
  });
  assert.ok(out.skills['g3-mult-2-5-10']);
  assert.equal(Object.keys(out.skills).length, 1, 'week 99 has no skill and must be skipped');
});

test('inferGrade follows how far the child actually got', async () => {
  const m = await freshModules({});
  const touched = (week) => ({ weeks: { [week]: { days: ['2026-01-05'], attempts: [] } } });
  assert.equal(m.inferGrade(touched(1)), 3);
  assert.equal(m.inferGrade(touched(5)), 3);
  assert.equal(m.inferGrade(touched(6)), 4);
  assert.equal(m.inferGrade(touched(7)), 4);
  assert.equal(m.inferGrade(touched(8)), 5);
  // Nothing touched at all: start at the grade the old app was built for.
  assert.equal(m.inferGrade({ weeks: {} }), 3);
  assert.equal(m.inferGrade(null), 3);
});

test('every migration target exists in the curriculum', async () => {
  const m = await freshModules({});
  const targets = Object.values(m.WEEK_TO_SKILL);
  for (const { grade, skillId } of targets) {
    const file = new URL(`../../curriculum/grade-${grade}.json`, import.meta.url);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(
      data.skills.some((s) => s.id === skillId),
      `migration sends old work to ${skillId}, which grade ${grade} does not define`,
    );
  }
});
