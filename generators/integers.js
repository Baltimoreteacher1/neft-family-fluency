// Signed number arithmetic, Grade 7.
//
// This is the first place negative answers are allowed at all -- every earlier
// generator builds its problems so results stay at or above zero.

import { simplify, makeFraction } from '../engine/mathkit.js';

export function integerAddSub(rng, params, meta = {}) {
  const max = params.max || 20;
  const sameSigns = params.sameSigns === true;

  let a = rng.int(1, max);
  let b = rng.int(1, max);

  if (sameSigns) {
    // Both negative or both positive: the easier first stage.
    const sign = rng.chance(0.5) ? 1 : -1;
    a *= sign;
    b *= sign;
  } else {
    a *= rng.chance(0.5) ? 1 : -1;
    b *= rng.chance(0.5) ? 1 : -1;
  }

  const op = params.op === 'sub' ? 'sub' : params.op === 'both' ? rng.pick(['add', 'sub']) : 'add';
  const answer = op === 'add' ? a + b : a - b;

  const bText = b < 0 ? `(${b})` : String(b);
  return {
    id: `int${op}:${a}:${b}`,
    kind: 'fact',
    op: 'integer',
    a,
    b,
    prompt: `${a} ${op === 'add' ? '+' : '−'} ${bText}`,
    answer,
    answerType: 'integer',
    allowNegative: true,
    accept: [String(answer), answer < 0 ? `−${Math.abs(answer)}` : String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: [-answer, answer + 1, answer - 1].filter((d) => d !== answer).slice(0, 3),
  };
}

export function integerMulDiv(rng, params, meta = {}) {
  const op = params.op === 'div' ? 'div' : params.op === 'both' ? rng.pick(['mul', 'div']) : 'mul';
  const max = params.max || 12;

  const magA = rng.int(2, max);
  const magB = rng.int(2, max);
  const signA = rng.chance(0.5) ? 1 : -1;
  const signB = rng.chance(0.5) ? 1 : -1;

  if (op === 'mul') {
    const a = magA * signA;
    const b = magB * signB;
    const answer = a * b;
    const bText = b < 0 ? `(${b})` : String(b);
    return {
      id: `intmul:${a}:${b}`,
      kind: 'fact',
      op: 'integer',
      a, b,
      prompt: `${a} × ${bText}`,
      answer,
      answerType: 'integer',
      allowNegative: true,
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [-answer].filter((d) => d !== answer),
    };
  }

  // Division built from its own quotient so it is always exact.
  const quotient = magA * signA;
  const divisor = magB * signB;
  const dividend = quotient * divisor;
  const bText = divisor < 0 ? `(${divisor})` : String(divisor);
  return {
    id: `intdiv:${dividend}:${divisor}`,
    kind: 'fact',
    op: 'integer',
    a: dividend,
    b: divisor,
    prompt: `${dividend} ÷ ${bText}`,
    answer: quotient,
    answerType: 'integer',
    allowNegative: true,
    accept: [String(quotient)],
    strategyHint: meta.strategyTag || null,
    distractors: [-quotient].filter((d) => d !== quotient),
  };
}

/** Signed decimals and fractions together -- 7.NS.A.3. */
export function rationalOp(rng, params, meta = {}) {
  const useDecimal = rng.chance(0.5);
  const op = rng.pick(params.ops || ['+', '−']);

  if (useDecimal) {
    const a = Number(((rng.int(1, 200) / 10) * (rng.chance(0.5) ? 1 : -1)).toFixed(1));
    const b = Number(((rng.int(1, 200) / 10) * (rng.chance(0.5) ? 1 : -1)).toFixed(1));
    const answer = Number((op === '+' ? a + b : a - b).toFixed(1));
    const bText = b < 0 ? `(${b})` : String(b);
    return {
      id: `rat:${a}${op}${b}`,
      kind: 'fact',
      op: 'integer',
      a, b,
      prompt: `${a} ${op} ${bText}`,
      answer,
      answerType: 'decimal',
      allowNegative: true,
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [],
    };
  }

  // Signed fractions with a common denominator, kept readable.
  const d = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const n1 = rng.int(1, d * 2) * (rng.chance(0.5) ? 1 : -1);
  const n2 = rng.int(1, d * 2) * (rng.chance(0.5) ? 1 : -1);
  const total = op === '+' ? n1 + n2 : n1 - n2;

  // simplify() from mathkit handles zero correctly: 0/4 is 0/1, not "0/4".
  // The local gcd shortcut used to leave a zero numerator over its old
  // denominator, which reads as an unsimplified answer to a child.
  const answer = simplify(makeFraction(total, d));
  const text = answer.d === 1 ? String(answer.n) : `${answer.n}/${answer.d}`;

  return {
    id: `ratfrac:${n1}/${d}${op}${n2}/${d}`,
    kind: 'fact',
    op: 'fraction',
    prompt: `${n1}/${d} ${op} ${n2 < 0 ? `(${n2}/${d})` : `${n2}/${d}`}`,
    answer,
    answerType: 'fraction',
    allowNegative: true,
    requireSimplest: true,
    accept: [text],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}
