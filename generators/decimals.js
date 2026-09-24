// Decimal operations and powers of ten.
//
// All arithmetic goes through the integer-scaled helpers in mathkit, because a
// generated answer of 0.30000000000000004 marks a correct child wrong.

import { decimalOp as exactOp, decimalText, placesOf } from '../engine/mathkit.js';

/** A decimal with exactly `places` decimal places, in [min, max]. */
function randomDecimal(rng, min, max, places) {
  const scale = 10 ** places;
  return rng.int(Math.round(min * scale), Math.round(max * scale)) / scale;
}

/**
 * @param {{ops:string[], places:number, min:number, max:number,
 *          divisorWhole?:boolean}} params
 */
export function decimalArithmetic(rng, params, meta = {}) {
  const op = rng.pick(params.ops || ['+', '-']);
  const places = params.places ?? 2;
  const min = params.min ?? 0.1;
  const max = params.max ?? 20;

  let a = randomDecimal(rng, min, max, places);
  let b = randomDecimal(rng, min, max, places);

  if (op === '-') {
    // Never negative before Grade 7.
    if (b > a) [a, b] = [b, a];
  }

  if (op === '×') {
    // Keep products readable: one factor stays short.
    b = randomDecimal(rng, 0.1, 9.9, 1);
  }

  if (op === '÷') {
    // Build from the answer so the quotient is exact and terminates.
    const quotient = randomDecimal(rng, 0.1, 20, places);
    const divisor = params.divisorWhole
      ? rng.int(2, 9)
      : randomDecimal(rng, 0.2, 9, 1);
    a = Number((quotient * divisor).toFixed(places + 2));
    b = divisor;
    const answer = exactOp(a, b, '/', placesOf(a));
    return finish(a, b, '÷', answer, params, meta);
  }

  const symbol = op;
  const jsOp = { '+': '+', '−': '-', '-': '-', '×': '*' }[op] || '+';
  const answer = exactOp(a, b, jsOp, Math.max(placesOf(a), placesOf(b)));
  return finish(a, b, symbol === '-' ? '−' : symbol, answer, params, meta);
}

function finish(a, b, symbol, answerRaw, params, meta) {
  // Round to the places the skill works in, so 1/3-style tails never appear.
  const places = params.answerPlaces ?? Math.max(placesOf(a), placesOf(b), 2);
  const answer = Number(answerRaw.toFixed(places));
  const text = decimalText(answer);

  return {
    id: `dec:${a}${symbol}${b}`,
    kind: 'fact',
    op: 'decimal',
    a,
    b,
    prompt: `${decimalText(a)} ${symbol} ${decimalText(b)}`,
    answer,
    answerType: 'decimal',
    // A trailing zero is the same number; so is a leading dot.
    accept: [text, answer.toFixed(Math.min(places, 2)), text.replace(/^0\./, '.')],
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}

/** Multiply or divide by 10, 100, 1000 -- the place-value shift. */
export function powersOfTen(rng, params, meta = {}) {
  const power = rng.pick(params.powers || [10, 100, 1000]);
  const op = rng.pick(params.ops || ['×', '÷']);
  const places = params.places ?? 2;
  const value = randomDecimal(rng, 0.01, 99, places);

  const answer = op === '×'
    ? Number((value * power).toFixed(6))
    : Number((value / power).toFixed(6));

  const text = decimalText(answer);
  return {
    id: `pow10:${value}${op}${power}`,
    kind: 'fact',
    op: 'decimal',
    a: value,
    b: power,
    prompt: `${decimalText(value)} ${op} ${power}`,
    answer,
    answerType: 'decimal',
    accept: [text, text.replace(/^0\./, '.')],
    shift: Math.log10(power) * (op === '×' ? 1 : -1),
    strategyHint: meta.strategyTag || null,
    distractors: [],
  };
}
