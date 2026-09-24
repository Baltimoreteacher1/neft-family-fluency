// Mastery rules and the spiral mixer.
//
// Thresholds are never hardcoded here -- they come from curriculum/skills.json
// so they can be tuned without touching code. This module only knows how to
// apply them.

/**
 * Median is the right statistic for response time, not mean: one interruption
 * (a sibling, a doorbell) produces a 45-second outlier that would drag a mean
 * past any threshold and tell us nothing about fluency.
 */
export function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function accuracy(attempts) {
  if (!attempts.length) return 0;
  return attempts.filter((a) => a.correct).length / attempts.length;
}

/**
 * Decide whether a Friday Check earns the week's badge.
 *
 * @param {{correct:boolean, ms:number, itemId:string}[]} attempts
 * @param {'fact'|'procedure'} mode
 * @param {{fact:{minAccuracy:number,maxMedianMs:number|null},
 *          procedure:{minAccuracy:number,maxMedianMs:number|null}}} criteria
 */
export function evaluateCheck(attempts, mode, criteria) {
  const rule = criteria[mode];
  if (!rule) throw new Error(`No mastery rule for mode "${mode}"`);

  const acc = accuracy(attempts);
  // Only correct answers count toward the speed rule. A wrong answer given
  // in one second is not evidence of fluency, and including it would let a
  // child "pass" the timing gate by guessing fast.
  const correctTimes = attempts.filter((a) => a.correct).map((a) => a.ms);
  const med = median(correctTimes);

  const accuracyMet = acc >= rule.minAccuracy;
  const speedMet =
    rule.maxMedianMs == null || (med != null && med <= rule.maxMedianMs);

  return {
    accuracy: acc,
    medianMs: med,
    accuracyMet,
    speedMet,
    mastered: accuracyMet && speedMet,
    // What to tell the family, without ever implying the child failed.
    nextFocus: accuracyMet && !speedMet ? 'speed' : accuracyMet ? null : 'accuracy',
  };
}

/**
 * Which facts to weight up next week. Counts misses per item id across the
 * week's attempts and returns the worst offenders first.
 */
export function missedFacts(attempts, limit = 3) {
  const misses = new Map();
  for (const a of attempts) {
    if (a.correct) continue;
    misses.set(a.itemId, (misses.get(a.itemId) || 0) + 1);
  }
  return [...misses.entries()]
    .sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0])))
    .slice(0, limit)
    .map(([itemId, count]) => ({ itemId, count }));
}

/**
 * The spiral mixer: build the plan for a practice set.
 *
 * Returns a list of week numbers, one per item, mixing the current week with
 * earlier ones. Review is what stops week 1 facts decaying while week 6 is
 * being learned, so it is structural, not optional -- but the current week
 * still dominates, because a set that feels like a test of everything is a set
 * a tired child abandons.
 *
 * @param {{currentWeek:number, itemCount:number,
 *          spiral:{currentWeight:number,pastWeight:number}, rng:object}} args
 */
export function spiralPlan({ currentWeek, itemCount, spiral, rng }) {
  const pastWeeks = [];
  for (let w = 1; w < currentWeek; w++) pastWeeks.push(w);

  // Week 1 has no history to spiral through.
  if (!pastWeeks.length) return Array.from({ length: itemCount }, () => currentWeek);

  const currentCount = Math.max(1, Math.round(itemCount * spiral.currentWeight));
  const plan = Array.from({ length: currentCount }, () => currentWeek);

  // Recent weeks are sampled more often than distant ones: last week's facts
  // are the ones still at risk, week 1's have had more exposure.
  while (plan.length < itemCount) {
    plan.push(rng.weightedPick(pastWeeks, (w) => w));
  }

  return rng.shuffle(plan);
}

/**
 * Weight for one candidate item when filling a set. Items the child has missed
 * recently come up more often -- that is the whole point of tracking misses.
 */
export function itemWeight(itemId, missedIds, boost) {
  return missedIds.includes(itemId) ? boost : 1;
}

/**
 * Weekly goal: practised on at least `daysPerWeek` distinct days.
 * There is deliberately no streak-break penalty. A child who misses a week
 * comes back to the same level, not to zero.
 */
export function weeklyGoalMet(daysPractised, goal) {
  return daysPractised >= goal.daysPerWeek;
}
