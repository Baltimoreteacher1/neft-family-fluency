// One week: the strategy, the 5-day goal strip, and the four activities.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { loadProgress, weekRecord } from '../engine/progress.js';

const DAY_KEYS = ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri'];

export async function render(container, app, match) {
  const weekNumber = Number(match[1]);
  const week = app.weekByNumber(weekNumber);
  if (!week) throw new Error(`No week ${weekNumber}`);

  const progress = loadProgress(app.profile.id);
  const rec = weekRecord(progress, weekNumber);
  const goal = app.curriculum.defaults.goal;
  const lang = app.settings.lang;

  const daysDone = rec.days.length;
  const goalMet = daysDone >= goal.daysPerWeek;

  // The strip shows how many days are done, not which weekday each was: a
  // family practising Saturday and Sunday has practised, and a calendar that
  // greys out their weekend would say otherwise.
  const strip = el('ul', { class: 'days', 'aria-label': t('week.goal') },
    DAY_KEYS.map((key, i) =>
      el('li', { dataset: { done: String(i < daysDone) }, text: t(key) }),
    ),
  );

  // The Friday Check stays shut until there has been some practice: a cold
  // 20-item assessment on Monday measures nothing anyone wants measured.
  const practised = rec.attempts.length > 0 || daysDone > 0;

  const activities = [
    { key: 'learn', icon: '\u{1F4A1}', to: `week/${weekNumber}/learn`, done: false, enabled: true },
    { key: 'practice', icon: '✏️', to: `week/${weekNumber}/practice`, done: practised, enabled: true },
    { key: 'play', icon: '\u{1F3AE}', to: `week/${weekNumber}/play`, done: false, enabled: true },
    {
      key: 'check', icon: '✅', to: `week/${weekNumber}/check`,
      done: Boolean(rec.check), enabled: practised,
      lockedNote: t('week.checkLocked'),
    },
  ];

  mount(container,
    el('div', { class: 'strategy' },
      el('p', { class: 'strategy__label', style: 'margin:0', text: t('week.strategyLabel') }),
      el('p', { class: 'strategy__text', text: week.strategy[lang] || week.strategy.en }),
    ),
    el('div', { class: 'card' },
      el('h2', { text: week.title[lang] || week.title.en }),
      strip,
      el('p', { class: 'muted', style: 'margin:0' },
        goalMet ? `⭐ ${t('week.goalMet')}` : t('week.daysDone', { done: daysDone, goal: goal.daysPerWeek }),
      ),
    ),
    el('ul', { class: 'activities' },
      activities.map((a) =>
        el('li', {},
          el('button', {
            class: 'activity',
            disabled: !a.enabled,
            onClick: () => a.enabled && app.go(a.to),
          },
            el('span', { class: 'activity__icon', 'aria-hidden': 'true', text: a.icon }),
            el('span', {},
              el('span', { class: 'activity__name', text: t(`week.${a.key}`) }),
              el('br'),
              el('span', { class: 'activity__sub', text: a.enabled ? t(`week.${a.key}Sub`) : a.lockedNote }),
            ),
            a.done
              ? el('span', { class: 'activity__tick', 'aria-label': t('app.done'), text: '✓' })
              : el('span', { 'aria-hidden': 'true', text: '›' }),
          ),
        ),
      ),
    ),
    el('div', { class: 'card' },
      el('a', { class: 'btn btn--soft btn--block', href: `family/?week=${weekNumber}` },
        t('week.familyCard')),
    ),
  );
}
