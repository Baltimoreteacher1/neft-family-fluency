// Factors, multiples, GCF and LCM.

import { factorsOf, gcd, lcm, isPrime } from '../engine/mathkit.js';

/** Greatest common factor or least common multiple of two numbers. */
export function gcfLcm(rng, params, meta = {}) {
  const which = params.which === 'both'
    ? rng.pick(['gcf', 'lcm'])
    : params.which || 'gcf';

  const max = params.max || 24;
  let a = rng.int(2, max);
  let b = rng.int(2, max);
  let guard = 0;
  // Two numbers that share nothing make a dull GCF question.
  while (which === 'gcf' && gcd(a, b) === 1 && guard++ < 30) {
    b = rng.int(2, max);
  }

  const answer = which === 'gcf' ? gcd(a, b) : lcm(a, b);

  return {
    id: `${which}:${Math.min(a, b)}:${Math.max(a, b)}`,
    kind: 'fact',
    op: 'numbertheory',
    a,
    b,
    which,
    prompt: which === 'gcf'
      ? `GCF of ${a} and ${b}`
      : `LCM of ${a} and ${b}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: [a, b, a * b, which === 'gcf' ? lcm(a, b) : gcd(a, b)]
      .filter((d) => d !== answer).slice(0, 3),
  };
}

/**
 * "Is 6 a factor of 48?" / "What is the 4th multiple of 7?" / "How many
 * factors does 24 have?"
 */
export function factorsMultiples(rng, params, meta = {}) {
  const mode = rng.pick(params.modes || ['isFactor', 'nthMultiple', 'countFactors']);
  const max = params.max || 100;

  if (mode === 'nthMultiple') {
    const base = rng.int(2, 12);
    const n = rng.int(2, 9);
    const answer = base * n;
    return {
      id: `mult-nth:${base}:${n}`,
      kind: 'fact',
      op: 'numbertheory',
      prompt: `What is multiple number ${n} of ${base}?`,
      answer,
      answerType: 'integer',
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [base * (n + 1), base * (n - 1), base + n].filter((d) => d !== answer).slice(0, 3),
    };
  }

  if (mode === 'countFactors') {
    const n = rng.int(6, Math.min(max, 60));
    const answer = factorsOf(n).length;
    return {
      id: `factors-count:${n}`,
      kind: 'fact',
      op: 'numbertheory',
      prompt: `How many factors does ${n} have?`,
      answer,
      answerType: 'integer',
      accept: [String(answer)],
      factors: factorsOf(n),
      strategyHint: meta.strategyTag || null,
      distractors: [answer + 1, answer - 1, n].filter((d) => d > 0 && d !== answer).slice(0, 3),
    };
  }

  // isFactor: answered 1 for yes, 0 for no, so the keypad stays numeric.
  const n = rng.int(10, max);
  const candidate = rng.int(2, 12);
  const yes = n % candidate === 0;
  return {
    id: `isfactor:${candidate}:${n}`,
    kind: 'fact',
    op: 'numbertheory',
    prompt: `Is ${candidate} a factor of ${n}? Type 1 for yes, 0 for no.`,
    answer: yes ? 1 : 0,
    answerType: 'integer',
    accept: yes ? ['1', 'yes', 'y'] : ['0', 'no', 'n'],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}
