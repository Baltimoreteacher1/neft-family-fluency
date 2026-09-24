// Fractions: equivalence, the four operations, and fraction-by-whole.
//
// Every answer is produced as an exact {n, d} pair and simplified, so nothing
// here depends on floating point. Whether simplest form is REQUIRED is the
// skill's choice, not this file's -- see `requireSimplest`.

import {
  makeFraction, simplify, addFractions, subFractions, mulFractions,
  divFractions, fractionText, mixedText, gcd, lcm,
} from '../engine/mathkit.js';

function answerFields(frac, { requireSimplest = true } = {}) {
  const simple = simplify(frac);
  const accept = [fractionText(simple)];
  const mixed = mixedText(simple);
  if (mixed) accept.push(mixed);
  // An unsimplified but equal form is handled by the checker, which returns
  // "simplify it one more step" rather than marking it wrong.
  if (simple.d === 1) accept.push(String(simple.n));
  return {
    answer: simple,
    answerType: 'fraction',
    accept,
    requireSimplest,
  };
}

/** "2/3 = ?/12" -- the scaling idea behind every later fraction skill. */
export function equivFraction(rng, params, meta = {}) {
  const d = rng.pick(params.denominators || [2, 3, 4, 5, 6]);
  const n = rng.int(1, d - 1);
  const factor = rng.int(2, params.maxFactor || 5);

  // Ask for the missing numerator: it is the piece that actually moves.
  const answer = n * factor;
  return {
    id: `equiv:${n}/${d}x${factor}`,
    kind: 'fact',
    op: 'fraction',
    prompt: `${n}/${d} = ?/${d * factor}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    from: { n, d },
    to: { n: answer, d: d * factor },
    strategyHint: meta.strategyTag || null,
    distractors: [n, n + factor, d * factor].filter((x) => x !== answer).slice(0, 3),
  };
}

/** Add or subtract fractions with unlike denominators. */
export function fractionAddSub(rng, params, meta = {}) {
  const pool = params.denominators || [2, 3, 4, 6, 8];
  let d1 = rng.pick(pool);
  let d2 = rng.pick(pool);
  let guard = 0;
  // Unlike denominators are the point of the skill.
  while (d2 === d1 && guard++ < 20) d2 = rng.pick(pool);

  const n1 = rng.int(1, d1 - 1);
  const n2 = rng.int(1, d2 - 1);
  const a = makeFraction(n1, d1);
  const b = makeFraction(n2, d2);

  const op = params.op === 'sub' ? 'sub' : params.op === 'both' ? rng.pick(['add', 'sub']) : 'add';

  // Subtraction is ordered so the result is never negative before Grade 7.
  let left = a;
  let right = b;
  if (op === 'sub' && a.n * b.d < b.n * a.d) {
    left = b;
    right = a;
  }

  const result = op === 'add' ? addFractions(left, right) : subFractions(left, right);

  return {
    id: `frac${op}:${left.n}/${left.d}${op === 'add' ? '+' : '-'}${right.n}/${right.d}`,
    kind: 'fact',
    op: 'fraction',
    prompt: `${fractionText(left)} ${op === 'add' ? '+' : '−'} ${fractionText(right)}`,
    lcd: lcm(left.d, right.d),
    strategyHint: meta.strategyTag || null,
    distractors: [],
    ...answerFields(result, { requireSimplest: params.requireSimplest !== false }),
  };
}

/** Multiply a fraction by a whole number, and by another fraction. */
export function fractionMultiply(rng, params, meta = {}) {
  const pool = params.denominators || [2, 3, 4, 5, 6, 8];
  const d = rng.pick(pool);
  const n = rng.int(1, d - 1);
  const a = makeFraction(n, d);

  if (params.byWhole) {
    const whole = rng.int(2, params.maxWhole || 12);
    const result = mulFractions(a, makeFraction(whole, 1));
    return {
      id: `fracmulw:${n}/${d}x${whole}`,
      kind: 'fact',
      op: 'fraction',
      prompt: `${whole} × ${fractionText(a)}`,
      strategyHint: meta.strategyTag || null,
      distractors: [],
      ...answerFields(result, { requireSimplest: params.requireSimplest !== false }),
    };
  }

  const d2 = rng.pick(pool);
  const n2 = rng.int(1, d2 - 1);
  const b = makeFraction(n2, d2);
  const result = mulFractions(a, b);

  return {
    id: `fracmul:${n}/${d}x${n2}/${d2}`,
    kind: 'fact',
    op: 'fraction',
    prompt: `${fractionText(a)} × ${fractionText(b)}`,
    strategyHint: meta.strategyTag || null,
    distractors: [],
    ...answerFields(result, { requireSimplest: params.requireSimplest !== false }),
  };
}

/** Divide fractions -- Grade 6's "multiply by the reciprocal". */
export function fractionDivide(rng, params, meta = {}) {
  const pool = params.denominators || [2, 3, 4, 5, 6, 8];
  const d = rng.pick(pool);
  const n = rng.int(1, d - 1);
  const a = makeFraction(n, d);

  let b;
  if (params.byWhole) {
    b = makeFraction(rng.int(2, params.maxWhole || 10), 1);
  } else {
    const d2 = rng.pick(pool);
    b = makeFraction(rng.int(1, d2 - 1), d2);
  }

  const result = divFractions(a, b);

  return {
    id: `fracdiv:${a.n}/${a.d}div${b.n}/${b.d}`,
    kind: 'fact',
    op: 'fraction',
    prompt: `${fractionText(a)} ÷ ${fractionText(b)}`,
    reciprocal: { n: b.d, d: b.n },
    strategyHint: meta.strategyTag || null,
    distractors: [],
    ...answerFields(result, { requireSimplest: params.requireSimplest !== false }),
  };
}
