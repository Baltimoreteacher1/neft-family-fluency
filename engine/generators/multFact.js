// Multiplication facts: a x b, where one factor comes from the week's target
// set and the other from the pool. `commute` decides whether the target factor
// can appear on either side -- children who only ever see "7 x _" do not
// recognise "_ x 7".
//
// Pure: same rng state + same params => same item.

/**
 * @param {ReturnType<import('../rng.js').createRng>} rng
 * @param {{factors:number[], others:number[], commute?:boolean}} params
 * @param {{strategyTag?:string}} [meta]
 */
export function multFact(rng, params, meta = {}) {
  const target = rng.pick(params.factors);
  const other = rng.pick(params.others);
  const flip = params.commute !== false && rng.chance(0.5);
  const a = flip ? other : target;
  const b = flip ? target : other;
  const answer = a * b;

  return {
    // factId is order-independent so 7x8 and 8x7 track as one fact to practise.
    id: `mult:${Math.min(a, b)}x${Math.max(a, b)}`,
    kind: 'fact',
    op: 'mult',
    a,
    b,
    prompt: `${a} × ${b}`,
    answer,
    strategyTag: meta.strategyTag || null,
    distractors: distractorsFor(a, b, answer),
  };
}

/**
 * Wrong answers a child plausibly produces: off by one group, the sum instead
 * of the product, and the neighbouring fact. Never a random number -- a
 * distractor that nobody would choose teaches nothing.
 */
function distractorsFor(a, b, answer) {
  const candidates = [answer - a, answer + a, answer - b, answer + b, a + b];
  const seen = new Set([answer]);
  const out = [];
  for (const c of candidates) {
    if (c > 0 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.slice(0, 3);
}

export const meta = { kind: 'fact' };
export default multFact;
