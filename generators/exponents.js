// Exponents, roots, scientific notation and irrational estimation -- Grade 8.

import { superscript, powerText, isPerfectSquare, isPerfectCube } from '../engine/mathkit.js';

/** Integer exponent rules: product, quotient, power of a power. */
export function expRule(rng, params, meta = {}) {
  const rule = rng.pick(params.rules || ['product', 'quotient', 'power']);
  const base = rng.pick(params.bases || [2, 3, 5, 10, 'x']);
  const m = rng.int(2, 8);
  const n = rng.int(2, 8);

  let prompt;
  let answer;

  if (rule === 'product') {
    prompt = `${powerText(base, m)} × ${powerText(base, n)} = ${base}^?`;
    answer = m + n;
  } else if (rule === 'quotient') {
    // Keep the exponent positive unless the stage allows negatives.
    const big = Math.max(m, n) + (params.allowNegative ? 0 : 1);
    const small = Math.min(m, n);
    prompt = `${powerText(base, big)} ÷ ${powerText(base, small)} = ${base}^?`;
    answer = big - small;
  } else {
    prompt = `(${powerText(base, m)})${superscript(n)} = ${base}^?`;
    answer = m * n;
  }

  return {
    id: `exp:${rule}:${base}:${m}:${n}`,
    kind: 'fact',
    op: 'exponent',
    rule,
    prompt,
    answer,
    answerType: 'integer',
    allowNegative: Boolean(params.allowNegative),
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: [m * n, m + n, Math.abs(m - n)].filter((d) => d !== answer).slice(0, 3),
  };
}

/** Square and cube roots of perfect squares and cubes only. */
export function roots(rng, params, meta = {}) {
  const cube = params.cubes && rng.chance(0.4);
  if (cube) {
    const r = rng.int(2, params.maxCubeRoot || 10);
    const n = r ** 3;
    return {
      id: `cbrt:${n}`,
      kind: 'fact',
      op: 'root',
      prompt: `∛${n}`,
      answer: r,
      answerType: 'integer',
      accept: [String(r)],
      strategyHint: meta.strategyTag || null,
      distractors: [r + 1, r - 1, n / 3].filter((d) => Number.isInteger(d) && d > 0 && d !== r).slice(0, 3),
    };
  }

  const r = rng.int(2, params.maxRoot || 15);
  const n = r ** 2;
  return {
    id: `sqrt:${n}`,
    kind: 'fact',
    op: 'root',
    prompt: `√${n}`,
    answer: r,
    answerType: 'integer',
    accept: [String(r)],
    strategyHint: meta.strategyTag || null,
    distractors: [r + 1, r - 1, n / 2].filter((d) => Number.isInteger(d) && d > 0 && d !== r).slice(0, 3),
  };
}

/**
 * Scientific notation: convert to and from, and multiply or divide two values.
 * The answer is entered as "3 x 10^4" and the checker accepts "3e4" too.
 */
