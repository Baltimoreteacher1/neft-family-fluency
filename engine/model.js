// The v2 data model: profiles, per-skill progress, and the weekly rhythm.
//
// Three concepts only -- Grade, Skill, Session. There is no "level" and no
// "week number": a week is a rolling window over the days a child practised a
// particular skill, not a position in a ladder. That is what lets skills be
// recommended rather than locked.

import { storage, KEY } from './storage.js';

/** The fixed rhythm a skill moves through each week. */
export const RHYTHM = ['learn', 'practice', 'play', 'practice', 'check'];

/** Practise on this many distinct days to meet the weekly goal. */
export const GOAL_DAYS = 3;

/** Attempts kept per skill. A year of daily practice must not fill the quota. */
const MAX_ATTEMPTS = 300;

// --- profiles -------------------------------------------------------------

/**
 * A profile is an avatar, a nickname and a grade. Class code and student
 * number are optional and deliberately NOT asked for at creation -- they are
 * only needed if a family chooses to send progress to the teacher, and asking
 * up front implies the app wants identifying information it does not need.
 */
export function newProfile({ nickname, avatar, grade }) {
  return {
    id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    nickname,
    avatar,
    grade: Number(grade),
    classCode: null,
    studentNumber: null,
    createdAt: today(),
  };
}

export function loadProfiles() {
  return storage.get(KEY.profiles, []);
}

export function saveProfiles(profiles) {
  storage.set(KEY.profiles, profiles);
}

export function updateProfile(id, patch) {
  const profiles = loadProfiles().map((p) => (p.id === id ? { ...p, ...patch } : p));
  saveProfiles(profiles);
  return profiles.find((p) => p.id === id) || null;
}

// --- dates ----------------------------------------------------------------

/** Local date as YYYY-MM-DD. Not UTC: practice at 9pm must count as today. */
export function today(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The Monday of the week a date falls in. The weekly goal and the Mon-Fri dot
 * row both reset from here, so a child who practises Sunday and Monday sees
 * two different weeks, which is what a family expects.
 */
export function weekStart(dateStr = today()) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return today(d);
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(dateStr) {
  return (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7;
}

// --- progress -------------------------------------------------------------

export function loadProgress(profileId) {
  return storage.get(KEY.progress(profileId), { version: 2, skills: {} });
}

export function saveProgress(profileId, data) {
  storage.set(KEY.progress(profileId), data);
}

/**
 * One skill's record. Created lazily so an untouched skill costs nothing.
 *
 *   stage      index into the skill's stages; advances on a passed Check
 *   log        [{ activity, day, stage }] -- what was done and when
 *   attempts   recent answers, for spaced repetition and "facts to practise"
 *   checks     every Check taken, so a result can be shown again later
 *   facts      Leitner boxes, keyed by the generator's fact id
 *   mastered   passed the Check at the TOP stage
 */
export function skillRecord(progress, skillId) {
  if (!progress.skills[skillId]) {
    progress.skills[skillId] = {
      stage: 0,
      log: [],
      attempts: [],
      checks: [],
      facts: {},
      best: 0,
      mastered: false,
    };
  }
  return progress.skills[skillId];
}

/** Distinct days this skill was practised during the current week. */
export function daysThisWeek(record, from = today()) {
  const start = weekStart(from);
  const days = new Set();
  for (const entry of record.log) {
    if (weekStart(entry.day) === start) days.add(entry.day);
  }
  return [...days].sort();
}

/**
 * The next activity in the rhythm for this skill, this week.
 *
 * Returns the first rhythm step not yet done since Monday. Once the whole
 * rhythm is complete the skill offers Practice again -- there is always
 * something to do, and it is never a dead end reading "come back next week".
 */
export function nextActivity(record, from = today()) {
  const start = weekStart(from);
  const done = record.log.filter((e) => weekStart(e.day) === start).map((e) => e.activity);

  const remaining = [...RHYTHM];
  for (const activity of done) {
    const at = remaining.indexOf(activity);
    if (at >= 0) remaining.splice(at, 1);
  }
  return remaining[0] || 'practice';
}

/**
 * Record that an activity happened. `day` is passed in so tests and the
 * migration can write history without pretending it is now.
 */
export function logActivity(profileId, skillId, activity, { day = today(), stage = 0 } = {}) {
  const progress = loadProgress(profileId);
  const record = skillRecord(progress, skillId);
  record.log.push({ activity, day, stage });
  // Keep a season of history, not a lifetime.
  if (record.log.length > 200) record.log = record.log.slice(-200);
  saveProgress(profileId, progress);
  return record;
}

export function addAttempts(profileId, skillId, attempts) {
  if (!attempts.length) return;
  const progress = loadProgress(profileId);
  const record = skillRecord(progress, skillId);
  record.attempts = record.attempts.concat(attempts).slice(-MAX_ATTEMPTS);
  saveProgress(profileId, progress);
}

/**
 * Record a Check. Passing at the top stage masters the skill; passing below it
 * moves up a stage. Failing never moves anyone down -- the stage a child has
 * reached is not taken away from them.
 */
export function recordCheck(profileId, skillId, result, totalStages, { day = today() } = {}) {
  const progress = loadProgress(profileId);
  const record = skillRecord(progress, skillId);

  record.checks.push({ ...result, day, stage: record.stage });
  record.log.push({ activity: 'check', day, stage: record.stage });

  if (result.passed) {
    if (record.stage >= totalStages - 1) record.mastered = true;
    else record.stage += 1;
  }

  saveProgress(profileId, progress);
  return record;
}

/** A skill's completion, 0..1, for the progress ring on its card. */
export function skillProgress(record, totalStages) {
  if (!record) return 0;
  if (record.mastered) return 1;
  const stageShare = record.stage / totalStages;
  // Part-credit for work done inside the current stage, so the ring moves
  // during the week rather than only on Friday.
  const weekShare = Math.min(1, daysThisWeek(record).length / GOAL_DAYS) / totalStages;
  return Math.min(0.99, stageShare + weekShare);
}
