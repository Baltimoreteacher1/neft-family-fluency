// What to do next.
//
// The Today card is the only thing a returning child has to understand, so the
// logic behind it has to be boring and predictable: take the skill they are
// working on, and offer the next step of the week's rhythm. Never "come back
// later", never an empty state.

import { loadProgress, skillRecord, nextActivity, daysThisWeek, GOAL_DAYS } from './model.js';

/**
 * The skill a child is currently working on: the first one in the grade's
 * recommended order that is not yet mastered. Skills are NOT locked -- this
 * only decides what Today offers and which card says "Recommended next".
 */
export function currentSkill(progress, skills) {
  for (const skill of skills) {
    const record = progress.skills[skill.id];
    if (!record?.mastered) return skill;
  }
  // Everything mastered: keep the last one available rather than going blank.
  return skills[skills.length - 1] || null;
}

/**
 * What the Today card should say and do.
 *
 * @returns {{skill, activity, minutes, done:boolean, daysThisWeek:number,
 *            goalMet:boolean} | null}
 */
export function todayPlan(profileId, skills) {
  if (!skills?.length) return null;
  const progress = loadProgress(profileId);
  const skill = currentSkill(progress, skills);
  if (!skill) return null;

  const record = skillRecord(progress, skill.id);
  const days = daysThisWeek(record);
  const activity = nextActivity(record);

  // Did they already do something today? If so the card changes tone, but it
  // still offers the next thing rather than shutting the door.
  const todayStr = days[days.length - 1];
  const doneToday = record.log.some(
    (e) => e.day === todayStr && e.day === new Date().toISOString().slice(0, 10),
  );

  return {
    skill,
    activity,
    minutes: MINUTES[activity] ?? 5,
    done: doneToday,
    daysThisWeek: days.length,
    goalMet: days.length >= GOAL_DAYS,
  };
}

/** Roughly how long each activity takes, for the Today card's subtitle. */
export const MINUTES = {
  learn: 3,
  practice: 5,
  play: 1,
  check: 5,
};
