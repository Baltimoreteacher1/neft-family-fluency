// Division facts, generated as missing-factor problems so the quotient is
// always whole by construction: pick divisor and quotient, multiply to get the
// dividend. Generating a dividend first and dividing would produce remainders
// the week has not taught.

/**
 * @param {ReturnType<import('../rng.js').createRng>} rng
 * @param {{divisors:number[], quotients:number[]}} params
 */
export function divFact(rng, params, meta = {}) {
  const divisor = rng.pick(params.divisors);
  const quotient = rng.pick(params.quotients);
  const dividend = divisor * quotient;

  return {
    id: `div:${dividend}/${divisor}`,
    kind: 'fact',
    op: 'div',
    a: dividend,
    b: divisor,
    prompt: `${dividend} ÷ ${divisor}`,
    // The missing-factor phrasing the week actually teaches, shown as the hint.
    missingFactorPrompt: { product: dividend, known: divisor },
    answer: quotient,
    answerType: "integer",
    accept: [String(quotient)],
    strategyTag: meta.strategyTag || null,
    distractors: distractorsFor(divisor, quotient, dividend),
  };
}

function distractorsFor(divisor, quotient, dividend) {
  const candidates = [quotient + 1, quotient - 1, divisor, dividend - divisor];
  const seen = new Set([quotient]);
  const out = [];
  for (const c of candidates) {
    if (c > 0 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.slice(0, 3);
}

export const meta = { kind: 'fact' };
export default divFact;
