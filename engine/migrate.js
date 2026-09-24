// v1 (ewl_, weeks 1-8) -> v2 (nff_v2_, grades and skills).
//
// Rules this follows, in order of importance:
//   1. Back up every v1 key verbatim BEFORE converting anything.
//   2. Never delete v1 data. A family running an old cached copy of the app
//      must still find their progress there.
//   3. Only mark the migration done once the v2 data has been written AND
//      read back successfully. A half-migrated device retries on next open.
//
// The old app had eight sequential "levels". Each maps to exactly one skill in
// the new curriculum -- the levels were always single skills, so nothing has to
// be merged or split:
//
//   L1 x2,x5,x10      -> Grade 3  g3-mult-2-5-10
//   L2 x4,x8          -> Grade 3  g3-mult-4-8
//   L3 x3,x6          -> Grade 3  g3-mult-3-6
//   L4 x9,x7          -> Grade 3  g3-mult-9-7
//   L5 division facts -> Grade 3  g3-div-facts
//   L6 extended facts -> Grade 4  g4-extended-facts
//   L7 divide 1 digit -> Grade 4  g4-divide-1digit
//   L8 divide 2 digit -> Grade 5  g5-divide-2digits

import { storage, KEY, V1_KEY, allKeys } from './storage.js';

export const WEEK_TO_SKILL = {
  1: { grade: 3, skillId: 'g3-mult-2-5-10' },
  2: { grade: 3, skillId: 'g3-mult-4-8' },
  3: { grade: 3, skillId: 'g3-mult-3-6' },
  4: { grade: 3, skillId: 'g3-mult-9-7' },
  5: { grade: 3, skillId: 'g3-div-facts' },
  6: { grade: 4, skillId: 'g4-extended-facts' },
  7: { grade: 4, skillId: 'g4-divide-1digit' },
  8: { grade: 5, skillId: 'g5-divide-2digits' },
};

/**
 * Which grade a migrated child lands on.
 *
 * The old app never asked. The only honest signal is how far they got, so the
 * grade of their furthest skill is used -- and Settings makes it changeable in
 * two taps, which is where a wrong guess gets corrected.
 */
export function inferGrade(oldProgress) {
  let furthest = 0;
  for (const [week, record] of Object.entries(oldProgress?.weeks || {})) {
    const touched = (record?.days?.length || 0) > 0 || (record?.attempts?.length || 0) > 0;
    if (touched) furthest = Math.max(furthest, Number(week));
  }
  return WEEK_TO_SKILL[furthest]?.grade ?? 3;
}

/**
 * Convert one v1 progress object into v2 skill records.
 * Pure, so the tests can run it against a fixture without touching storage.
 */
export function convertProgress(oldProgress) {
  const out = { version: 2, skills: {} };
  if (!oldProgress?.weeks) return out;

  for (const [week, old] of Object.entries(oldProgress.weeks)) {
    const target = WEEK_TO_SKILL[Number(week)];
    if (!target) continue; // a week the new curriculum has no home for

    const days = Array.isArray(old.days) ? old.days : [];
    const attempts = Array.isArray(old.attempts) ? old.attempts : [];

    // Every recorded day becomes a practice entry. The old app did not record
    // WHICH activity happened on which day, so practice is the honest default
    // -- it is the only one that is always true of a day that was logged.
    const log = days.map((day) => ({ activity: 'practice', day, stage: 0 }));

    const checks = [];
    if (old.check) {
      checks.push({
        day: old.check.day,
        stage: 0,
        accuracy: old.check.accuracy,
        total: old.check.total,
        correct: old.check.correct,
        medianMs: old.check.medianMs,
        passed: Boolean(old.check.mastered),
      });
      log.push({ activity: 'check', day: old.check.day, stage: 0 });
    }

    out.skills[target.skillId] = {
      // A v1 badge means they passed the only difficulty the old app had.
      // That is the top of the old skill, so it maps to mastered -- and the
      // new stage ladder starts them at its top stage rather than making
      // them re-earn what they already did.
      stage: old.badge ? 2 : 0,
      log,
      attempts,
      checks,
      facts: seedFacts(attempts),
      best: 0,
      mastered: Boolean(old.badge),
    };
  }
  return out;
}

/**
 * Seed the Leitner boxes from old attempts, so spaced repetition starts with
 * what this child actually found hard rather than from nothing.
 */
function seedFacts(attempts) {
  const facts = {};
  for (const a of attempts) {
    if (!a?.itemId) continue;
    const f = facts[a.itemId] || (facts[a.itemId] = { box: 3, seen: 0, missed: 0 });
    f.seen++;
    if (a.correct) f.box = Math.min(5, f.box + 1);
    else {
      f.missed++;
      f.box = 1; // a missed fact comes back immediately
    }
  }
  return facts;
}

/** Has the migration already run to completion on this device? */
export function isMigrated() {
  return Boolean(storage.get(KEY.migrated, false));
}

