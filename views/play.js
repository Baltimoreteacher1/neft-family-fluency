// Wednesday: the game.
//
// The game is the same skill as the rest of the week -- the fun is in the
// framing, not in different maths. It races the child against their own best
// score, never against another child and never against a clock they did not
// choose: a countdown is the fastest way to make a struggling child stop
// opening the app.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { buildSet } from '../engine/setBuilder.js';
import { storage, KEY } from '../engine/storage.js';
import { recordSession, today } from '../engine/progress.js';
import { keypad, answerBox } from './keypad.js';

export async function render(container, app, match) {
  const weekNumber = Number(match[1]);
  const week = app.weekByNumber(weekNumber);
  const gameId = week.game?.id || 'raceTrack';
  const best = storage.get(KEY.bestScore(app.profile.id, gameId), 0);

  mount(container,
    el('div', { class: 'card' },
      el('h2', { text: t('week.play') }),
      el('p', { text: t('week.playSub') }),
      best ? el('p', { class: 'result__figure', text: String(best) }) : null,
      best ? el('p', { class: 'muted', text: t('week.playSub') }) : null,
      el('button', {
        class: 'btn btn--block',
        onClick: () => play(container, app, weekNumber, week, gameId, best),
      }, t('check.start')),
      el('button', {
        class: 'btn btn--ghost btn--block',
        style: 'margin-top:8px',
        onClick: () => app.go(`week/${weekNumber}`),
      }, t('app.back')),
    ),
  );
}

function play(container, app, weekNumber, week, gameId, best) {
  // A long set the child will not finish: the game ends when they choose, and
  // the score is how far they got. Nothing is "failed" by running out.
  const set = buildSet(app.curriculum, {
    week: weekNumber,
    kind: 'practice',
    itemCount: 60,
    seed: `${app.profile.id}|${weekNumber}|play|${Date.now()}`,
  });

  const attempts = [];
  let index = 0;
  let streak = 0;

  const scoreLabel = el('span', { class: 'result__figure', style: 'font-size:1.6rem' });
  const bestLabel = el('span', { class: 'muted' });
  const promptEl = el('p', { class: 'prompt' });
  const feedback = el('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
  const track = el('div', { class: 'qbar__fill', style: 'width:0%' });

  const input = answerBox({ onSubmit: () => judge() });
  const pad = keypad({
    onInput: (v) => { input.value = v; input.removeAttribute('data-state'); },
    onSubmit: () => judge(),
  });
  input.addEventListener('input', () => pad.set(input.value.replace(/[^0-9]/g, '')));

  function item() { return set.items[index]; }

  function paint() {
    promptEl.textContent = item().prompt;
    scoreLabel.textContent = String(streak);
    bestLabel.textContent = `${t('week.playSub')} · ${Math.max(best, streak)}`;
    track.style.width = `${Math.min(100, (streak / Math.max(10, best + 1)) * 100)}%`;
    input.value = '';
    pad.clear();
    input.dataset.state = '';
    input.removeAttribute('data-state');
  }

  function judge() {
    const value = (pad.value || input.value).trim();
    if (!value) return;
    const correct = String(item().answer) === value;
    attempts.push({ itemId: item().id, skillId: item().skillId, correct, ms: 0 });

    if (correct) {
      streak++;
      input.dataset.state = 'yes';
      feedback.textContent = t('practice.correct');
      feedback.dataset.state = 'yes';
      announce(t('a11y.correctAnnounce'));
      index++;
      if (index >= set.items.length) return finish();
      setTimeout(paint, document.documentElement.dataset.motion === 'reduced' ? 0 : 300);
      return;
    }

    // A wrong answer ends the run but keeps the score. The next run starts
    // fresh -- there is no penalty that follows the child around.
    input.dataset.state = 'no';
    feedback.textContent = t('practice.answerWas', { answer: item().answer });
    feedback.dataset.state = 'no';
    announce(t('a11y.incorrectAnnounce'));
    setTimeout(finish, 900);
  }

  function finish() {
    if (attempts.length) recordSession(app.profile.id, weekNumber, { attempts, day: today() });
    const newBest = Math.max(best, streak);
    storage.set(KEY.bestScore(app.profile.id, week.game?.id || 'raceTrack'), newBest);

    mount(container,
      el('div', { class: 'card result' },
        el('h2', { text: t('practice.summaryTitle') }),
        el('p', { class: 'result__figure', text: String(streak) }),
        streak >= newBest && streak > 0
          ? el('div', { class: 'badge badge--pop', 'aria-hidden': 'true', text: '⭐' })
          : null,
        el('p', { class: 'muted', text: `${t('week.playSub')}: ${newBest}` }),
        el('div', { class: 'row', style: 'justify-content:center' },
          el('button', {
            class: 'btn',
            onClick: () => play(container, app, weekNumber, week, week.game?.id || 'raceTrack', newBest),
          }, t('practice.summaryAgain')),
          el('button', {
            class: 'btn btn--ghost',
            onClick: () => app.go(`week/${weekNumber}`),
          }, t('practice.summaryBack')),
        ),
      ),
    );
  }

  mount(container,
    el('div', { class: 'qbar' },
      scoreLabel,
      el('div', { class: 'qbar__track' }, track),
      el('button', { class: 'btn btn--ghost btn--small', onClick: finish }, t('practice.quit')),
    ),
    bestLabel,
    promptEl,
    input,
    feedback,
    pad.node,
  );
  paint();
}
