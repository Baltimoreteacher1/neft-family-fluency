// Ratios, rates and percents -- Grades 6 and 7.
//
// Contexts are deliberately ordinary and non-commercial: buses, water, pages,
// steps. Nothing here asks a child to price anything they cannot afford.

/** Unit rate: "180 miles in 3 hours -> how many miles in 1 hour?" */
export function unitRate(rng, params, meta = {}) {
  const contexts = params.contexts || [
    { unit: 'miles', per: 'hour' },
    { unit: 'pages', per: 'minute' },
    { unit: 'litres', per: 'minute' },
    { unit: 'steps', per: 'second' },
    { unit: 'words', per: 'minute' },
  ];
  const ctx = rng.pick(contexts);

  // Built from the rate so it is always a whole number.
  const rate = rng.int(2, params.maxRate || 60);
  const count = rng.int(2, 9);
  const total = rate * count;

  return {
    id: `rate:${total}:${count}`,
    kind: 'fact',
    op: 'ratio',
    prompt: `${total} ${ctx.unit} in ${count} ${ctx.per}s. How many ${ctx.unit} in 1 ${ctx.per}?`,
    answer: rate,
    answerType: 'integer',
    accept: [String(rate)],
    strategyHint: meta.strategyTag || null,
    distractors: [total, count, rate + 1].filter((d) => d !== rate).slice(0, 3),
  };
}

/** The constant of proportionality read off a table. */
export function constantOfProportionality(rng, params, meta = {}) {
  const k = rng.int(2, params.maxK || 12);
  const xs = [];
  while (xs.length < 3) {
    const x = rng.int(1, 12);
    if (!xs.includes(x)) xs.push(x);
  }
  xs.sort((a, b) => a - b);

  const rows = xs.map((x) => `${x} → ${x * k}`).join('    ');
  return {
    id: `kprop:${k}:${xs.join('-')}`,
    kind: 'fact',
    op: 'ratio',
    prompt: `x → y:   ${rows}\nWhat is k, where y = kx?`,
    answer: k,
    answerType: 'integer',
    accept: [String(k)],
    table: xs.map((x) => ({ x, y: x * k })),
    strategyHint: meta.strategyTag || null,
    distractors: [k + 1, k - 1, xs[0] * k].filter((d) => d > 0 && d !== k).slice(0, 3),
  };
}

/**
 * Percent of a number, percent change, and tax/tip/discount.
 * Every stage is built so the answer lands on a clean value.
 */
export function percent(rng, params, meta = {}) {
  const mode = rng.pick(params.modes || ['of']);

  if (mode === 'of') {
    // Friendly percents keep the mental maths honest at this stage.
    const pct = rng.pick(params.percents || [10, 20, 25, 50, 75, 5, 15]);
    // Chosen so pct% of whole is exact.
    const step = 100 / gcd100(pct);
    const whole = step * rng.int(1, Math.floor((params.maxWhole || 400) / step));
    const answer = (whole * pct) / 100;
    return {
      id: `pct-of:${pct}:${whole}`,
      kind: 'fact',
      op: 'ratio',
      prompt: `${pct}% of ${whole}`,
      answer,
      answerType: 'integer',
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [whole - answer, answer * 2, pct].filter((d) => d !== answer).slice(0, 3),
    };
  }

  if (mode === 'change') {
    const pct = rng.pick([10, 20, 25, 50]);
    const step = 100 / gcd100(pct);
    const from = step * rng.int(2, 20);
    const up = rng.chance(0.5);
    const delta = (from * pct) / 100;
    const answer = up ? from + delta : from - delta;
    return {
      id: `pct-change:${from}:${pct}:${up ? 'up' : 'down'}`,
      kind: 'fact',
      op: 'ratio',
      prompt: `${from} ${up ? 'increased' : 'decreased'} by ${pct}%`,
      answer,
      answerType: 'integer',
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [from, delta, up ? from - delta : from + delta]
        .filter((d) => d !== answer).slice(0, 3),
    };
  }

  // tax / tip / discount, in whole dollars so the answer is not a stray cent.
  const pct = rng.pick([10, 15, 20, 25]);
  const step = 100 / gcd100(pct);
  const price = step * rng.int(2, 20);
  const delta = (price * pct) / 100;
  const kind = rng.pick(['tip', 'tax', 'discount']);
  const answer = kind === 'discount' ? price - delta : price + delta;

  return {
    id: `pct-${kind}:${price}:${pct}`,
    kind: 'fact',
    op: 'ratio',
    prompt: kind === 'discount'
      ? `$${price} with ${pct}% off. What do you pay?`
      : `$${price} plus ${pct}% ${kind}. What is the total?`,
    answer,
    answerType: 'integer',
    accept: [String(answer), `$${answer}`],
    strategyHint: meta.strategyTag || null,
    distractors: [price, delta].filter((d) => d !== answer),
  };
}

/** The step size that keeps pct% of a multiple exact. */
function gcd100(pct) {
  let a = 100;
  let b = pct;
  while (b) [a, b] = [b, a % b];
  return a;
}
