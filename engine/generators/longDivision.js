// Multi-digit division, weeks 7 and 8.
//
// This generator does more than produce a prompt and an answer: the procedure
// workspace checks the child's work one step at a time, so the item carries the
// full standard-algorithm trace. Building the trace here (once, in a tested
// pure function) rather than in the UI is what keeps the workspace honest -- the
// view never has to recompute arithmetic to decide whether a step is right.
//
// Each step is one "bring down and divide" cycle:
//   { index, workingDividend, digit, product, remainder, bringDown }

/**
 * @param {ReturnType<import('../rng.js').createRng>} rng
 * @param {{dividendDigits:number[], divisorRange:[number,number],
 *          allowRemainder?:boolean, remainderRate?:number}} params
 */
export function longDivision(rng, params, meta = {}) {
  const digits = rng.pick(params.dividendDigits);
  const [lo, hi] = params.divisorRange;
  const divisor = rng.int(lo, hi);

  const wantRemainder =
    params.allowRemainder === true && rng.chance(params.remainderRate ?? 0.4);

  const { dividend, quotient, remainder } = buildDividend(
    rng,
    divisor,
    digits,
    wantRemainder,
  );

  return {
    id: `longdiv:${dividend}/${divisor}`,
    kind: 'procedure',
    op: 'div',
    a: dividend,
    b: divisor,
    prompt: `${dividend} ÷ ${divisor}`,
    answer: remainder === 0 ? quotient : `${quotient} R${remainder}`,
    quotient,
    remainder,
    // Estimation is the taught strategy in week 8; the workspace shows this
    // before the first step so "about how many" has a checkable value.
    estimate: estimateFor(dividend, divisor),
    steps: traceSteps(dividend, divisor),
    strategyTag: meta.strategyTag || null,
  };
}

/**
 * Build a dividend with the requested digit count that divides the way the item
 * wants. We construct from the quotient upward so the arithmetic is exact, then
 * add a remainder if one was asked for.
 */
function buildDividend(rng, divisor, digits, wantRemainder) {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;

  // Quotient range that keeps divisor * quotient inside the digit band.
  const qMin = Math.max(2, Math.ceil(min / divisor));
  const qMax = Math.floor((wantRemainder ? max - 1 : max) / divisor);

  // A wide divisor with few dividend digits can leave no room at all
  // (e.g. 49 into a 3-digit dividend leaves qMin=3, qMax=20 -- fine; but a
  // tighter band could invert). Fall back to the smallest legal quotient.
  const quotient = qMax >= qMin ? rng.int(qMin, qMax) : qMin;

  let dividend = divisor * quotient;
  let remainder = 0;
  if (wantRemainder && divisor > 1) {
    remainder = rng.int(1, divisor - 1);
    dividend += remainder;
  }
  return { dividend, quotient, remainder };
}

/** The "about how many" figure: round the divisor, then divide. */
function estimateFor(dividend, divisor) {
  const roundedDivisor =
    divisor >= 10 ? Math.round(divisor / 10) * 10 : divisor;
  const safeDivisor = roundedDivisor === 0 ? divisor : roundedDivisor;
  return {
    roundedDivisor: safeDivisor,
    about: Math.round(dividend / safeDivisor),
  };
}

/**
 * Walk the standard algorithm left to right. Leading zeros in the quotient are
 * skipped, exactly as a child writes it: for 372 / 4 the first written digit
 * sits over the 7, not the 3.
 */
function traceSteps(dividend, divisor) {
  const digits = String(dividend).split('').map(Number);
  const steps = [];
  let working = 0;
  let started = false;

  for (let i = 0; i < digits.length; i++) {
    working = working * 10 + digits[i];
    const digit = Math.floor(working / divisor);
    if (digit === 0 && !started) continue; // nothing written yet
    started = true;
    const product = digit * divisor;
    const remainder = working - product;
    steps.push({
      index: steps.length,
      // What the child is dividing into at this step.
      workingDividend: working,
      digit,
      product,
      remainder,
      // The next digit they pull down, or null at the end.
      bringDown: i + 1 < digits.length ? digits[i + 1] : null,
      position: i,
    });
    working = remainder;
  }
  return steps;
}

export const meta = { kind: 'procedure' };
export default longDivision;
