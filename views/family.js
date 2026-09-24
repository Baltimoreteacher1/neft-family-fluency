// "For grown-ups", now inside the app shell rather than at its own URL.
//
// It used to live at /family/?week=N, which made it feel like a different
// site. It is the same app, the same header, the same Back button -- a parent
// who taps it can get back to their child's dashboard without the browser.

import { el, mount } from '../engine/dom.js';
import { t } from '../engine/i18n.js';
import { findSkill } from '../engine/curriculum.js';
import { GOAL_DAYS } from '../engine/model.js';

export async function render(container, app, match) {
  const grade = Number(match[1]);
  const skillId = match[2];
  const skill = await findSkill(grade, skillId);
  if (!skill) throw new Error(`No skill ${skillId}`);

  const lang = app.lang;
  const pick = (o) => o?.[lang] ?? o?.en;
  const family = skill.family || {};

  const dayPlan = [
    t('activity.learn'), t('activity.practice'), t('activity.play'),
    t('activity.practice'), t('activity.check'),
  ];
  const dayNames = ['days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri'];

  mount(container,
    el('div', { class: 'card' },
      el('p', { class: 'strategy__label', text: skill.title[lang] || skill.title.en }),
      el('h2', { text: t('family.why') }),
      el('p', { text: pick(family.why) || t('family.noContent') }),
    ),

    family.say
      ? el('div', { class: 'card' },
          el('h2', { text: t('family.sayThis') }),
          el('ul', { class: 'say-list' }, pick(family.say).map((line) => el('li', { text: line }))),
        )
      : null,

    // The most important block on the page. A family who believes their own
    // method is wrong stops helping at all.
    el('div', { class: 'callout' },
      el('h3', { class: 'flush', text: t('family.okYourWay') }),
      el('p', { class: 'flush', text: t('family.okYourWayBody') }),
    ),

    el('div', { class: 'card' },
      el('h2', { text: t('family.fiveDays') }),
      el('ol', { class: 'say-list' },
        dayNames.map((d, i) =>
          el('li', {}, el('strong', { text: `${t(d)}: ` }), dayPlan[i]),
        ),
      ),
      el('p', { class: 'muted', text: t('family.goal', { n: GOAL_DAYS }) }),
    ),

    family.game
      ? el('div', { class: 'card' },
          el('h2', { text: t('family.game') }),
          el('h3', { text: pick(family.game.name) }),
          el('p', {}, el('strong', { text: `${t('family.needs')}: ` }), pick(family.game.needs)),
          el('p', { class: 'flush' }, el('strong', { text: t('family.howToPlay') })),
          el('ol', { class: 'say-list' }, pick(family.game.how).map((s) => el('li', { text: s }))),
        )
      : null,

    el('div', { class: 'card no-print' },
      el('div', { class: 'row' },
        el('button', { class: 'btn', onClick: () => window.print() }, t('family.print')),
        el('button', {
          class: 'btn btn--ghost',
          onClick: () => app.go(`g/${grade}/${skillId}`),
        }, t('family.backToPractice')),
      ),
      el('p', { class: 'muted', text: `${app.config.TEACHER_NAME} · ${app.config.SCHOOL_NAME}` }),
    ),
  );
}
