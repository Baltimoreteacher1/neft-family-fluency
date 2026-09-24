// Per-profile progress, kept on the device only.
//
// Shape (one object per profile id, under ewl_progress_<id>):
//   { weeks: { "3": { days: ["2026-09-21", ...], attempts: [...],
//                     check: {...}, badge: true } } }
//
// `attempts` is the week's practice log, trimmed to the most recent 400 so a
// year of daily practice cannot fill a phone's storage quota and start the
// wrapper's silent memory fallback.

import { storage, KEY } from './storage.js';
import { accuracy, evaluateCheck, median, missedFacts } from './mastery.js';

const MAX_ATTEMPTS = 400;

export function loadProgress(profileId) {
  return storage.get(KEY.progress(profileId), { weeks: {} });
}

export function saveProgress(profileId, data) {
  storage.set(KEY.progress(profileId), data);
}

export function weekRecord(progress, week) {
  const key = String(week);
  if (!progress.weeks[key]) {
    progress.weeks[key] = { days: [], attempts: [], check: null, badge: false };
  }
  return progress.weeks[key];
}

/** Local date as YYYY-MM-DD. Not UTC: practice at 9pm must count as today. */
export function today(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Record a finished activity. A day counts once however many sets are done --
 * the goal is "practised on 3 days", not "did 3 sets".
 */
export function recordSession(profileId, week, { attempts = [], day = today() } = {}) {
  const progress = loadProgress(profileId);
  const rec = weekRecord(progress, week);
  if (!rec.days.includes(day)) rec.days.push(day);
  rec.attempts = rec.attempts.concat(attempts).slice(-MAX_ATTEMPTS);
  saveProgress(profileId, progress);
  return rec;
}

/**
 * Record a Friday Check and decide the badge.
 * Returns the evaluation so the view can celebrate or reassure.
 */
export function recordCheck(profileId, week, attempts, mode, criteria, day = today()) {
  const progress = loadProgress(profileId);
  const rec = weekRecord(progress, week);
  const result = evaluateCheck(attempts, mode, criteria);

  if (!rec.days.includes(day)) rec.days.push(day);
  rec.check = {
    day,
    accuracy: result.accuracy,
    medianMs: result.medianMs,
    mastered: result.mastered,
    nextFocus: result.nextFocus,
    total: attempts.length,
    correct: attempts.filter((a) => a.correct).length,
  };
  // A badge, once earned, is never taken away by a later worse attempt.
  rec.badge = rec.badge || result.mastered;
  rec.attempts = rec.attempts.concat(attempts).slice(-MAX_ATTEMPTS);

  saveProgress(profileId, progress);
  return result;
}

/** The facts to weight up in next week's spiral. */
export function missedFor(profileId, week, limit = 3) {
  const rec = weekRecord(loadProgress(profileId), week);
  return missedFacts(rec.attempts, limit).map((m) => m.itemId);
}

/**
 * The week a profile is on: the first week without a badge, capped at the last
 * week in the curriculum. Nothing is ever locked *backwards* -- a child can
 * always revisit an earlier level.
 */
export function currentWeek(profileId, totalWeeks) {
  const progress = loadProgress(profileId);
  for (let w = 1; w <= totalWeeks; w++) {
    if (!progress.weeks[String(w)]?.badge) return w;
  }
  return totalWeeks;
}

/**
 * Whether a week can be opened. A week unlocks when the one before it has a
 * badge -- but the current week is always open, so a child who has not earned
 * a badge is never stuck with nothing to do.
 */
export function isUnlocked(profileId, week, totalWeeks) {
  if (week <= 1) return true;
  const progress = loadProgress(profileId);
  if (progress.weeks[String(week)]?.days?.length) return true;
  return Boolean(progress.weeks[String(week - 1)]?.badge);
}

/** Everything the progress code needs for one week. */
export function weekSummary(profileId, week) {
  const rec = weekRecord(loadProgress(profileId), week);
  const check = rec.check;
  const attempts = rec.attempts;
  return {
    week,
    daysPractised: rec.days.length,
    // The Friday Check is the measurement; the week's practice is the fallback
    // for a family who sends a code before Friday.
    accuracy: check ? check.accuracy : accuracy(attempts),
    medianMs: check
      ? check.medianMs
      : median(attempts.filter((a) => a.correct).map((a) => a.ms)),
    badge: Boolean(rec.badge),
    missed: missedFacts(attempts, 3).map((m) => m.itemId),
  };
}
