// The question runner: shared by Practice, Play and the Friday Check.
//
// It owns the loop (show item -> take an answer -> judge it -> move on), the
// attempt log, and the hint ladder. The three callers differ only in their
// options, which is why there is one runner and not three near-copies.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { hintsFor } from '../engine/hints.js';
import { keypad, answerBox } from './keypad.js';
import { renderProcedure } from './procedure.js';

/**
 * @param {HTMLElement} container
 * @param {object} app
 * @param {{set:object, skill:object, allowHints?:boolean, showTimer?:boolean,
 *          onFinish:(attempts:object[])=>void, title?:string}} opts
 */
export function runSet(container, app, opts) {
  const { set, skill } = opts;
  const allowHints = opts.allowHints !== false;
  const attempts = [];
  let index = 0;
  let shownAt = 0;
  let hintLevel = 0;
  let wrongThisItem = 0;
  // Set the moment an item is judged final, and cleared when the next one is
  // painted. Without it a double-tap on Check -- or an impatient child on a
  // slow phone -- logs the same question twice and skews the whole week.
  let settled = false;
  // The set can only end once, whether by finishing or by quitting.
  let finished = false;

  const progressFill = el('div', { class: 'qbar__fill' });
  const progressLabel = el('span', {});
  const feedback = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
  const body = el('div', {});
  const hintBox = el('div', { class: 'hints' });

  function item() {
    return set.items[index];
  }

  function paint() {
    const total = set.items.length;
    progressLabel.textContent = t('practice.question', { n: index + 1, total });
    progressFill.style.width = `${(index / total) * 100}%`;
    feedback.textContent = '';
    feedback.removeAttribute('data-state');
    mount(hintBox);
    hintLevel = 0;
    wrongThisItem = 0;
    settled = false;
    shownAt = performance.now();

    const procedure = item().kind === 'procedure';
    if (procedure) {
      mount(body,
        renderProcedure(item(), {
          onComplete: (ok) => finishItem(ok),
          onStepFeedback: (msg, good) => {
            feedback.textContent = msg;
            feedback.dataset.state = good ? 'yes' : 'no';
            announce(msg);
          },
        }),
        // Procedure mode has no answer box to hang the feedback off, so the
        // shared element is mounted here. Leaving it out left every "check
        // that step again" writing to a node that was not on the page.
        feedback,
      );
    } else {
      mount(body, factQuestion());
    }

    mount(container, header(), body, allowHints ? hintControls() : null, hintBox);
  }

  function factQuestion() {
    // `feedback` is shared with procedure mode, so it is placed, not created.
    const input = answerBox({ onSubmit: () => judge(input.value) });
    const pad = keypad({
      onInput: (v) => {
        input.value = v;
        input.removeAttribute('data-state');
      },
      onSubmit: () => judge(pad.value || input.value),
    });
    // Typing directly keeps the keypad in step.
    input.addEventListener('input', () => pad.set(input.value.replace(/[^0-9]/g, '')));

    return el('div', {},
      el('p', { class: 'prompt', text: item().prompt }),
      input,
      feedback,
      pad.node,
    );
  }

  function judge(raw) {
    if (settled) return;
    const value = String(raw ?? '').trim();
    if (!value) return;
    const correct = String(item().answer) === value;
    const input = body.querySelector('.answer');

    if (correct) {
      if (input) input.dataset.state = 'yes';
      feedback.textContent = t('feedback.yes');
      feedback.dataset.state = 'yes';
      announce(t('a11y.correct'));
      finishItem(true);
      return;
    }

    wrongThisItem++;
    if (input) input.dataset.state = 'no';
    feedback.textContent = t('feedback.notYet');
    feedback.dataset.state = 'no';
    announce(t('a11y.incorrect'));

    // In the Friday Check there is no second try -- it is a measurement.
    if (!allowHints) {
      finishItem(false);
      return;
    }
    // After two misses, offer the next hint rather than making them ask.
    if (wrongThisItem >= 2 && hintLevel < 3) showHint(hintLevel + 1);
  }

  function finishItem(correct) {
    if (settled) return;
    settled = true;
    attempts.push({
      itemId: item().id,
      skillId: item().skillId,
      correct,
      // A child who needed hints answered, but not fluently; the time still
      // reflects what happened, and the mastery rule only reads correct times.
      ms: Math.round(performance.now() - shownAt),
      hints: hintLevel,
    });

    index++;
    if (index >= set.items.length) {
      if (finished) return;
      finished = true;
      opts.onFinish(attempts);
      return;
    }
    // A beat to read the feedback, unless motion is reduced.
    const pause = document.documentElement.dataset.motion === 'reduced' ? 0 : 450;
    setTimeout(paint, pause);
  }

  function hintControls() {
    const buttons = [1, 2, 3].map((level) =>
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: () => showHint(level),
      }, t(`practice.hint${level}`)),
    );

    return el('div', { class: 'row', style: 'margin-top:12px' },
      buttons,
      // Deliberately after all three hints: a child who wants the answer can
      // have it, but only past the point where the strategy was offered.
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: () => {
          const answer = String(item().answer);
          feedback.textContent = t('practice.answerWas', { answer });
          feedback.dataset.state = 'no';
          announce(t('practice.answerWas', { answer }));
          const input = body.querySelector('.answer');
          if (input) input.value = answer;
        },
      }, t('practice.showMe')),
    );
  }

  function showHint(level) {
    const texts = hintsFor(item(), item().strategyTag || skill.strategyTag);
    hintLevel = Math.max(hintLevel, level);
    mount(hintBox,
      texts.slice(0, level).map((text, i) =>
        el('div', { class: 'hint' },
          el('p', { class: 'hint__label', style: 'margin:0', text: t(`practice.hint${i + 1}`) }),
          el('p', { style: 'margin:2px 0 0', text }),
        ),
      ),
    );
    announce(texts[level - 1]);
  }

  function header() {
    return el('div', { class: 'qbar' },
      progressLabel,
      el('div', { class: 'qbar__track' }, progressFill),
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: () => {
          if (finished) return;
          finished = true;
          opts.onFinish(attempts);
        },
      }, t('practice.quit')),
    );
  }

  paint();
}
