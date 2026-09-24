// Builds a practice set or a Friday Check from the curriculum.
//
// This is where the spiral mixer, the generators and the miss-tracking meet.
// It is pure and seeded: the same (profile, week, day) always yields the same
// set, so reloading mid-practice does not hand a child a fresh set of problems.

import { createRng, seedFrom } from './rng.js';
import { spiralPlan } from './mastery.js';
import multFact from './generators/multFact.js';
import divFact from './generators/divFact.js';
import extendedMult from './generators/extendedMult.js';
import extendedDiv from './generators/extendedDiv.js';
import longDivision from './generators/longDivision.js';

export const GENERATORS = {
  multFact,
  divFact,
  extendedMult,
  extendedDiv,
  longDivision,
};

/** Generate one item from a skill entry in skills.json. */
export function generateItem(rng, skill) {
  const fn = GENERATORS[skill.generator];
  if (!fn) throw new Error(`Unknown generator "${skill.generator}"`);
  const item = fn(rng, skill.params, { strategyTag: skill.strategyTag });
  return { ...item, skillId: skill.id };
}

function weekByNumber(curriculum, n) {
  const week = curriculum.weeks.find((w) => w.week === n);
  if (!week) throw new Error(`No week ${n} in curriculum`);
  return week;
}

/**
 * @param {object} curriculum parsed skills.json
 * @param {{week:number, kind:'practice'|'check', seed:string|number,
 *          itemCount?:number, missed?:string[]}} opts
 */
export function buildSet(curriculum, opts) {
  const { week: weekNumber, kind, seed } = opts;
  const week = weekByNumber(curriculum, weekNumber);
  const defaults = curriculum.defaults;
  const itemCount =
    opts.itemCount ?? (kind === 'check' ? defaults.check.items : defaults.practice.items);

  const rng = createRng(typeof seed === 'string' ? seedFrom(seed) : seed);

  // The Friday Check measures this week only -- mixing review into the
  // assessment would make the badge mean something other than "you learned
  // this week's strategy".
  const plan =
    kind === 'check'
      ? Array.from({ length: itemCount }, () => weekNumber)
      : spiralPlan({
          currentWeek: weekNumber,
          itemCount,
          spiral: defaults.spiral,
          rng,
        });

  const missed = opts.missed || [];
  const boost = defaults.spiral.missedFactBoost || 1;

  const items = [];
  const seen = new Set();

  for (const sourceWeek of plan) {
    const item = drawUnique(rng, curriculum, sourceWeek, seen, missed, boost);
    items.push(item);
    seen.add(item.id);
  }

  return { week: weekNumber, kind, mode: week.mode, items };
}

/**
 * Draw an item that is not already in the set.
 *
 * A fact week has a finite pool (x2/x5/x10 across 0-10 is 33 distinct facts),
 * so a 20-item set can exhaust the easy draws. We retry a bounded number of
 * times and then accept a repeat rather than looping forever -- a duplicated
 * item is a much smaller problem than a frozen phone.
 */
function drawUnique(rng, curriculum, weekNumber, seen, missed, boost) {
  const week = weekByNumber(curriculum, weekNumber);
  const MAX_TRIES = 40;
  let fallback = null;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const skill =
      week.skills.length === 1
        ? week.skills[0]
        : rng.pick(week.skills);
    const item = generateItem(rng, skill);
    fallback = fallback || item;
    if (!seen.has(item.id)) {
      // Once we have a fresh item, bias toward previously-missed facts by
      // giving a missed item an immediate accept and a fresh item a chance of
      // being redrawn in favour of one.
      if (missed.includes(item.id)) return item;
      if (attempt < boost - 1 && missed.length) continue;
      return item;
    }
  }
  return fallback;
}

/** Load and parse the curriculum in the browser. */
export async function loadCurriculum(url) {
  // Module-relative, so a page in a subdirectory loads the same curriculum.
  const target = url || new URL('../curriculum/skills.json', import.meta.url);
  const res = await fetch(target);
  if (!res.ok) throw new Error(`Could not load curriculum (${res.status})`);
  return res.json();
}