function readV1Raw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True if there is any v1 data worth migrating. */
export function hasV1Data() {
  return Boolean(readV1Raw(V1_KEY.profiles));
}

/**
 * Run the migration. Safe to call on every boot: it returns immediately if
 * there is nothing to do or it has already run.
 *
 * @returns {{ran:boolean, profiles:number, skills:number, reason?:string}}
 */
export function migrate() {
  if (isMigrated()) return { ran: false, profiles: 0, skills: 0, reason: 'already migrated' };
  if (!hasV1Data()) {
    // Nothing to convert, but record that we looked, so a fresh device does
    // not re-scan on every boot.
    storage.set(KEY.migrated, { at: new Date().toISOString(), profiles: 0, skills: 0 });
    return { ran: false, profiles: 0, skills: 0, reason: 'no v1 data' };
  }

  // --- 1. back up everything, verbatim, before touching anything ---
  const backup = {};
  for (const key of allKeys()) {
    if (key.startsWith('ewl_')) backup[key] = readV1Raw(key);
  }
  storage.set(KEY.backup, { at: new Date().toISOString(), keys: backup });

  // If the backup did not survive the round trip, stop. Migrating without a
  // way back is worse than not migrating.
  const verified = storage.get(KEY.backup, null);
  if (!verified || Object.keys(verified.keys || {}).length !== Object.keys(backup).length) {
    return { ran: false, profiles: 0, skills: 0, reason: 'backup failed' };
  }

  // --- 2. convert ---
  let oldProfiles = [];
  try {
    oldProfiles = JSON.parse(backup[V1_KEY.profiles] || '[]') || [];
  } catch {
    oldProfiles = [];
  }

  const profiles = [];
  let skillCount = 0;

  for (const old of oldProfiles) {
    if (!old?.id) continue;
    let oldProgress = {};
    try {
      oldProgress = JSON.parse(backup[V1_KEY.progress(old.id)] || '{}') || {};
    } catch {
      oldProgress = {};
    }

    const converted = convertProgress(oldProgress);
    skillCount += Object.keys(converted.skills).length;

    profiles.push({
      id: old.id,
      nickname: old.nickname || 'Friend',
      avatar: old.avatar || '\u{1F98A}',
      grade: inferGrade(oldProgress),
      // These were required in v1 and are optional now. Carrying them over
      // means a family who already sent progress is not asked again.
      classCode: old.classCode || null,
      studentNumber: Number.isInteger(old.studentNumber) ? old.studentNumber : null,
      createdAt: old.createdAt || null,
      migratedFrom: 'v1',
    });

    storage.set(KEY.progress(old.id), converted);
  }

  storage.set(KEY.profiles, profiles);

  let oldActive = null;
  try {
    oldActive = JSON.parse(backup[V1_KEY.activeProfile] || 'null');
  } catch {
    oldActive = null;
  }
  if (oldActive && profiles.some((p) => p.id === oldActive)) {
    storage.set(KEY.activeProfile, oldActive);
  }

  // Settings carry over where the shapes still agree.
  let oldSettings = {};
  try {
    oldSettings = JSON.parse(backup[V1_KEY.settings] || '{}') || {};
  } catch {
    oldSettings = {};
  }
  storage.set(KEY.settings, {
    lang: oldSettings.lang === 'es' ? 'es' : 'en',
    motion: oldSettings.motion === 'reduced' ? 'reduced' : 'auto',
    timer: Boolean(oldSettings.timer),
    sound: false,
    textSize: 'normal',
    contrast: 'normal',
  });

  // The teacher's own device keeps its pasted codes and form overrides.
  for (const [from, to] of [
    [V1_KEY.teacherCodes, KEY.teacherCodes],
    [V1_KEY.formUrlOverride, KEY.formUrlOverride],
    [V1_KEY.formEntryOverride, KEY.formEntryOverride],
  ]) {
    const raw = backup[from];
    if (raw == null) continue;
    try {
      storage.set(to, JSON.parse(raw));
    } catch {
      /* a corrupt v1 value is not worth failing the migration over */
    }
  }

  // --- 3. verify, THEN mark done ---
  const writtenProfiles = storage.get(KEY.profiles, null);
  if (!Array.isArray(writtenProfiles) || writtenProfiles.length !== profiles.length) {
    return { ran: false, profiles: 0, skills: 0, reason: 'verification failed' };
  }
  for (const p of profiles) {
    const back = storage.get(KEY.progress(p.id), null);
    if (!back || back.version !== 2) {
      return { ran: false, profiles: 0, skills: 0, reason: `progress for ${p.id} did not persist` };
    }
  }

  storage.set(KEY.migrated, {
    at: new Date().toISOString(),
    profiles: profiles.length,
    skills: skillCount,
  });

  // v1 keys are deliberately left in place. They cost a few KB and they are
  // the only way back if something here turns out to be wrong.
  return { ran: true, profiles: profiles.length, skills: skillCount };
}
