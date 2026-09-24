// Deciding whether what a child typed is right.
//
// This is where a maths app quietly loses trust. A child who types 0.5 when
// the answer is .5, or 1/2 when the key says 2/4, has done the maths -- marking
// them wrong teaches them that the app is arbitrary. So every item carries an
// `accept` list, and comparison is numeric wherever a number is meant.
//
// The one place we are deliberately strict is simplest form, and only when the
// skill says so: then a correct-but-unsimplified answer gets "simplify it one
// more step", which is a nudge, not a mark against them.

import { simplify, fractionEquals, makeFraction } from './mathkit.js';

export const RESULT = {
  CORRECT: 'correct',
  WRONG: 'wrong',
  UNSIMPLIFIED: 'unsimplified',
};

/** Strip spaces and normalise the several dashes a phone keyboard can produce. */
function tidy(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[‒–—−]/g, '-')
    .replace(/\s+/g, ' ');
}

/** "3/4" or "1 1/2" or "-2/3" -> {n, d}, else null. */
export function parseFraction(raw) {
  const s = tidy(raw);
  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const n = Number(mixed[2]);
    const d = Number(mixed[3]);
    if (!d) return null;
    const sign = whole < 0 ? -1 : 1;
    return makeFraction(Math.abs(whole) * d * sign + n * sign, d);
  }
  const plain = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (plain) {
    const d = Number(plain[2]);
    if (!d) return null;
    return makeFraction(Number(plain[1]), d);
  }
  const whole = s.match(/^-?\d+$/);
  if (whole) return makeFraction(Number(s), 1);
  return null;
}

/** A number, tolerating ".5", "+3", "1,200" and a trailing dot. */
export function parseNumber(raw) {
  const s = tidy(raw).replace(/,/g, '').replace(/^\+/, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "3 R 1", "3r1", "3 remainder 1" -> { quotient, remainder }. */
export function parseRemainder(raw) {
  const s = tidy(raw).toUpperCase().replace(/REMAINDER/g, 'R');
  const m = s.match(/^(-?\d+)\s*R\s*(\d+)$/);
  if (!m) return null;
  return { quotient: Number(m[1]), remainder: Number(m[2]) };
}

/** "3 x 10^4", "3x10^4", "3 × 10⁴" -> { mantissa, exponent }. */
export function parseSciNotation(raw) {
  const s = tidy(raw)
    .replace(/[×✕✖]/g, 'x')
    .replace(/⁻/g, '-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g,
      (c) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/\s+/g, '')
    .toLowerCase();

  // Accept both "3x10^4" and the "3e4" a calculator would show.
  const caret = s.match(/^(-?\d+\.?\d*)x10\^?(-?\d+)$/);
  if (caret) return { mantissa: Number(caret[1]), exponent: Number(caret[2]) };
  const e = s.match(/^(-?\d+\.?\d*)e(-?\d+)$/);
  if (e) return { mantissa: Number(e[1]), exponent: Number(e[2]) };
  return null;
}

/**
 * Check an answer against an item.
 *
 * @param {object} item     a generated item
 * @param {string} raw      what the child typed
 * @returns {'correct'|'wrong'|'unsimplified'}
 */
export function checkAnswer(item, raw) {
  const typed = tidy(raw);
  if (!typed) return RESULT.WRONG;

  // An explicit accept list always wins: the generator knows its own skill.
  const accepted = (item.accept || []).map((a) => tidy(a).toLowerCase());
  if (accepted.includes(typed.toLowerCase())) return RESULT.CORRECT;

  switch (item.answerType) {
    case 'fraction':
      return checkFraction(item, typed);
    case 'remainder':
      return checkRemainder(item, typed);
    case 'sciNotation':
      return checkSci(item, typed);
    case 'decimal':
    case 'integer':
    default:
      return checkNumeric(item, typed);
  }
}

function checkNumeric(item, typed) {
  const got = parseNumber(typed);
  if (got === null) return RESULT.WRONG;
  const want = Number(item.answer);
  if (Number.isNaN(want)) return RESULT.WRONG;
  // Compared as numbers, never as strings: "0.50" is 0.5, and "007" is 7.
  // The tolerance absorbs float noise only, never a genuinely different value.
  return Math.abs(got - want) < 1e-9 ? RESULT.CORRECT : RESULT.WRONG;
}

function checkFraction(item, typed) {
  const got = parseFraction(typed);
  if (!got) {
    // A decimal that equals the fraction is still the right quantity, unless
    // the skill is specifically about writing fractions.
    if (item.acceptDecimal !== false) {
      const asNumber = parseNumber(typed);
      if (asNumber !== null && Math.abs(asNumber - item.answer.n / item.answer.d) < 1e-9) {
        return RESULT.CORRECT;
      }
    }
    return RESULT.WRONG;
  }

  if (!fractionEquals(got, item.answer)) return RESULT.WRONG;

  // Right quantity. Is it in the form the skill asks for?
  if (item.requireSimplest) {
    const simplest = simplify(got);
    if (simplest.n !== got.n || simplest.d !== got.d) return RESULT.UNSIMPLIFIED;
  }
  return RESULT.CORRECT;
}

function checkRemainder(item, typed) {
  const got = parseRemainder(typed);
  if (got) {
    return got.quotient === item.quotient && got.remainder === item.remainder
      ? RESULT.CORRECT
      : RESULT.WRONG;
  }
  // No remainder written: only right when there genuinely is none.
  if (item.remainder === 0) return checkNumeric({ answer: item.quotient }, typed);
  return RESULT.WRONG;
}

function checkSci(item, typed) {
  const got = parseSciNotation(typed);
  if (!got) return RESULT.WRONG;
  return got.mantissa === item.mantissa && got.exponent === item.exponent
    ? RESULT.CORRECT
    : RESULT.WRONG;
}

/** What the keypad needs to offer for this item. */
export function keypadModeFor(item) {
  switch (item.answerType) {
    case 'fraction': return 'fraction';
    case 'decimal': return 'decimal';
    case 'remainder': return 'remainder';
    case 'sciNotation': return 'sci';
    default: return item.allowNegative ? 'signed' : 'digits';
  }
}
