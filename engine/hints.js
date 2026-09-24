// Three levels of hint, in the order a teacher would give them.
//
// Level 1 names the concept, level 2 walks the procedure, level 3 shows a
// worked example -- of a DIFFERENT problem. None of them states the answer to
// the problem on screen. A hint that answers the question is not a hint; it is
// the answer button, and we already have one of those, deliberately placed
// after the third hint.

/**
 * @param {object} item a generated item
 * @param {string} strategyTag the week's strategy id
 * @param {(key:string, vars?:object)=>string} t
 * @returns {{label:string, text:string}[]}
 */
export function hintsFor(item, strategyTag) {
  if (item.kind === 'procedure') return procedureHints(item);
  if (item.op === 'div') return divisionHints(item, strategyTag);
  return multiplicationHints(item, strategyTag);
}

function multiplicationHints(item, tag) {
  const { a, b } = item;
  // Work with the target factor, whichever side it landed on.
  const [target, other] = pickTarget(a, b, tag);

  switch (tag) {
    case 'skip-count-double':
      return [
        `${target} means groups of ${target}. Count by ${target}s.`,
        `Count ${other} times: ${skipCount(target, Math.min(other, 5))}${other > 5 ? '…' : ''}`,
        `Example: 5 × 4. Count by 5s four times — 5, 10, 15, 20. So 5 × 4 = 20.`,
      ];
    case 'double-double':
      return [
        `× 4 is double, then double again. × 8 is double three times.`,
        `Start with ${other}. Double it, then double that.`,
        `Example: 4 × 7. Double 7 is 14. Double 14 is 28. So 4 × 7 = 28.`,
      ];
    case 'three-then-double':
      return [
        `× 6 is × 3, then double.`,
        `First find 3 × ${other}. Then double your answer.`,
        `Example: 6 × 8. First 3 × 8 = 24. Double 24 is 48. So 6 × 8 = 48.`,
      ];
    case 'ten-minus-one-break-apart':
      return target === 9
        ? [
            `× 9 is ten groups minus one group.`,
            `Find 10 × ${other}, then take away one ${other}.`,
            `Example: 9 × 6. Ten sixes is 60. Take away one 6: 60 − 6 = 54.`,
          ]
        : [
            `Break 7 apart into 5 + 2.`,
            `Find 5 × ${other} and 2 × ${other}, then add them.`,
            `Example: 7 × 8. Five eights is 40, two eights is 16. 40 + 16 = 56.`,
          ];
    case 'place-value-pattern': {
      const bf = item.basicFact;
      return [
        `Use the basic fact first, then look at the zeros.`,
        bf
          ? `Start with ${bf.a} × ${bf.b}. Then multiply by ${bf.scale}.`
          : `Start with the basic fact, then scale it.`,
        `Example: 30 × 8. Basic fact 3 × 8 = 24. Then 24 × 10 = 240.`,
      ];
    }
    default:
      return [
        `${a} groups of ${b}.`,
        `Break one factor into easier parts and add the pieces.`,
        `Example: 6 × 7 = (5 × 7) + (1 × 7) = 35 + 7 = 42.`,
      ];
  }
}

function divisionHints(item, tag) {
  const { a: dividend, b: divisor } = item;

  if (tag === 'place-value-pattern') {
    const bf = item.basicFact;
    return [
      `Use the basic fact, then the place-value pattern.`,
      bf
        ? `Start with ${bf.dividend} ÷ ${bf.divisor}. Then scale up by ${bf.scale}.`
        : `Start with the basic fact, then scale.`,
      `Example: 3600 ÷ 9. Basic fact 36 ÷ 9 = 4. Then 400.`,
    ];
  }

  return [
    `Division asks: how many groups?`,
    `Think of it as a missing factor: what times ${divisor} is ${dividend}?`,
    `Example: 42 ÷ 6. Ask "what times 6 is 42?" Six sevens is 42, so the answer is 7.`,
  ];
}

function procedureHints(item) {
  const { b: divisor, estimate } = item;
  return [
    `Work one place at a time, left to right.`,
    `Estimate first: ${divisor} is about ${estimate.roundedDivisor}, so the answer is near ${estimate.about}.`,
    `Example: 372 ÷ 4. 4 does not fit into 3, so start with 37. 4 × 9 = 36, write 9, ` +
      `37 − 36 = 1. Bring down the 2 to make 12. 4 × 3 = 12, write 3. Answer: 93.`,
  ];
}

function pickTarget(a, b, tag) {
  const targets = {
    'skip-count-double': [2, 5, 10],
    'double-double': [4, 8],
    'three-then-double': [3, 6],
    'ten-minus-one-break-apart': [9, 7],
  }[tag];
  if (!targets) return [a, b];
  if (targets.includes(b)) return [b, a];
  return [a, b];
}

function skipCount(step, times) {
  const out = [];
  for (let i = 1; i <= times; i++) out.push(step * i);
  return out.join(', ');
}
