// The Check: the skill's current stage, no hints, no second tries.
// Passing moves up a stage; passing the top stage masters the skill.

import { el, mount, announce } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill, loadIndex } from '../engine/curriculum.js';
import { buildSession, updateFacts } from '../engine/session.js';
import {
  loadProgress, saveProgress, skillRecord, recordCheck, addAttempts,
} from '../engine/model.js';
import { runSet } from './runner.js';
import { sendCard } from './sendToTeacher.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const [skill, index] = await Promise.all([findSkill(grade, skillId), loadIndex()]);
  if (!skill) throw new Error(`No skill ${skillId}`);

  const record = skillRecord(loadProgress(app.profile.id), skillId);
  const stage = record.mastered ? skill.stages.length - 1 : record.stage;

  mount(container,
    el('div', { class: 'card' },
      el('h2', { text: t('activity.check') }),
      el('p', { text: t('check.intro', { n: skill.checkLength || index.defaults.check.items }) }),
      el('button', {
        class: 'btn btn--block',
        onClick: () => start(container, app, grade, skill, stage, index),
      }, t('check.start')),
    ),
  );
}

function start(container, app, grade, skill, stage, index) {
  const set = buildSession(skill, {
    stage,
    count: skill.checkLength || index.defaults.check.items,
    // Not seeded by day: retaking a Check should be the same assessment, not
    // a search for an easier draw.
    seed: `${app.profile.id}|${skill.id}|check|${stage}`,
    review: false,
  });

  runSet(container, app, {
    set,
    skill,
    allowHints: false,
    onFinish: (attempts) => {
      const correct = attempts.filter((a) => a.correct).length;
      const accuracy = attempts.length ? correct / attempts.length : 0;
      const passed = accuracy >= index.defaults.check.passAccuracy;

      const times = attempts.filter((a) => a.correct).map((a) => a.ms).sort((x, y) => x - y);
      const medianMs = times.length ? times[Math.floor(times.length / 2)] : null;

      addAttempts(app.profile.id, skill.id, attempts);
      const p = loadProgress(app.profile.id);
      updateFacts(skillRecord(p, skill.id), attempts);
      saveProgress(app.profile.id, p);

      const before = skillRecord(loadProgress(app.profile.id), skill.id);
      const wasMastered = before.mastered;
      const record = recordCheck(
        app.profile.id, skill.id,
        { accuracy, total: attempts.length, correct, medianMs, passed },
        skill.stages.length,
      );

      result(container, app, grade, skill, {
        accuracy, correct, total: attempts.length, medianMs, passed,
        stage, record, newlyMastered: record.mastered && !wasMastered,
      });
    },
  });
}

function result(container, app, grade, skill, r) {
  const pct = Math.round(r.accuracy * 100);
  const seconds = r.medianMs == null ? null : (r.medianMs / 1000).toFixed(1);

  announce(r.passed ? t('check.passed') : t('check.notYet'));

  mount(container,
    el('div', { class: 'card result' },
      r.newlyMastered
        ? el('div', { class: 'badge badge--pop', 'aria-hidden': 'true', text: '⭐' })
        : null,
      el('h2', { text: r.newlyMastered ? t('check.mastered') : r.passed ? t('check.passed') : t('check.notYet') }),
      el('p', { class: 'result__figure', text: `${r.correct}/${r.total}` }),
      el('p', { class: 'muted', text: t('check.accuracy', { pct }) }),
      // Speed is information, never a pass condition.
      seconds && app.settings.timer
        ? el('p', { class: 'muted', text: t('check.medianTime', { seconds }) })
        : null,
      el('p', { text: r.passed ? t('check.movedUp') : t('check.keepGoing') }),
    ),

    // The card the kid can hold up in class: nothing is transmitted.
    showTeacherCard(app, skill, r),

    // And the optional send, which is the only thing that ever leaves the phone.
    sendCard(app, { grade, skill, result: r }),

    el('button', {
      class: 'btn btn--block',
      onClick: () => app.go(`g/${grade}/${skill.id}`),
    }, t('practice.backToSkill')),
  );
}

function showTeacherCard(app, skill, r) {
  return el('div', { class: 'card teachercard' },
    el('h3', { class: 'flush', text: t('check.showTeacher') }),
    el('p', { class: 'teachercard__skill', text: skill.title[app.lang] || skill.title.en }),
    el('p', { class: 'teachercard__score', text: `${r.correct}/${r.total}` }),
    el('p', { class: 'muted', text: new Date().toLocaleDateString() }),
    el('p', { class: 'muted', text: t('check.showTeacherHint') }),
  );
}
