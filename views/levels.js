// The level map: one row per week, showing where the child is and what they
// have earned. Never labelled with a grade.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { loadProgress, currentWeek, isUnlocked } from '../engine/progress.js';

export async function render(container, app) {
  const profile = app.profile;
  const progress = loadProgress(profile.id);
  const here = currentWeek(profile.id, app.totalWeeks);

  const rows = app.curriculum.weeks.map((week) => {
    const rec = progress.weeks[String(week.week)];
    const unlocked = isUnlocked(profile.id, week.week, app.totalWeeks);
    const done = Boolean(rec?.badge);
    const state = done ? 'done' : unlocked ? 'open' : 'locked';

    return el('li', {},
      el('button', {
        class: 'level',
        dataset: { state },
        disabled: !unlocked,
        'aria-current': week.week === here ? 'step' : null,
        onClick: () => unlocked && app.go(`week/${week.week}`),
      },
        el('span', { class: 'level__num', 'aria-hidden': 'true', text: String(week.level) }),
        el('span', {},
          el('span', { class: 'level__title', text: t('levels.level', { n: week.level }) }),
          el('br'),
          el('span', { class: 'level__sub', text: week.title[app.settings.lang] || week.title.en }),
          !unlocked
            ? el('span', { class: 'level__sub', text: ` — ${t('levels.locked', { n: week.level - 1 })}` })
            : week.week === here
              ? el('span', { class: 'level__sub', text: ` — ${t('levels.current')}` })
              : null,
        ),
        el('span', { class: 'level__badge', 'aria-hidden': 'true', text: done ? '⭐' : '' }),
        done ? el('span', { class: 'visually-hidden', text: t('levels.complete') }) : null,
      ),
    );
  });

  mount(container,
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'align-items:center;justify-content:space-between;margin-bottom:12px' },
        el('h2', { style: 'margin:0', text: `${profile.avatar} ${profile.nickname}` }),
        el('button', { class: 'btn btn--ghost btn--small', onClick: () => app.go('') }, t('profiles.switch')),
      ),
      el('ul', { class: 'levels' }, rows),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('a', { class: 'btn btn--ghost', href: 'family/' }, t('week.familyCard')),
        el('a', { class: 'btn btn--ghost', href: app.config.HUB_URL, rel: 'noopener' }, t('app.moreFrom')),
      ),
    ),
  );
}
