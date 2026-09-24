// The strategy explainers, one per strategy tag.
//
// Split out of the Learn view so a new strategy is a function here plus a tag
// in the curriculum, with no view code to touch.

import { el } from '../engine/dom.js';

/** One explainer per strategy. Each builds a small worked picture. */
export function explainer(strategyId) {
  switch (strategyId) {
    case 'skip-count-double':
      return build(
        'Count by 5s to find 5 × 4',
        dotRows(4, 5),
        ['5', '10', '15', '20'],
        'Four rows of five. Count the rows: 5, 10, 15, 20. So 5 × 4 = 20.',
      );

    case 'double-double':
      return build(
        'Double, then double again: 4 × 7',
        chain(['7', '14', '28'], ['double', 'double']),
        [],
        'Four is two twos. Double 7 to get 14, then double 14 to get 28.',
      );

    case 'three-then-double':
      return build(
        'Times 3, then double: 6 × 8',
        chain(['8', '24', '48'], ['× 3', 'double']),
        [],
        'Six is three doubled. Find 3 × 8 = 24, then double it to get 48.',
      );

    case 'ten-minus-one-break-apart':
      return build(
        'Ten groups minus one group: 9 × 6',
        chain(['10 × 6 = 60', '60 − 6', '54'], ['take one 6 away', '']),
        [],
        'Nine sixes is one six less than ten sixes. And 7 × 8 can be broken up: ' +
          '5 eights is 40, 2 eights is 16, and 40 + 16 = 56.',
      );

    case 'missing-factor':
      return build(
        'Division asks for the missing factor: 42 ÷ 6',
        chain(['? × 6 = 42', '7 × 6 = 42', '42 ÷ 6 = 7'], ['', '']),
        [],
        'Every division fact is a multiplication fact with a piece missing. ' +
          'If you know 7 × 6, you already know 42 ÷ 6.',
      );

    case 'place-value-pattern':
      return build(
        'The basic fact, then the zeros: 40 × 7',
        chain(['4 × 7 = 28', '× 10', '280'], ['', '']),
        [],
        'Forty is four tens. Four sevens is 28, so forty sevens is 28 tens — 280. ' +
          'The same works backwards: 3600 ÷ 9 starts from 36 ÷ 9 = 4.',
      );

    case 'partial-quotients':
      return build(
        'Take away chunks you know: 372 ÷ 4',
        chain(['372', '− 360  (90 fours)', '12  →  3 fours'], ['', '']),
        [],
        'Pull out easy chunks instead of guessing one digit at a time. ' +
          'Ninety fours is 360, leaving 12, which is three more fours. 90 + 3 = 93.',
      );

    case 'estimate-then-divide':
      return build(
        'Estimate first: 851 ÷ 23',
        chain(['23 is about 20', '851 ÷ 20 ≈ 40', 'so the answer is near 40'], ['', '']),
        [],
        'Rounding the divisor tells you roughly how big the answer is before ' +
          'you start. If your answer comes out near 4 or near 400, you know ' +
          'something went wrong.',
      );

    default:
      return el('p', { text: 'Practice this week’s facts and look for the pattern.' });
  }
}

function build(headline, figure, captions, body) {
  return el('div', {},
    el('h2', { text: headline }),
    figure,
    captions.length
      ? el('p', { class: 'muted', text: captions.join('  →  ') })
      : null,
    el('p', { text: body }),
  );
}

/** A grid of dots, drawn as SVG so it scales and prints. */
function dotRows(rows, perRow) {
  const ns = 'http://www.w3.org/2000/svg';
  const r = 9;
  const gap = 26;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${perRow * gap + 10} ${rows * gap + 10}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${rows} rows of ${perRow}`);
  svg.style.maxWidth = '280px';
  svg.style.display = 'block';
  svg.style.margin = '0 auto 12px';

  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < perRow; i++) {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(i * gap + r + 5));
      c.setAttribute('cy', String(row * gap + r + 5));
      c.setAttribute('r', String(r));
      c.setAttribute('fill', 'currentColor');
      c.style.color = 'var(--accent)';
      // Staggered fade-in; the reduced-motion rules collapse it to nothing.
      c.style.animation = `fadeIn var(--speed) ease-out backwards`;
      c.style.animationDelay = `${(row * perRow + i) * 40}ms`;
      svg.append(c);
    }
  }
  return svg;
}

/** Steps with arrows between them. */
function chain(steps, labels) {
  return el('div', { style: 'display:grid;gap:8px;margin:12px 0' },
    steps.flatMap((step, i) => [
      el('div', {
        style: 'padding:12px;background:var(--accent-soft);border-radius:10px;' +
          'font-family:var(--font-num);font-size:1.15rem;font-weight:700;text-align:center',
        text: step,
      }),
      i < steps.length - 1 && labels[i]
        ? el('div', { class: 'muted', style: 'text-align:center', text: `↓ ${labels[i]}` })
        : i < steps.length - 1
          ? el('div', { class: 'muted', style: 'text-align:center', text: '↓' })
          : null,
    ]),
  );
}
