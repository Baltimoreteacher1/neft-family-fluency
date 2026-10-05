// The drill. This is the app.
//
// Prompt, answer, next. No timer, no lives, no streak to lose. The only
// apparatus is a count of how far through you are and the score at the end.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill } from '../engine/curriculum.js';
import { buildSession, dueFacts, updateFacts } from '../engine/session.js';
import { checkAnswer, RESULT } from '../engine/answer.js';
import {
  loadProgress, saveProgress, skillRecord, logActivity, addAttempts, today,
} from '../engine/model.js';
import { keypad, answerBox } from './keypad.js';

const LENGTH = 10;

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skill = await findSkill(grade, match[2]);
  if (!skill) throw new Error(`No skill ${match[2]}`);

  const progress = loadProgress(app.profile.id);
  const record = skillRecord(progress, skill.id);
  const stage = record.mastered ? skill.stages.length - 1 : record.stage;

  const set = buildSession(skill, {
    stage,
    count: LENGTH,
    // Seeded by the minute so "again" gives a fresh set but a reload does not.
    seed: `${app.profile.id}|${skill.id}|${today()}|${Math.floor(Date.now() / 60000)}`,
    due: dueFacts(record),
    review: true,
  });

  run(container, app, grade, skill, stage, set);
}

function run(container, app, grade, skill, stage, set) {
  const attempts = [];
  let index = 0;
  let settled = false;
  let shownAt = 0;

  const counter = el('span', { class: 'drill__count' });
  const bar = el('div', { class: 'drill__fill' });
  const promptEl = el('p', { class: 'prompt' });
  const feedback = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });

  const item = () => set.items[index];

  const input = answerBox({
    onSubmit: () => judge(),
    allowRemainder: set.items.some((i) => i.answerType === 'remainder'),
  });
  const pad = keypad({
    allowRemainder: set.items.some((i) => i.answerType === 'remainder'),
    onInput: (v) => {
      input.value = v;
      input.removeAttribute('data-state');
    },
    onSubmit: () => judge(),
  });
  input.addEventListener('input', () => pad.set(input.value));

  function paint() {
    settled = false;
    shownAt = performance.now();
    counter.textContent = `${index + 1} / ${set.items.length}`;
    bar.style.width = `${(index / set.items.length) * 100}%`;
    promptEl.textContent = item().prompt;
    feedback.textContent = '';
    feedback.removeAttribute('data-state');
    input.value = '';
    pad.clear();
    input.removeAttribute('data-state');
    input.focus({ preventScroll: true });
  }

  function judge() {
    if (settled) return;
    const typed = (pad.value || input.value).trim();
    if (!typed) return;

    const verdict = checkAnswer(item(), typed);

    if (verdict === RESULT.UNSIMPLIFIED) {
      // Right quantity, wrong form. Not a mistake -- a nudge.
      input.dataset.state = 'no';
      feedback.textContent = t('drill.simplify');
      feedback.dataset.state = 'no';
      announce(t('drill.simplify'));
      return;
    }

    const correct = verdict === RESULT.CORRECT;
    settled = true;
    attempts.push({
      itemId: item().id,
      skillId: skill.id,
      correct,
      ms: Math.round(performance.now() - shownAt),
    });

    input.dataset.state = correct ? 'yes' : 'no';
    feedback.textContent = correct
      ? t('drill.yes')
      : t('drill.answerWas', { answer: answerText(item()) });
    feedback.dataset.state = correct ? 'yes' : 'no';
    announce(feedback.textContent);

    index++;
    if (index >= set.items.length) {
      setTimeout(() => finish(), correct ? 400 : 1100);
      return;
    }
    // A wrong answer gets longer to be read than a right one.
    const pause = document.documentElement.dataset.motion === 'reduced'
      ? 0
      : correct ? 400 : 1100;
    setTimeout(paint, pause);
  }

  function finish() {
    const correct = attempts.filter((a) => a.correct).length;

    logActivity(app.profile.id, skill.id, 'practice', { stage });
    addAttempts(app.profile.id, skill.id, attempts);
    const p = loadProgress(app.profile.id);
    updateFacts(skillRecord(p, skill.id), attempts);
    saveProgress(app.profile.id, p);

    mount(container,
      el('div', { class: 'done' },
        el('p', { class: 'done__score', text: `${correct}/${attempts.length}` }),
        el('p', { class: 'done__skill', text: skill.title[app.lang] || skill.title.en }),
        el('div', { class: 'row row--center' },
          el('button', {
            class: 'btn btn--big',
            onClick: () => render(container, app, [null, String(grade), skill.id]),
          }, t('drill.again')),
          el('button', {
            class: 'btn btn--ghost',
            onClick: () => app.go(`g/${grade}`),
          }, t('drill.pickAnother')),
        ),
      ),
    );
  }

  mount(container,
    el('div', { class: 'drill__bar' }, bar),
    el('div', { class: 'drill__head' },
      counter,
      el('button', {
        class: 'btn btn--ghost btn--small',
        onClick: () => app.go(`g/${grade}`),
      }, t('drill.stop')),
    ),
    promptEl,
    input,
    feedback,
    pad.node,
  );
  paint();
}

/** What to show when a child gets one wrong. */
function answerText(item) {
  if (item.answerType === 'fraction') {
    return item.answer.d === 1 ? String(item.answer.n) : `${item.answer.n}/${item.answer.d}`;
  }
  return String(item.answer);
}
