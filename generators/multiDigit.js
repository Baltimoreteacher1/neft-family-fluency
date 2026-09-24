// Multi-digit multiplication, and multiplying by multiples of ten.
//
// Built so the answer is exact by construction rather than checked afterwards,
// and so a stage that promises "2-digit x 2-digit" never quietly emits a
// 3-digit factor.

import { superscript } from '../engine/mathkit.js';

function range(rng, digits) {
  const lo = 10 ** (digits - 1);
  const hi = 10 ** digits - 1;
  return rng.int(digits === 1 ? 2 : lo, hi);
}

/** "4 x 60", "300 x 7": the basic fact plus a place-value pattern. */
export function multByMultiples(rng, params, meta = {}) {
  const base = rng.pick(params.factors || [2, 3, 4, 5, 6, 7, 8, 9]);
  const other = rng.pick(params.others || [2, 3, 4, 5, 6, 7, 8, 9]);
  const scale = rng.pick(params.scales || [10]);
  const scaled = other * scale;
  const answer = base * scaled;

  return {
    id: `multmult:${base}x${scaled}`,
    kind: 'fact',
    op: 'mult',
    a: base,
    b: scaled,
    prompt: `${base} × ${scaled}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    basicFact: { a: base, b: other, answer: base * other, scale },
    strategyHint: meta.strategyTag || null,
    // The classic error is the wrong number of zeros.
    distractors: [base * other, answer * 10, answer / 10]
      .filter((d) => Number.isInteger(d) && d > 0 && d !== answer)
      .slice(0, 3),
  };
}

/** Standard-algorithm multiplication: n-digit x m-digit. */
export function multiDigitMul(rng, params, meta = {}) {
  const aDigits = rng.pick(params.aDigits || [2]);
  const bDigits = rng.pick(params.bDigits || [1]);
  const a = range(rng, aDigits);
  const b = range(rng, bDigits);
  const answer = a * b;

  return {
    id: `mdmul:${a}x${b}`,
    kind: 'procedure',
    op: 'mult',
    a,
    b,
    prompt: `${a} × ${b}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    // Partial products, so the workspace can check the work and not just the
    // final number.
    partials: partialProducts(a, b),
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}

/** One partial product per digit of b, as a child would write them. */
function partialProducts(a, b) {
  const out = [];
  const digits = String(b).split('').reverse().map(Number);
  digits.forEach((digit, place) => {
    if (digit === 0) return;
    out.push({ digit, place, value: a * digit * 10 ** place });
  });
  return out;
}

/** Multi-digit addition and subtraction with the standard algorithm. */
export function multiDigitAddSub(rng, params, meta = {}) {
  const digits = rng.pick(params.digits || [3, 4]);
  const op = params.op === 'both' ? rng.pick(['add', 'sub']) : params.op || 'add';
  const hi = 10 ** digits - 1;
  const lo = 10 ** (digits - 1);

  if (op === 'add') {
    const a = rng.int(lo, hi);
    const b = rng.int(lo, hi);
    const answer = a + b;
    return {
      id: `mdadd:${a}+${b}`,
      kind: 'procedure',
      op: 'add',
      a, b,
      prompt: `${a} + ${b}`,
      answer,
      answerType: 'integer',
      accept: [String(answer)],
      strategyHint: meta.strategyTag || null,
      distractors: [],
    };
  }

  // Subtraction is built from its own answer, so it is never negative.
  const answer = rng.int(lo, hi);
  const b = rng.int(lo, hi);
  const a = answer + b;
  return {
    id: `mdsub:${a}-${b}`,
    kind: 'procedure',
    op: 'sub',
    a, b,
    prompt: `${a} − ${b}`,
    answer,
    answerType: 'integer',
    accept: [String(answer)],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}
