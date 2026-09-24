// The on-screen keypad.
//
// Built rather than relying on the OS keyboard because on a 320px Android
// phone the system numeric keyboard covers the question, and its layout moves
// between vendors. A fixed grid means the 7 is always in the same place, which
// is what lets a child answer without looking down.
//
// The hidden input still carries inputmode="numeric" so a physical or
// accessibility keyboard works too -- the keypad is an addition, not a
// replacement.

import { el } from '../engine/dom.js';
import { t } from '../engine/i18n.js';

/**
 * @param {{onInput:(value:string)=>void, onSubmit:()=>void,
 *          allowRemainder?:boolean}} opts
 */
export function keypad({ onInput, onSubmit, allowRemainder = false }) {
  let value = '';

  const push = (ch) => {
    if (value.length >= 8) return;
    // One "R" only, never leading.
    if (ch === 'R' && (value.includes('R') || value === '')) return;
    value += ch;
    onInput(value);
  };

  const keys = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    allowRemainder ? 'R' : 'clear',
    '0',
    'del',
  ];

  const buttons = keys.map((k) => {
    if (k === 'del') {
      return el('button', {
        type: 'button', dataset: { key: 'del' },
        'aria-label': t('practice.keypadDelete'),
        onClick: () => { value = value.slice(0, -1); onInput(value); },
      }, '⌫');
    }
    if (k === 'clear') {
      return el('button', {
        type: 'button', dataset: { key: 'clear' },
        'aria-label': t('practice.keypadClear'),
        onClick: () => { value = ''; onInput(value); },
      }, 'C');
    }
    return el('button', {
      type: 'button', dataset: { key: k },
      onClick: () => push(k),
    }, k);
  });

  const grid = el('div', {
    class: 'keypad', role: 'group', 'aria-label': t('a11y.keypad'),
  },
    buttons,
    el('button', {
      type: 'button', dataset: { key: 'check' },
      style: 'grid-column: 1 / -1',
      onClick: () => onSubmit(),
    }, t('practice.check')),
  );

  return {
    node: grid,
    get value() { return value; },
    set(v) { value = String(v); onInput(value); },
    clear() { value = ''; onInput(value); },
  };
}

/**
 * The visible answer box. It is a real input so a hardware keyboard, a
 * switch device and a screen reader all work; the keypad writes into it.
 */
export function answerBox({ onSubmit, allowRemainder = false }) {
  const input = el('input', {
    type: 'text',
    class: 'answer',
    inputmode: 'numeric',
    // Remainders need the letter R, so the pattern widens rather than the
    // input becoming type="number" (which also strips leading zeros).
    pattern: allowRemainder ? '[0-9Rr ]*' : '[0-9]*',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': t('practice.yourAnswer'),
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  });

  return input;
}
