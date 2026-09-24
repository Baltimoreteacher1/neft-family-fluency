// Tuesday/Thursday practice: a spiral-mixed set with the full hint ladder.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { buildSet } from '../engine/setBuilder.js';
import { recordSession, missedFor, today } from '../engine/progress.js';
import { runSet } from './runner.js';

export async function render(container, app, match) {
  const weekNumber = Number(match[1]);
  const week = app.weekByNumber(weekNumber);

  // The seed includes the date, so each day is a fresh set, but a reload on the
  // same day gives the same questions back.
  const seed = `${app.profile.id}|${weekNumber}|practice|${today()}`;

  const set = buildSet(app.curriculum, {
    week: weekNumber,
    kind: 'practice',
    seed,
    missed: missedFor(app.profile.id, Math.max(1, weekNumber - 1)),
  });

  runSet(container, app, {
    set,
    week,
    allowHints: true,
    onFinish: (attempts) => {
      if (attempts.length) recordSession(app.profile.id, weekNumber, { attempts });
      showSummary(container, app, weekNumber, attempts);
    },
  });
}

function showSummary(container, app, weekNumber, attempts) {
  const correct = attempts.filter((a) => a.correct).length;

  mount(container,
    el('div', { class: 'card result' },
      el('h2', { text: t('practice.summaryTitle') }),
      el('p', { class: 'result__figure', text: `${correct}/${attempts.length}` }),
      el('p', { class: 'muted', text: t('practice.summaryLine', { correct, total: attempts.length }) }),
      el('div', { class: 'row', style: 'justify-content:center' },
        el('button', { class: 'btn', onClick: () => app.go(`week/${weekNumber}`) },
          t('practice.summaryBack')),
        el('button', {
          class: 'btn btn--ghost',
          onClick: () => render(container, app, [null, String(weekNumber)]),
        }, t('practice.summaryAgain')),
      ),
    ),
  );
}
