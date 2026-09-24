// Extended division: 3600 / 9. Built from the basic fact upward so the quotient
// is whole by construction.

export function extendedDiv(rng, params, meta = {}) {
  const divisor = rng.pick(params.divisors);
  const baseQuotient = rng.pick(params.quotients);
  const scale = rng.pick(params.scales);
  const quotient = baseQuotient * scale;
  const dividend = divisor * quotient;

  return {
    id: `xdiv:${dividend}/${divisor}`,
    kind: "fact",
    op: "div",
    a: dividend,
    b: divisor,
    prompt: `${dividend} ÷ ${divisor}`,
    basicFact: {
      dividend: divisor * baseQuotient,
      divisor,
      answer: baseQuotient,
      scale,
    },
    answer: quotient,
    strategyTag: meta.strategyTag || null,
    distractors: [baseQuotient, quotient * 10, quotient / 10]
      .filter((d) => Number.isInteger(d) && d > 0 && d !== quotient)
      .slice(0, 3),
  };
}

export const meta = { kind: "fact" };
export default extendedDiv;
