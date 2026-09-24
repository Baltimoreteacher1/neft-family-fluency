// Expressions and equations, Grades 6-8.
//
// Every equation is built BACKWARD from the solution, so the answer is always
// the clean integer (or the clean rational a stage explicitly asks for) that
// the standard says it should be. Generating a random equation and solving it
// is how you end up asking a twelve-year-old for -17/6.

import { superscript, gcd } from '../engine/mathkit.js';

/** Evaluate an expression with order of operations, including exponents. */
export function evaluateExpression(rng, params, meta = {}) {
  const shape = rng.pick(params.shapes || ['a+b*c', 'a*(b+c)', 'a+b^n', '(a+b)/c']);
  let prompt;
  let answer;

  if (shape === 'a+b*c') {
    const a = rng.int(2, 20);
    const b = rng.int(2, 9);
    const c = rng.int(2, 9);
    prompt = `${a} + ${b} × ${c}`;
    answer = a + b * c;
  } else if (shape === 'a*(b+c)') {
    const a = rng.int(2, 9);
    const b = rng.int(2, 12);
    const c = rng.int(2, 12);
    prompt = `${a} × (${b} + ${c})`;
    answer = a * (b + c);
  } else if (shape === 'a+b^n') {
    const a = rng.int(2, 20);
    const b = rng.pick([2, 3, 4, 5]);
    const n = rng.pick([2, 3]);
    prompt = `${a} + ${b}${superscript(n)}`;
    answer = a + b ** n;
  } else {
    // Built so the division is exact.
    const c = rng.int(2, 9);
    const total = c * rng.int(2, 12);
    const b = rng.int(1, total - 1);
    const a = total - b;
    prompt = `(${a} + ${b}) ÷ ${c}`;
    answer = total / c;
  }

  return {
    id: `expr:${prompt}`,
    kind: 'fact',
    op: 'expression',
    prompt,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}

/** One-step equations: x + a = b, ax = b, x/a = b, x - a = b. */
export function oneStepEq(rng, params, meta = {}) {
  const form = rng.pick(params.forms || ['add', 'sub', 'mul', 'div']);
  const x = rng.int(params.minX ?? 1, params.maxX ?? 20);

  let prompt;
  if (form === 'add') {
    const a = rng.int(1, 20);
    prompt = `x + ${a} = ${x + a}`;
  } else if (form === 'sub') {
    const a = rng.int(1, Math.min(20, x));
    prompt = `x − ${a} = ${x - a}`;
  } else if (form === 'mul') {
    const a = rng.int(2, 12);
    prompt = `${a}x = ${a * x}`;
  } else {
    const a = rng.int(2, 12);
    prompt = `x ÷ ${a} = ${x}`;
    return finishEq(prompt, x * a, params, meta, 'div');
  }

  return finishEq(prompt, x, params, meta, form);
}

/** Two-step equations: ax + b = c. */
export function twoStepEq(rng, params, meta = {}) {
  const x = rng.int(params.minX ?? 1, params.maxX ?? 12);
  const a = rng.int(2, 9);
  const b = rng.int(1, 20);
  const negative = params.allowNegative && rng.chance(0.4);
  const sign = negative ? -1 : 1;

  const c = a * x + b * sign;
  const prompt = `${a}x ${sign > 0 ? '+' : '−'} ${b} = ${c}`;
  return finishEq(prompt, x, params, meta, 'twostep');
}

/** Multi-step with variables on both sides: ax + b = cx + d. */
export function multiStepEq(rng, params, meta = {}) {
  const x = rng.int(params.minX ?? 1, params.maxX ?? 12);
  let a = rng.int(2, 9);
  let c = rng.int(2, 9);
  let guard = 0;
  // Different coefficients, or there is no x left to solve for.
  while (a === c && guard++ < 20) c = rng.int(2, 9);

  const b = rng.int(1, 20);
  // d is derived so x is exactly the integer chosen.
  const d = a * x + b - c * x;

  const dSign = d < 0 ? '−' : '+';
  const prompt = `${a}x + ${b} = ${c}x ${dSign} ${Math.abs(d)}`;
  return finishEq(prompt, x, params, meta, 'multistep');
}

function finishEq(prompt, answer, params, meta, form) {
  return {
    id: `eq:${prompt}`,
    kind: 'fact',
    op: 'equation',
    form,
    prompt: `${prompt}    x = ?`,
    answer,
    answerType: 'integer',
    allowNegative: Boolean(params.allowNegative),
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}
