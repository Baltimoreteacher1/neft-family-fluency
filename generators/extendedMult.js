// Extended facts: 40 x 7, 600 x 3. The point of the week is that the basic fact
// does the work and the zeros follow a place-value pattern, so every item
// carries its basic fact along for the hint.

export function extendedMult(rng, params, meta = {}) {
  const base = rng.pick(params.factors);
  const other = rng.pick(params.others);
  const scale = rng.pick(params.scales);
  const scaled = base * scale;
  const answer = scaled * other;

  return {
    id: `xmult:${scaled}x${other}`,
    kind: 'fact',
    op: 'mult',
    a: scaled,
    b: other,
    prompt: `${scaled} × ${other}`,
    basicFact: { a: base, b: other, answer: base * other, scale },
    answer,
    answerType: "integer",
    accept: [String(answer)],
    strategyTag: meta.strategyTag || null,
    // The classic error is the wrong number of zeros, so that is the distractor.
    distractors: [base * other, (base * other) * scale * 10, answer + scale].filter(
      (d) => d > 0 && d !== answer,
    ).slice(0, 3),
  };
}

export const meta = { kind: 'fact' };
export default extendedMult;
