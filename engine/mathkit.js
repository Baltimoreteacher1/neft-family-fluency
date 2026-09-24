// Small exact-arithmetic helpers shared by the generators.
//
// Everything here works in integers wherever it can. Floating point is the
// enemy of a maths app: 0.1 + 0.2 must be 0.3 on screen, and a generated
// "answer" of 0.30000000000000004 marks a correct child wrong.

export function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

export function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}

/** All factors of n, ascending. */
export function factorsOf(n) {
  const out = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i) continue;
    out.push(i);
    if (i !== n / i) out.push(n / i);
  }
  return out.sort((a, b) => a - b);
}

export function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

// --- fractions ------------------------------------------------------------
// A fraction is { n, d } with d > 0. Sign lives on the numerator.

export function makeFraction(n, d) {
  if (d === 0) throw new Error('denominator of zero');
  const sign = d < 0 ? -1 : 1;
  return { n: n * sign, d: Math.abs(d) };
}

export function simplify({ n, d }) {
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  return makeFraction(n / g, d / g);
}

export function addFractions(a, b) {
  return simplify(makeFraction(a.n * b.d + b.n * a.d, a.d * b.d));
}

export function subFractions(a, b) {
  return simplify(makeFraction(a.n * b.d - b.n * a.d, a.d * b.d));
}

export function mulFractions(a, b) {
  return simplify(makeFraction(a.n * b.n, a.d * b.d));
}

export function divFractions(a, b) {
  if (b.n === 0) throw new Error('divide by zero fraction');
  return simplify(makeFraction(a.n * b.d, a.d * b.n));
}

export function fractionEquals(a, b) {
  return a.n * b.d === b.n * a.d;
}

/** "3/4", or "3" when the denominator is 1. */
export function fractionText({ n, d }) {
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** "1 1/2" for an improper fraction, or null when it is already proper. */
export function mixedText({ n, d }) {
  if (d === 1 || Math.abs(n) < d) return null;
  const sign = n < 0 ? '-' : '';
  const whole = Math.floor(Math.abs(n) / d);
  const rest = Math.abs(n) % d;
  return rest === 0 ? `${sign}${whole}` : `${sign}${whole} ${rest}/${d}`;
}

// --- decimals -------------------------------------------------------------

/**
 * Exact decimal arithmetic by working in integer "cents" at a fixed number of
 * places, so 0.1 + 0.2 is 0.3 and not 0.30000000000000004.
 */
export function decimalOp(a, b, op, places) {
  const scale = 10 ** places;
  const ai = Math.round(a * scale);
  const bi = Math.round(b * scale);
  switch (op) {
    case '+': return (ai + bi) / scale;
    case '-': return (ai - bi) / scale;
    case '*': return (ai * bi) / (scale * scale);
    case '/': return ai / bi;
    default: throw new Error(`unknown op ${op}`);
  }
}

/** Trim a float to a clean string: 3.50 -> "3.5", 4.0 -> "4". */
export function decimalText(value, places = 4) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(places)));
}

/** How many decimal places a number is written with. */
export function placesOf(value) {
  const s = String(value);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

// --- powers ---------------------------------------------------------------

export function isPerfectSquare(n) {
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

export function isPerfectCube(n) {
  const r = Math.round(Math.cbrt(n));
  return r * r * r === n;
}

/** Superscript digits, so exponents read as exponents with no MathML. */
const SUPER = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³',
  4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

export function superscript(n) {
  return String(n).split('').map((c) => SUPER[c] ?? c).join('');
}

export function powerText(base, exponent) {
  return `${base}${superscript(exponent)}`;
}