export function sciNotation(rng, params, meta = {}) {
  const mode = rng.pick(params.modes || ['toSci', 'fromSci']);

  if (mode === 'toSci') {
    const mantissaDigits = rng.int(1, 3);
    const mantissa = Number((rng.int(10 ** mantissaDigits, 10 ** (mantissaDigits + 1) - 1) / 10 ** mantissaDigits).toFixed(mantissaDigits));
    const exponent = rng.int(params.minExp ?? 2, params.maxExp ?? 6);
    const value = Number((mantissa * 10 ** exponent).toPrecision(12));

    return {
      id: `sci-to:${value}`,
      kind: 'fact',
      op: 'sci',
      prompt: `Write ${value.toLocaleString('en-US')} in scientific notation`,
      mantissa,
      exponent,
      answer: `${mantissa} × 10${superscript(exponent)}`,
      answerType: 'sciNotation',
      accept: [
        `${mantissa}x10^${exponent}`,
        `${mantissa} x 10^${exponent}`,
        `${mantissa}e${exponent}`,
      ],
      strategyHint: meta.strategyTag || null,
      distractors: [],
    };
  }

  if (mode === 'fromSci') {
    const mantissa = Number((rng.int(10, 99) / 10).toFixed(1));
    const exponent = rng.int(2, 5);
    const answer = Number((mantissa * 10 ** exponent).toPrecision(12));
    return {
      id: `sci-from:${mantissa}e${exponent}`,
      kind: 'fact',
      op: 'sci',
      prompt: `${mantissa} × 10${superscript(exponent)} = ?`,
      answer,
      answerType: 'integer',
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [],
    };
  }

  // Multiply or divide two values in scientific notation.
  const m1 = rng.int(2, 9);
  const m2 = rng.int(2, 9);
  const e1 = rng.int(2, 6);
  const e2 = rng.int(2, 6);
  const times = rng.chance(0.5);

  const rawMantissa = times ? m1 * m2 : m1 / m2;
  const rawExp = times ? e1 + e2 : e1 - e2;
  // Normalise so the mantissa stays in [1, 10).
  let mantissa = rawMantissa;
  let exponent = rawExp;
  while (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  while (mantissa < 1) {
    mantissa *= 10;
    exponent -= 1;
  }
  mantissa = Number(mantissa.toFixed(2));

  return {
    id: `sci-op:${m1}e${e1}${times ? 'x' : '/'}${m2}e${e2}`,
    kind: 'fact',
    op: 'sci',
    prompt: `(${m1} × 10${superscript(e1)}) ${times ? '×' : '÷'} (${m2} × 10${superscript(e2)})`,
    mantissa,
    exponent,
    answer: `${mantissa} × 10${superscript(exponent)}`,
    answerType: 'sciNotation',
    accept: [`${mantissa}x10^${exponent}`, `${mantissa} x 10^${exponent}`, `${mantissa}e${exponent}`],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}

/** "Between which two whole numbers does root 30 lie?" -- asks for the lower one. */
export function irrationalBetween(rng, params, meta = {}) {
  let n = rng.int(params.min || 2, params.max || 150);
  let guard = 0;
  // A perfect square has an exact root, which is a different question.
  while (isPerfectSquare(n) && guard++ < 50) n = rng.int(params.min || 2, params.max || 150);

  const lower = Math.floor(Math.sqrt(n));
  return {
    id: `irr:${n}`,
    kind: 'fact',
    op: 'root',
    prompt: `√${n} is between ? and ${lower + 1}`,
    answer: lower,
    answerType: 'integer',
    accept: [String(lower)],
    upper: lower + 1,
    strategyHint: meta.strategyTag || null,
    distractors: [lower + 1, lower - 1, n].filter((d) => d > 0 && d !== lower).slice(0, 3),
  };
}

/** Slope from two points, or from a table. */
export function slope(rng, params, meta = {}) {
  const m = rng.int(1, params.maxSlope || 6) * (params.allowNegative && rng.chance(0.4) ? -1 : 1);
  const b = rng.int(-6, 6);

  const x1 = rng.int(-6, 6);
  let x2 = rng.int(-6, 6);
  let guard = 0;
  while (x2 === x1 && guard++ < 20) x2 = rng.int(-6, 6);

  const y1 = m * x1 + b;
  const y2 = m * x2 + b;

  if (params.fromTable) {
    return {
      id: `slope-tbl:${m}:${x1}:${x2}`,
      kind: 'fact',
      op: 'slope',
      prompt: `x → y:   ${x1} → ${y1}    ${x2} → ${y2}\nWhat is the slope?`,
      answer: m,
      answerType: 'integer',
      allowNegative: true,
      accept: [String(m)],
      strategyHint: meta.strategyTag || null,
      distractors: [-m, m + 1, b].filter((d) => d !== m).slice(0, 3),
    };
  }

  return {
    id: `slope:${x1},${y1}:${x2},${y2}`,
    kind: 'fact',
    op: 'slope',
    prompt: `Slope between (${x1}, ${y1}) and (${x2}, ${y2})`,
    answer: m,
    answerType: 'integer',
    allowNegative: true,
    accept: [String(m)],
    strategyHint: meta.strategyTag || null,
    distractors: [-m, m + 1, b].filter((d) => d !== m).slice(0, 3),
  };
}
