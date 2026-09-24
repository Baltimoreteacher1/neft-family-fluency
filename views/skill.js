// A skill page: the strategy, the week's dots, and the four activities.
//
// The activity the rhythm suggests next is marked, but none of them is locked.
// A child who wants to Play on Monday can Play on Monday.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill } from '../engine/curriculum.js';
import { loadProgress, skillRecord, daysThisWeek, nextActivity, GOAL_DAYS } from '../engine/model.js';
import { MINUTES } from '../engine/scheduler.js';

const ACTIVITIES = [
  { id: 'learn', icon: '\u{1F4A1}' },
  { id: 'practice', icon: '✏️' },
  { id: 'play', icon: '\u{1F3AE}' },
  { id: 'check', icon: '✅' },
];

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const skill = await findSkill(grade, skillId);
  if (!skill) throw new Error(`No skill ${skillId} in grade ${grade}`);

  const progress = loadProgress(app.profile.id);
  const record = skillRecord(progress, skillId);
  const days = daysThisWeek(record);
  const suggested = nextActivity(record);
  const stages = skill.stages.length;
  const stageIndex = record.mastered ? stages - 1 : record.stage;

  mount(container,
    el('div', { class: 'strategy' },
      el('p', { class: 'strategy__label', text: t('skill.strategy') }),
      el('p', { class: 'strategy__text', text: skill.strategy[app.lang] || skill.strategy.en }),
    ),

    el('div', { class: 'card' },
      el('div', { class: 'row row--between' },
        el('h2', { class: 'flush', text: skill.title[app.lang] || skill.title.en }),
        record.mastered
          ? el('span', { class: 'chip chip--gold' },
              el('span', { 'aria-hidden': 'true', text: '⭐ ' }),
              t('dash.mastered'))
          : el('span', { class: 'chip', text: t('skill.stageOf', { n: stageIndex + 1, total: stages }) }),
      ),
      el('p', { class: 'muted flush', text: `${t('skill.standard')} ${skill.ccss}` }),
      el('div', { class: 'weekgoal weekgoal--inline' },
        el('div', { class: 'weekgoal__dots' },
          Array.from({ length: 5 }, (_, i) =>
            el('span', { class: 'dot', dataset: { filled: String(i < days.length) }, 'aria-hidden': 'true' })),
        ),
        el('p', { class: 'weekgoal__text' },
          days.length >= GOAL_DAYS
            ? t('dash.goalMetLong')
            : t('dash.goalProgress', { done: days.length, goal: GOAL_DAYS }),
        ),
      ),
    ),

    el('ul', { class: 'activities' },
      ACTIVITIES.map((a) =>
        el('li', {},
          el('button', {
            class: 'activity',
            dataset: { suggested: String(a.id === suggested) },
            onClick: () => app.go(`g/${grade}/${skillId}/${a.id}`),
          },
            el('span', { class: 'activity__icon', 'aria-hidden': 'true', text: a.icon }),
            el('span', { class: 'activity__body' },
              el('span', { class: 'activity__name', text: t(`activity.${a.id}`) }),
              el('span', { class: 'activity__sub', text: t('dash.aboutMin', { n: MINUTES[a.id] }) }),
            ),
            a.id === suggested
              ? el('span', { class: 'activity__next', text: t('skill.nextUp') })
              : el('span', { 'aria-hidden': 'true', class: 'activity__chev', text: '›' }),
          ),
        ),
      ),
    ),

    el('button', {
      class: 'btn btn--soft btn--block',
      onClick: () => app.go(`g/${grade}/${skillId}/family`),
    }, t('skill.forGrownUps')),
  );
}
