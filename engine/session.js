// Builds a session's problems from a skill + stage.
//
// Replaces the v1 setBuilder, which worked from week numbers. The shape of a
// session is the same for Practice, Play and Check; only the length and the
// mix of review differ.

import { createRng, seedFrom } from './rng.js';
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

export function generateItem(rng, skill, stageIndex) {
  const fn = GENERATORS[skill.generator];
  if (!fn) throw new Error(`Unknown generator "${skill.generator}"`);
  const stage = skill.stages[Math.min(stageIndex, skill.stages.length - 1)];
  const item = fn(rng, stage.params, { strategyTag: skill.strategyTag });
  return { ...item, skillId: skill.id, stage: stageIndex };
}

/**
 * Pick which facts to weight up: anything in a low Leitner box is due sooner.
 * Returns the item ids that should be over-sampled.
 */
export function dueFacts(record, limit = 6) {
  return Object.entries(record?.facts || {})
    .filter(([, f]) => f.box <= 2)
    .sort((a, b) => a[1].box - b[1].box || b[1].missed - a[1].missed)
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * @param {object} skill        a skill from a grade file
 * @param {object} opts
 * @param {number} opts.stage   which stage to draw from
 * @param {number} opts.count   how many problems
 * @param {string|number} opts.seed
 * @param {string[]} [opts.due] fact ids to favour (from the Leitner boxes)
 * @param {boolean} [opts.review] mix in earlier stages (Practice does, Check does not)
 */
export function buildSession(skill, opts) {
  const { stage, count, seed } = opts;
  const rng = createRng(typeof seed === 'string' ? seedFrom(seed) : seed);
  const due = opts.due || [];

  const items = [];
  const seen = new Set();

  for (let i = 0; i < count; i++) {
    // Practice mixes a little earlier work in; a Check measures one stage only.
    const from =
      opts.review && stage > 0 && rng.chance(0.3) ? rng.int(0, stage - 1) : stage;
    items.push(drawUnique(rng, skill, from, seen, due));
    seen.add(items[items.length - 1].id);
  }

  return { skillId: skill.id, stage, items };
}

/**
 * Draw an item not already in the set.
 *
 * A stage has a finite pool (x2/x5/x10 across 0-10 is 33 facts), so a long set
 * can exhaust the easy draws. Retry a bounded number of times, then accept a
 * repeat: a duplicated problem is a far smaller problem than a frozen phone.
 */
function drawUnique(rng, skill, stageIndex, seen, due) {
  // The early stages have small pools on purpose: x2/x5/x10 against 0-5 is
  // only 17 distinct facts, and a 12-item session needs 12 of them. Finding
  // the last few by random draw needs far more than a handful of tries, and a
  // try costs microseconds -- a repeated question costs a child's attention.
  const MAX_TRIES = 250;
  let fallback = null;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const item = generateItem(rng, skill, stageIndex);
    fallback = fallback || item;
    if (seen.has(item.id)) continue;
    // A fact the child has been missing is taken as soon as it turns up.
    if (due.includes(item.id)) return item;
    // Otherwise give due facts a couple of extra chances to appear first.
    if (due.length && attempt < 2) continue;
    return item;
  }
  return fallback;
}

/** Update the Leitner boxes from a finished session's attempts. */
export function updateFacts(record, attempts) {
  for (const a of attempts) {
    if (!a.itemId) continue;
    const f = record.facts[a.itemId] || (record.facts[a.itemId] = { box: 3, seen: 0, missed: 0 });
    f.seen++;
    if (a.correct) f.box = Math.min(5, f.box + 1);
    else {
      f.missed++;
      f.box = 1;
    }
  }
  return record.facts;
}
