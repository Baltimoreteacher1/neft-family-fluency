// Play: the same skill, framed as a game against your own best.
//
// Never against another child and never against a clock the kid did not
// choose. A personal best is the only number kept.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill, loadIndex } from '../engine/curriculum.js';
import { buildSession, updateFacts } from '../engine/session.js';
import {
  loadProgress, saveProgress, skillRecord, logActivity, addAttempts,
} from '../engine/model.js';
import { keypad, answerBox } from './keypad.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const [skill, index] = await Promise.all([findSkill(grade, skillId), loadIndex()]);
  if (!skill) throw new Error(`No skill ${skillId}`);

  const record = skillRecord(loadProgress(app.profile.id), skillId);
  const best = record.best || 0;

  mount(container,
    el('div', { class: 'card result' },
      el('h2', { text: t('activity.play') }),
      el('p', { text: t('play.intro') }),
      best
        ? el('div', {},
            el('p', { class: 'result__figure', text: String(best) }),
            el('p', { class: 'muted', text: t('play.yourBest') }))
        : el('p', { class: 'muted', text: t('play.noBestYet') }),
      el('button', {
        class: 'btn btn--block',
        onClick: () => play(container, app, grade, skill, index, best),
      }, t('play.start')),
      el('button', {
        class: 'btn btn--ghost btn--block',
        onClick: () => app.go(`g/${grade}/${skillId}`),
      }, t('app.back')),
    ),
  );
}

function play(container, app, grade, skill, index, best) {
  const record = skillRecord(loadProgress(app.profile.id), skill.id);
  const stage = record.mastered ? skill.stages.length - 1 : record.stage;

  // A long set the child will not finish: the round ends when they choose or
  // miss, and the score is how far they got. Nothing is "failed".
  const set = buildSession(skill, {
    stage,
    count: 60,
    seed: `${app.profile.id}|${skill.id}|play|${Date.now()}`,
    review: false,
  });

  const attempts = [];
  let index2 = 0;
  let streak = 0;

  const score = el('span', { class: 'play__score', text: '0' });
  const bestLabel = el('span', { class: 'muted', text: `${t('play.yourBest')}: ${best}` });
  const promptEl = el('p', { class: 'prompt' });
  const feedback = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });

  const input = answerBox({ onSubmit: () => judge() });
  const pad = keypad({
    onInput: (v) => { input.value = v; input.removeAttribute('data-state'); },
    onSubmit: () => judge(),
  });
  input.addEventListener('input', () => pad.set(input.value.replace(/[^0-9]/g, '')));

  const item = () => set.items[index2];

  function paint() {
    promptEl.textContent = item().prompt;
    score.textContent = String(streak);
    input.value = '';
    pad.clear();
    input.removeAttribute('data-state');
  }

  function judge() {
    const value = (pad.value || input.value).trim();
    if (!value) return;
    const correct = String(item().answer) === value;
    attempts.push({ itemId: item().id, skillId: skill.id, correct, ms: 0 });

    if (correct) {
      streak++;
      input.dataset.state = 'yes';
      feedback.textContent = t('feedback.yes');
      feedback.dataset.state = 'yes';
      announce(t('a11y.correct'));
      index2++;
      if (index2 >= set.items.length) return finish();
      setTimeout(paint, document.documentElement.dataset.motion === 'reduced' ? 0 : 300);
      return;
    }

    input.dataset.state = 'no';
    feedback.textContent = t('play.wasAnswer', { answer: item().answer });
    feedback.dataset.state = 'no';
    announce(t('a11y.incorrect'));
    setTimeout(finish, 900);
  }

  function finish() {
    if (attempts.length) {
      logActivity(app.profile.id, skill.id, 'play', { stage });
      addAttempts(app.profile.id, skill.id, attempts);
      const p = loadProgress(app.profile.id);
      const r = skillRecord(p, skill.id);
      updateFacts(r, attempts);
      r.best = Math.max(r.best || 0, streak);
      saveProgress(app.profile.id, p);
    }
    const newBest = Math.max(best, streak);

    mount(container,
      el('div', { class: 'card result' },
        el('h2', { text: t('play.roundOver') }),
        el('p', { class: 'result__figure', text: String(streak) }),
        streak > best && streak > 0
          ? el('p', { class: 'chip chip--gold', text: t('play.newBest') })
          : el('p', { class: 'muted', text: `${t('play.yourBest')}: ${newBest}` }),
        el('div', { class: 'row row--center' },
          el('button', {
            class: 'btn',
            onClick: () => play(container, app, grade, skill, index, newBest),
          }, t('play.again')),
          el('button', {
            class: 'btn btn--ghost',
            onClick: () => app.go(`g/${grade}/${skill.id}`),
          }, t('practice.backToSkill')),
        ),
      ),
    );
  }

  mount(container,
    el('div', { class: 'qbar' }, score, el('span', { class: 'qbar__spacer' }), bestLabel,
      el('button', { class: 'btn btn--ghost btn--small', onClick: finish }, t('play.stop'))),
    promptEl,
    input,
    feedback,
    pad.node,
  );
  paint();
}
