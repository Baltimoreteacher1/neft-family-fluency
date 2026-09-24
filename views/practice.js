// Practice: a short mixed set from the current stage, with the hint ladder.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill } from '../engine/curriculum.js';
import { loadIndex } from '../engine/curriculum.js';
import { buildSession, dueFacts, updateFacts } from '../engine/session.js';
import {
  loadProgress, saveProgress, skillRecord, logActivity, addAttempts, today,
} from '../engine/model.js';
import { runSet } from './runner.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const [skill, index] = await Promise.all([findSkill(grade, skillId), loadIndex()]);
  if (!skill) throw new Error(`No skill ${skillId}`);

  const progress = loadProgress(app.profile.id);
  const record = skillRecord(progress, skillId);
  const stage = record.mastered ? skill.stages.length - 1 : record.stage;

  // Seeded by day, so a reload mid-set returns the same problems rather than
  // handing the child a fresh set they have to start over.
  const set = buildSession(skill, {
    stage,
    count: index.defaults.practice.items,
    seed: `${app.profile.id}|${skillId}|practice|${today()}`,
    due: dueFacts(record),
    review: true,
  });

  runSet(container, app, {
    set,
    skill,
    allowHints: true,
    onFinish: (attempts) => {
      if (attempts.length) {
        logActivity(app.profile.id, skillId, 'practice', { stage });
        addAttempts(app.profile.id, skillId, attempts);
        const p = loadProgress(app.profile.id);
        updateFacts(skillRecord(p, skillId), attempts);
        saveProgress(app.profile.id, p);
      }
      summary(container, app, grade, skillId, attempts);
    },
  });
}

function summary(container, app, grade, skillId, attempts) {
  const correct = attempts.filter((a) => a.correct).length;
  mount(container,
    el('div', { class: 'card result' },
      el('h2', { text: t('practice.done') }),
      el('p', { class: 'result__figure', text: `${correct}/${attempts.length}` }),
      el('div', { class: 'row row--center' },
        el('button', { class: 'btn', onClick: () => app.go(`g/${grade}/${skillId}`) },
          t('practice.backToSkill')),
        el('button', {
          class: 'btn btn--ghost',
          onClick: () => render(container, app, [null, String(grade), skillId]),
        }, t('practice.again')),
      ),
    ),
  );
}
