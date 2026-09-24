// The grade dashboard: the Today card, then the skill cards.
//
// This is the screen that has to answer "where am I, what do I do, what's
// next" without reading. Today is visually dominant; everything else is
// quieter. Skills are recommended, never locked -- padlocks are what made the
// old level ladder feel like a corridor.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { loadGrade, gradeMeta, loadIndex } from '../engine/curriculum.js';
import { loadProgress, skillRecord, daysThisWeek, skillProgress, GOAL_DAYS } from '../engine/model.js';
import { todayPlan, currentSkill, MINUTES } from '../engine/scheduler.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const [data, meta] = await Promise.all([loadGrade(grade), gradeMeta(grade)]);
  const skills = data.skills;

  // Each grade carries its own accent so a child can tell "my grade" at a
  // glance without reading the number.
  document.documentElement.style.setProperty('--grade-accent', meta.accent);

  const progress = loadProgress(app.profile.id);
  const plan = todayPlan(app.profile.id, skills);
  const recommended = currentSkill(progress, skills);

  mount(container,
    todayCard(app, grade, plan),
    weekStrip(progress, plan),
    el('h2', { class: 'section-head', text: t('dash.skills') }),
    el('ul', { class: 'skills' },
      skills.map((skill) => skillCard(app, grade, skill, progress, skill.id === recommended?.id)),
    ),
    otherGrades(app, grade),
  );
}

/**
 * The Today card. One tap, plain words, and the time it takes -- a parent
 * deciding whether there is time before dinner needs the number.
 */
function todayCard(app, grade, plan) {
  if (!plan) {
    return el('div', { class: 'today today--empty' },
      el('p', { text: t('dash.noSkills') }),
    );
  }

  const { skill, activity, minutes, goalMet } = plan;

  return el('button', {
    class: 'today',
    onClick: () => app.go(`g/${grade}/${skill.id}/${activity}`),
  },
    el('span', { class: 'today__label', text: t('dash.today') }),
    el('span', { class: 'today__what', text: t(`activity.${activity}`) }),
    el('span', { class: 'today__skill', text: skill.title[app.lang] || skill.title.en }),
    el('span', { class: 'today__meta' },
      el('span', { class: 'today__mins', text: t('dash.aboutMin', { n: minutes }) }),
      goalMet ? el('span', { class: 'today__goal', text: `⭐ ${t('dash.goalMet')}` }) : null,
    ),
    el('span', { class: 'today__go', 'aria-hidden': 'true', text: '▶' }),
  );
}

/** The week's dots. Missing days are simply not filled -- never marked wrong. */
function weekStrip(progress, plan) {
  const done = plan ? plan.daysThisWeek : 0;
  const dots = [];
  for (let i = 0; i < 5; i++) {
    dots.push(el('span', {
      class: 'dot',
      dataset: { filled: String(i < done) },
      'aria-hidden': 'true',
    }));
  }
  return el('div', { class: 'weekgoal' },
    el('div', { class: 'weekgoal__dots' }, dots),
    el('p', { class: 'weekgoal__text' },
      done >= GOAL_DAYS
        ? t('dash.goalMetLong')
        : t('dash.goalProgress', { done, goal: GOAL_DAYS }),
    ),
  );
}

/**
 * A skill card: title, a 3-segment stage bar (one per stage, not a percentage),
 * and a mastery badge. "Recommended next" replaces the old padlock.
 */
function skillCard(app, grade, skill, progress, isRecommended) {
  const record = progress.skills[skill.id];
  const stages = skill.stages.length;
  const reached = record?.mastered ? stages : (record?.stage ?? 0);

  const segments = el('span', { class: 'stagebar', 'aria-hidden': 'true' },
    Array.from({ length: stages }, (_, i) =>
      el('span', { class: 'stagebar__seg', dataset: { on: String(i < reached) } }),
    ),
  );

  return el('li', {},
    el('button', {
      class: 'skillcard',
      dataset: { mastered: String(Boolean(record?.mastered)) },
      onClick: () => app.go(`g/${grade}/${skill.id}`),
    },
      el('span', { class: 'skillcard__head' },
        el('span', { class: 'skillcard__title', text: skill.title[app.lang] || skill.title.en }),
        record?.mastered
          ? el('span', { class: 'skillcard__badge', title: t('dash.mastered') },
              el('span', { 'aria-hidden': 'true', text: '⭐' }),
              el('span', { class: 'visually-hidden', text: t('dash.mastered') }))
          : null,
      ),
      segments,
      el('span', { class: 'visually-hidden', text: t('dash.stageOf', { done: reached, total: stages }) }),
      isRecommended && !record?.mastered
        ? el('span', { class: 'skillcard__next', text: t('dash.recommended') })
        : null,
    ),
  );
}

/**
 * One grade below for review, one above for a challenge. Deliberately small
 * and at the bottom: a prominent grade switcher invites a child to wander
 * instead of practising.
 */
function otherGrades(app, grade) {
  const links = [];
  if (grade > 1) links.push([grade - 1, t('dash.review')]);
  if (grade < 8) links.push([grade + 1, t('dash.challenge')]);
  if (!links.length) return null;

  return el('details', { class: 'othergrades' },
    el('summary', { text: t('dash.otherGrades') }),
    el('div', { class: 'row' },
      links.map(([n, label]) =>
        el('button', {
          class: 'btn btn--ghost btn--small',
          onClick: () => app.go(`g/${n}`),
        }, `${t('grade.label', { n })} · ${label}`),
      ),
    ),
  );
}
