// Learn: the strategy, shown rather than described.
//
// Built from CSS and SVG, never a video file: a video is megabytes a family
// pays for, will not play inline on some Android browsers, and cannot be
// translated without a second recording.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill } from '../engine/curriculum.js';
import { logActivity } from '../engine/model.js';
import { explainer } from './explainers.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const skill = await findSkill(grade, skillId);
  if (!skill) throw new Error(`No skill ${skillId}`);

  logActivity(app.profile.id, skillId, 'learn');

  mount(container,
    el('div', { class: 'strategy' },
      el('p', { class: 'strategy__label', text: t('skill.strategy') }),
      el('p', { class: 'strategy__text', text: skill.strategy[app.lang] || skill.strategy.en }),
    ),
    el('div', { class: 'card' }, explainer(skill.strategyTag)),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn',
        onClick: () => app.go(`g/${grade}/${skillId}/practice`),
      }, t('learn.tryIt')),
      el('button', {
        class: 'btn btn--ghost',
        onClick: () => app.go(`g/${grade}/${skillId}`),
      }, t('app.back')),
    ),
  );
}
